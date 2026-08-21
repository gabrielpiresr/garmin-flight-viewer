import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { account, DEFAULT_SCHOOL_ID, ID } from "../lib/appwrite";
import {
  ensureProfile,
  getProfile,
  listProfileDocumentAttachments,
  uploadProfileDocumentAttachment,
  uploadProfileDocumentAttachments,
  type PilotProfile,
  type ProfileDocumentAttachment,
} from "../lib/rbac";
import { executeAnacSync } from "../lib/anacSync";
import { getLeadByToken, moveLeadToCrmStatus } from "../lib/crmDb";
import { runRegistrationEnrollmentAutomation } from "../lib/adminUsersDb";
import { listContractsForUser, signContractViaAdminFunction } from "../lib/contractsDb";
import {
  getInstructorAdmissionCandidateByRegistrationToken,
  registrationLinkOptionsFromResponses,
  updateInstructorAdmissionCandidate,
} from "../lib/instructorAdmissionDb";
import {
  hasRegistrationOnboarding,
  loadOnboardingPersist,
  needsRegistrationBooking,
  needsRegistrationPayment,
  ONBOARDING_COL_CLASS,
  onboardingViewFromPath,
  pushOnboardingView,
  replaceOnboardingView,
  RegistrationChecklistCards,
  RegistrationPaymentView,
  RegistrationReadyView,
  saveOnboardingPersist,
  useRegistrationPaymentStatus,
  type OnboardingView,
  type RegistrationBookingSummary,
} from "../components/cadastro/RegistrationOnboarding";
import { getCachedBrandSettings } from "../lib/notificationsDb";
import {
  getInitialRegistrationSchedule,
  requestInitialRegistrationFlight,
  type PublicBlockedSlot,
  type PublicScheduleAircraft,
  type PublicScheduleFlight,
} from "../lib/scheduleBookingDb";
import { buildMergedRegistrationSlots, formatRegistrationDayLabel } from "../lib/registrationScheduleSlots";
import type { FlightScheduleRules } from "../types/schoolRules";
import type { CrmLead } from "../types/crm";
import { DEFAULT_REGISTRATION_LINK_OPTIONS, type RegistrationLinkOptions } from "../types/instructorAdmission";
import type { ProfileDocumentType } from "../lib/rbac";
import type { Contract } from "../types/contracts";
import { CONTRACT_STATUS_COLORS, CONTRACT_STATUS_LABELS } from "../types/contracts";
import { ContractViewSignModal } from "../components/ContractViewSignModal";

/** Convite de cadastro — CRM ou admissão de instrutor (mesmo /cadastro?token=). */
type CadastroInvite = {
  source: "crm" | "instructor";
  id: string;
  email: string;
  name: string;
  phone: string | null;
  userId: string | null;
  referrerUserId: string | null;
  cpf: string | null;
  birthDate: string | null;
  weightKg: number | null;
  heightCm: number | null;
  anacCode: string | null;
};

function onlyDigits(v: string) { return v.replace(/\D/g, ""); }

function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function addDaysIso(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function todayBrIso(): string {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

function brDateTime(date: string, time: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m} às ${time}`;
}

function friendlyRegistrationBookingError(message: string): string {
  if (/aluno.*possui voo|voo.*aluno|sobrepost|conflito/i.test(message)) {
    return "Não foi possível reservar esse encaixe porque a agenda apontou conflito para o aluno. Escolha outro horário livre ou tente novamente em instantes.";
  }
  return message;
}

function formatRegistrationRetryError(error: unknown): string {
  const detail = error instanceof Error ? error.message : "";
  const hint = "Revise principalmente CPF, data de nascimento e código ANAC, ajuste o que estiver incorreto e tente novamente.";
  return detail
    ? `Não foi possível preparar sua matrícula com esses dados. ${hint} Detalhe: ${detail}`
    : `Não foi possível preparar sua matrícula com esses dados. ${hint}`;
}

function RegistrationSchedulePlanTable({
  groundStart,
  groundEnd,
  presentationTime,
  flightStart,
  cutoffTime,
  endTime,
}: {
  groundStart: string;
  groundEnd?: string;
  presentationTime: string;
  flightStart: string;
  cutoffTime?: string;
  endTime: string;
}) {
  const rows = [
    ["Início do Ground", groundStart],
    ["Fim do Ground", groundEnd || presentationTime],
    ["Início do voo", presentationTime],
    ["Acionamento", flightStart],
    ["Corte", cutoffTime || endTime],
    ["Fim do voo", endTime],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
      <table className="w-full text-left text-xs">
        <tbody className="divide-y divide-slate-800">
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th className="w-1/2 px-3 py-2 font-medium text-slate-500">{label}</th>
              <td className="px-3 py-2 font-semibold text-slate-200">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RegistrationFirstFlightScheduler({
  onBack,
  onBooked,
}: {
  onBack?: () => void;
  onBooked?: (booking: RegistrationBookingSummary) => void;
} = {}) {
  const [aircrafts, setAircrafts] = useState<PublicScheduleAircraft[]>([]);
  const [flights, setFlights] = useState<PublicScheduleFlight[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<PublicBlockedSlot[]>([]);
  const [scheduleRules, setScheduleRules] = useState<FlightScheduleRules | undefined>();
  const [groundRegistration, setGroundRegistration] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(addDaysIso(todayBrIso(), 2));
  const [selectedTime, setSelectedTime] = useState("");
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<RegistrationBookingSummary | null>(null);

  useEffect(() => {
    const from = addDaysIso(todayBrIso(), 2);
    const to = addDaysIso(from, 21);
    void getInitialRegistrationSchedule(from, to)
      .then((data) => {
        setAircrafts(data.aircrafts.slice(0, 2));
        setFlights(data.flights);
        setBlockedSlots(data.blockedSlots ?? []);
        setScheduleRules(data.rules);
        setGroundRegistration(data.groundRegistration ?? null);
        setSelectedDate(data.minDate || from);
      })
      .catch((e) => setScheduleError((e as Error).message || "Não foi possível carregar a escala."))
      .finally(() => setLoadingSchedule(false));
  }, []);

  const dates = useMemo(
    () => Array.from({ length: 14 }, (_, index) => addDaysIso(addDaysIso(todayBrIso(), 2), index)),
    [],
  );
  const availableDates = useMemo(() => {
    const aircraftIdents = aircrafts.map((aircraft) => aircraft.registration);
    if (!aircraftIdents.length) return [];
    return dates.filter((date) => buildMergedRegistrationSlots({
      date,
      aircraftIdents,
      flights,
      blockedSlots,
      groundRegistration,
      rules: scheduleRules,
    }).length > 0);
  }, [aircrafts, blockedSlots, dates, flights, groundRegistration, scheduleRules]);
  const slots = useMemo(
    () => buildMergedRegistrationSlots({
      date: selectedDate,
      aircraftIdents: aircrafts.map((aircraft) => aircraft.registration),
      flights,
      blockedSlots,
      groundRegistration,
      rules: scheduleRules,
    }),
    [aircrafts, blockedSlots, flights, groundRegistration, scheduleRules, selectedDate],
  );
  const selectedSlot = slots.find((slot) => slot.startTime === selectedTime) ?? null;

  useEffect(() => {
    if (!availableDates.length) return;
    if (availableDates.includes(selectedDate)) return;
    setSelectedDate(availableDates[0]);
    setConfirming(false);
  }, [availableDates, selectedDate]);

  useEffect(() => {
    if (selectedSlot) return;
    setSelectedTime(slots[0]?.startTime ?? "");
    setConfirming(false);
  }, [selectedSlot, slots]);

  async function book() {
    if (!selectedSlot) return;
    setBooking(true);
    setScheduleError(null);
    const idents = selectedSlot.aircraftIdents.length ? selectedSlot.aircraftIdents : [selectedSlot.aircraftIdent];
    let lastMessage = "Não foi possível reservar este horário.";
    try {
      for (const aircraftIdent of idents) {
        try {
          const result = await requestInitialRegistrationFlight({
            aircraftIdent,
            flightDate: selectedDate,
            startTime: selectedSlot.startTime,
          });
          const summary: RegistrationBookingSummary = {
            date: result.nextSteps.flightDate,
            groundStart: result.nextSteps.groundStartTime,
            groundEnd: result.nextSteps.groundEndTime ?? selectedSlot.groundEndTime,
            flightStart: result.nextSteps.flightStartTime,
            aircraftIdent,
            presentationTime: result.nextSteps.presentationTime ?? selectedSlot.presentationTime,
            cutoffTime: result.nextSteps.cutoffTime ?? selectedSlot.cutoffTime,
            endTime: result.nextSteps.endTime ?? selectedSlot.endTime,
          };
          setBooked(summary);
          onBooked?.(summary);
          setConfirming(false);
          return;
        } catch (e) {
          lastMessage = (e as Error).message || lastMessage;
          if (!/já possui|indispon|ocupad|conflito|intervalo/i.test(lastMessage)) throw e;
        }
      }
      setScheduleError(/a[cç][aã]o inv[aá]lida/i.test(lastMessage)
        ? "Não foi possível concluir o agendamento agora. Volte ao checklist e tente novamente em instantes."
        : friendlyRegistrationBookingError(lastMessage));
    } catch (e) {
      const message = (e as Error).message || lastMessage;
      setScheduleError(/a[cç][aã]o inv[aá]lida/i.test(message)
        ? "Não foi possível concluir o agendamento agora. Volte ao checklist e tente novamente em instantes."
        : friendlyRegistrationBookingError(message));
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="w-full text-left">
      {onBack ? (
        <button type="button" onClick={onBack} className="text-xs text-slate-500 hover:text-slate-300">
          ← Voltar ao checklist
        </button>
      ) : null}
      <h2 className="mt-3 text-lg font-semibold text-slate-100">Agendar Ground + primeiro voo</h2>
      {loadingSchedule ? (
        <p className="mt-2 text-sm text-slate-400">Carregando horários...</p>
      ) : scheduleError && !slots.length && !booked ? (
        <p className="mt-2 text-sm text-amber-300">{scheduleError}</p>
      ) : booked ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-emerald-200">Horário reservado para {brDateTime(booked.date, booked.groundStart)}.</p>
          <RegistrationSchedulePlanTable
            groundStart={booked.groundStart}
            groundEnd={booked.groundEnd}
            presentationTime={booked.presentationTime || booked.flightStart}
            flightStart={booked.flightStart}
            cutoffTime={booked.cutoffTime}
            endTime={booked.endTime || booked.flightStart}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {availableDates.length ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Dias com horário livre</span>
              <select
                value={availableDates.includes(selectedDate) ? selectedDate : availableDates[0]}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setConfirming(false);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              >
                {availableDates.map((date) => (
                  <option key={date} value={date}>{formatRegistrationDayLabel(date)}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                Só entram nesta lista os dias que ainda têm vaga. Os outros não aparecem porque já estão ocupados.
              </p>
            </label>
          ) : (
            <p className="text-sm text-slate-400">Não há dias com horário livre nos próximos 14 dias.</p>
          )}
          {availableDates.length > 0 && slots.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((slot) => (
                <button
                  key={slot.startTime}
                  type="button"
                  onClick={() => {
                    setSelectedTime(slot.startTime);
                    setConfirming(false);
                  }}
                  className={`rounded-lg border px-2 py-2 text-xs ${selectedTime === slot.startTime ? "border-cyan-400 bg-cyan-500/15 text-cyan-100" : "border-slate-700 text-slate-300"}`}
                >
                  {slot.presentationTime}–{slot.endTime}
                </button>
              ))}
            </div>
          ) : null}
          {selectedSlot ? (
            <>
              <RegistrationSchedulePlanTable
                groundStart={selectedSlot.groundStartTime}
                groundEnd={selectedSlot.groundEndTime}
                presentationTime={selectedSlot.presentationTime}
                flightStart={selectedSlot.startTime}
                cutoffTime={selectedSlot.cutoffTime}
                endTime={selectedSlot.endTime}
              />
              {scheduleError ? <p className="text-xs text-amber-300">{scheduleError}</p> : null}
              {confirming ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">
                    Confirmar esse plano para {brDateTime(selectedDate, selectedSlot.groundStartTime)}?
                  </p>
                  <div className="flex gap-2">
                    <button type="button" disabled={booking} onClick={() => void book()} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {booking ? "Reservando..." : "Confirmar"}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-slate-200">
                      Voltar
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="w-full rounded-lg bg-cyan-600 px-3 py-2.5 text-sm font-semibold text-white">
                  Selecionar horário
                </button>
              )}
            </>
          ) : scheduleError ? (
            <p className="text-xs text-amber-300">{scheduleError}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

const BRAZIL_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const ESCOLARIDADE_OPTIONS = [
  "Ensino Fundamental",
  "Ensino Médio",
  "Ensino Superior",
  "Pós-graduação",
  "Mestrado",
  "Doutorado",
];

const TEST_STEP1: Step1 = {
  fullName: "Aluno Teste EPEAC",
  cpf: "529.982.247-25",
  phone: "(11) 99999-0001",
  birthDate: "1998-05-12",
  weightKg: "78",
  heightCm: "176",
  anacCode: "264933",
};

const TEST_STEP2: Step2 = {
  rg: "45.678.912-3",
  rgOrgaoExpedidor: "SSP/SP",
  rgDataEmissao: "2018-04-10",
  nacionalidade: "Brasileiro(a)",
  estadoCivil: "Solteiro(a)",
  endereco: "Rua de Teste, 123 - Centro",
  cep: "01001-000",
  cidade: "São Paulo",
  uf: "SP",
  password: "Teste1234",
};

const TEST_STEP3: Step3 = {
  sexo: "F",
  naturalidade: "São Paulo",
  filiacaoPai: "Pai do Aluno Teste",
  filiacaoMae: "Mãe do Aluno Teste",
  escolaridade: "Ensino Médio",
  escolaridadePeriodo: "",
  escolaridadeCurso: "",
  alergiasMedicamentos: "Nenhuma",
  emergenciaNome: "Contato de Emergência",
  emergenciaParentesco: "Mãe",
  emergenciaEndereco: "Rua de Teste, 123 - Centro",
  emergenciaTelefone: "(11) 98888-0001",
};

function makeTestDocument(name: string): File {
  return new File([`Documento de teste: ${name}\n`], name, { type: "application/pdf" });
}

function makeTestDocuments(): DocFiles {
  return {
    identification: makeTestDocument("documento-identificacao-teste.pdf"),
    voterTitle: makeTestDocument("titulo-eleitor-teste.pdf"),
    proofOfResidence: makeTestDocument("comprovante-residencia-teste.pdf"),
    militaryCertificate: null,
    enrollmentForm: null,
    schoolCertificate: makeTestDocument("comprovante-escolaridade-teste.pdf"),
    transferDocument: null,
  };
}

function queryFlag(params: URLSearchParams, key: string): boolean {
  const value = params.get(key)?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "sim" || value === "yes";
}

function registrationLinkOptionsFromParams(params: URLSearchParams): RegistrationLinkOptions {
  const chargeGround = queryFlag(params, "chargeGround");
  const chargeEnrollment = queryFlag(params, "chargeEnrollment");
  const chargeTransfer = queryFlag(params, "chargeTransfer");
  return {
    allowCheckout: chargeGround || chargeEnrollment || chargeTransfer || queryFlag(params, "allowCheckout"),
    chargeGround,
    chargeEnrollment,
    chargeTransfer,
    allowFirstFlightBooking: queryFlag(params, "allowFirstFlightBooking"),
  };
}

type Step1 = {
  fullName: string;
  cpf: string;
  phone: string;
  birthDate: string;
  weightKg: string;
  heightCm: string;
  anacCode: string;
};

type Step2 = {
  rg: string;
  rgOrgaoExpedidor: string;
  rgDataEmissao: string;
  nacionalidade: string;
  estadoCivil: string;
  endereco: string;
  cep: string;
  cidade: string;
  uf: string;
  password: string;
};

type Step3 = {
  sexo: string;
  naturalidade: string;
  filiacaoPai: string;
  filiacaoMae: string;
  escolaridade: string;
  escolaridadePeriodo: string;
  escolaridadeCurso: string;
  alergiasMedicamentos: string;
  emergenciaNome: string;
  emergenciaParentesco: string;
  emergenciaEndereco: string;
  emergenciaTelefone: string;
};

type DocFiles = {
  identification: File | null;
  voterTitle: File | null;
  proofOfResidence: File | null;
  militaryCertificate: File | null;
  enrollmentForm: File | null;
  schoolCertificate: File | null;
  transferDocument: File | null;
};

// ─── Definições de documentos ────────────────────────────────────────────────

type DocumentDef = {
  type: ProfileDocumentType;
  label: string;
  required: boolean;
  description: string;
  hint: string;
};

const DOC_DEFS: DocumentDef[] = [
  {
    type: "identification",
    label: "Documento de Identificação",
    required: true,
    description: "RG ou CNH (Carteira Nacional de Habilitação)",
    hint: "Envie frente e verso juntos em um único arquivo. Pode ser PDF ou foto (JPG/PNG). O documento deve estar legível e dentro do prazo de validade.",
  },
  {
    type: "voterTitle",
    label: "Título de Eleitor",
    required: true,
    description: "Título de eleitor físico ou e-Título",
    hint: "Envie frente e verso do título físico, ou uma captura de tela nítida do aplicativo e-Título. Aceitamos PDF, JPG ou PNG.",
  },
  {
    type: "proofOfResidence",
    label: "Comprovante de Residência",
    required: true,
    description: "Conta de água, luz, gás ou fatura bancária",
    hint: "O documento deve ter no máximo 90 dias de emissão e estar em seu nome ou de um familiar direto (com declaração). PDF, JPG ou PNG.",
  },
  {
    type: "militaryCertificate",
    label: "Certidão Militar",
    required: false,
    description: "Certificado de Dispensa de Incorporação (CDI) ou Certificado de Reservista",
    hint: "Obrigatório para cidadãos do sexo masculino nascidos após 1980. Caso não se aplique a você, pode pular este documento. PDF, JPG ou PNG.",
  },
  {
    type: "schoolCertificate",
    label: "Comprovante de Escolaridade",
    required: true,
    description: "Histórico escolar, diploma ou declaração de matrícula",
    hint: "Envie o documento que comprova sua escolaridade (histórico escolar, diploma de ensino médio/superior ou declaração de conclusão). PDF, JPG ou PNG.",
  },
];

const TRANSFER_DOC_DEF: DocumentDef = {
  type: "transferDocument",
  label: "Documento da transferência",
  required: false,
  description: "Declaração, histórico ou documento equivalente da escola de origem",
  hint: "Envie o documento que comprove ou detalhe sua transferência. Esta etapa ajuda a equipe a validar seu processo, mas não bloqueia o pagamento.",
};
const TRANSFER_DOCUMENT_LIMIT = 10;

function formatFileSize(bytes: number): string {
  if (!bytes) return "Tamanho indisponível";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Componente de upload de documento ───────────────────────────────────────

function DocUploadField({
  def,
  file,
  onChange,
}: {
  def: DocumentDef;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(f.type)) {
      alert("Formato inválido. Envie PDF, JPG ou PNG.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      alert("Arquivo muito grande. Máximo 10 MB.");
      return;
    }
    onChange(f);
  }

  return (
    <div className={`rounded-xl border p-4 transition ${file ? "border-emerald-600/50 bg-emerald-950/20" : "border-slate-600 bg-slate-950/40"}`}>
      {/* Título e badge */}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-100">{def.label}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${def.required ? "bg-red-900/60 text-red-300" : "bg-slate-700 text-slate-400"}`}>
          {def.required ? "Obrigatório" : "Opcional"}
        </span>
      </div>

      {/* Descrição */}
      <p className="mb-1 text-xs font-medium text-slate-400">{def.description}</p>
      <p className="mb-3 text-xs text-slate-500 leading-relaxed">{def.hint}</p>

      {/* Zona de upload */}
      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-950/30 px-3 py-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-emerald-400">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <span className="flex-1 truncate text-xs text-emerald-300">{file.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-slate-500 hover:text-red-400 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-3 py-4 text-center transition ${dragOver ? "border-sky-500 bg-sky-950/30" : "border-slate-600 hover:border-slate-500"}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mb-1.5 h-6 w-6 text-slate-500">
            <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06l-3.22-3.22V16.5a.75.75 0 01-1.5 0V4.81L8.03 8.03a.75.75 0 01-1.06-1.06l4.5-4.5zM3 15.75a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-slate-400">Clique ou arraste o arquivo aqui</p>
          <p className="text-[10px] text-slate-600 mt-0.5">PDF, JPG ou PNG — máx. 10 MB</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function TransferDocumentsUploadField({
  files,
  documents,
  remainingSlots,
  onFilesSelected,
  onRemoveFile,
}: {
  files: File[];
  documents: ProfileDocumentAttachment[];
  remainingSlots: number;
  onFilesSelected: (files: FileList | File[]) => void;
  onRemoveFile: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const reachedLimit = remainingSlots <= 0;

  function handleSelect(filesToAdd: FileList | null) {
    if (!filesToAdd || filesToAdd.length === 0) return;
    onFilesSelected(filesToAdd);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100">{TRANSFER_DOC_DEF.label}</p>
            <p className="mt-1 text-xs font-medium text-slate-400">{TRANSFER_DOC_DEF.description}</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
            {documents.length}/{TRANSFER_DOCUMENT_LIMIT}
          </span>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">{TRANSFER_DOC_DEF.hint}</p>

        {documents.length > 0 ? (
          <div className="mb-3 space-y-2">
            {documents.map((document) => (
              <div key={document.docId || document.fileId} className="flex items-center gap-2 rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-3 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-emerald-400">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-emerald-200">{document.fileName}</p>
                  <p className="text-[10px] text-emerald-300/70">{formatFileSize(document.size)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {reachedLimit ? (
          <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-3 py-3 text-xs text-emerald-200">
            Limite de 10 documentos atingido.
          </div>
        ) : (
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-3 py-4 text-center transition ${dragOver ? "border-sky-500 bg-sky-950/30" : "border-slate-600 hover:border-slate-500"}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleSelect(e.dataTransfer.files); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mb-1.5 h-6 w-6 text-slate-500">
              <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06l-3.22-3.22V16.5a.75.75 0 01-1.5 0V4.81L8.03 8.03a.75.75 0 01-1.06-1.06l4.5-4.5zM3 15.75a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
            </svg>
            <p className="text-xs text-slate-400">Clique ou arraste os arquivos aqui</p>
            <p className="mt-0.5 text-[10px] text-slate-600">
              PDF, JPG ou PNG - max. 10 MB cada. Restam {remainingSlots} vaga(s).
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => handleSelect(e.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <div className="rounded-xl border border-sky-800/60 bg-sky-950/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">Pronto para enviar</p>
          <div className="mt-2 space-y-2">
            {files.map((file, index) => (
              <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{file.name}</span>
                <span className="shrink-0 text-[10px] text-slate-500">{formatFileSize(file.size)}</span>
                <button type="button" onClick={() => onRemoveFile(index)} className="shrink-0 text-slate-500 transition hover:text-red-300">
                  <span className="sr-only">Remover arquivo</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function contractNeedsStudentSignature(contract: Contract): boolean {
  return contract.status !== "cancelled" && !contract.signedByRecipientAt;
}

function RegistrationContractsStepView({
  contracts,
  loading,
  refreshing,
  onBack,
  onRefresh,
  onSigned,
}: {
  contracts: Contract[];
  loading: boolean;
  refreshing: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onSigned: (contract: Contract) => void;
}) {
  const [viewContract, setViewContract] = useState<Contract | null>(null);
  const [signingAll, setSigningAll] = useState(false);
  const [signAllError, setSignAllError] = useState<string | null>(null);
  const activeContracts = contracts.filter((contract) => contract.status !== "cancelled");
  const pendingContracts = activeContracts.filter(contractNeedsStudentSignature);
  const pendingCount = pendingContracts.length;

  async function handleSignAll() {
    if (!pendingContracts.length) return;
    if (!window.confirm(`Assinar ${pendingContracts.length} contrato(s) pendente(s)?`)) return;
    setSigningAll(true);
    setSignAllError(null);
    try {
      for (const contract of pendingContracts) {
        const updated = await signContractViaAdminFunction({
          contractId: contract.id,
          signerRole: "aluno",
        });
        onSigned(updated);
      }
      setViewContract(null);
    } catch (error) {
      setSignAllError(error instanceof Error ? error.message : "Não foi possível assinar todos os contratos.");
    } finally {
      setSigningAll(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900 p-6 text-left">
      <button type="button" onClick={onBack} className="text-xs text-slate-500 hover:text-slate-300">
        ← Voltar ao checklist
      </button>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Assinatura de contratos</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            Revise e assine os documentos da matrícula. Cada assinatura fica registrada digitalmente na plataforma.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pendingCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleSignAll()}
              disabled={signingAll}
              className="rounded-lg border border-emerald-800/50 bg-emerald-600/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-600/20 disabled:opacity-50"
            >
              {signingAll ? "Assinando..." : "Assinar todos"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing || signingAll}
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
          >
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {pendingCount > 0 ? (
        <div className="mt-5 rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-3">
          <p className="text-sm text-amber-200">
            {pendingCount === 1 ? "Você tem 1 documento aguardando assinatura." : `Você tem ${pendingCount} documentos aguardando assinatura.`}
          </p>
        </div>
      ) : null}
      {signAllError ? <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2 text-xs text-red-300">{signAllError}</p> : null}

      <div className="mt-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-16 animate-pulse rounded-xl border border-slate-800 bg-slate-950/50" />
            ))}
          </div>
        ) : activeContracts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 py-10 text-center">
            <p className="text-sm font-medium text-slate-300">Preparando seus contratos</p>
            <p className="mt-1 text-xs text-slate-500">A geração pode levar alguns instantes após o envio do cadastro.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeContracts.map((contract) => {
              const needsSignature = contractNeedsStudentSignature(contract);
              return (
                <div key={contract.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{contract.templateName}</p>
                      <span className={`rounded border px-2 py-0.5 text-xs ${CONTRACT_STATUS_COLORS[contract.status]}`}>
                        {CONTRACT_STATUS_LABELS[contract.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Emitido em {new Date(contract.createdAt).toLocaleDateString("pt-BR")}
                      {contract.signedByRecipientAt ? <> · Assinado por você em {new Date(contract.signedByRecipientAt).toLocaleDateString("pt-BR")}</> : null}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewContract(contract)}
                      className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                    >
                      Ver
                    </button>
                    {needsSignature ? (
                      <button
                        type="button"
                        onClick={() => setViewContract(contract)}
                        className="rounded-lg border border-emerald-800/50 px-2.5 py-1.5 text-xs text-emerald-400 transition hover:bg-emerald-950/40"
                      >
                        Assinar
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {pendingCount === 0 ? (
              <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-950/20 px-4 py-3">
                <p className="text-sm font-medium text-emerald-200">Contratos assinados</p>
                <p className="mt-1 text-xs text-emerald-300/80">Você já pode seguir para os próximos passos do checklist.</p>
                <button
                  type="button"
                  onClick={onBack}
                  className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Retornar ao checklist
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {viewContract ? (
        <ContractViewSignModal
          contract={viewContract}
          signerRole="aluno"
          onSigned={(updated) => {
            onSigned(updated);
            setViewContract(null);
          }}
          onClose={() => setViewContract(null)}
        />
      ) : null}
    </div>
  );
}

// ─── CadastroPage ─────────────────────────────────────────────────────────────

export function CadastroPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const isTestMode = params.get("istest")?.toLowerCase() === "true";

  const brand = getCachedBrandSettings();
  const schoolName = brand?.schoolName ?? "";
  const logoUrl = brand?.logoUrl ?? "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<CadastroInvite | null>(null);
  const [crmLead, setCrmLead] = useState<CrmLead | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [done, setDone] = useState(false);
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null);
  const [registrationOptions, setRegistrationOptions] = useState<RegistrationLinkOptions>(DEFAULT_REGISTRATION_LINK_OPTIONS);
  const [onboardingView, setOnboardingView] = useState<OnboardingView>(() => onboardingViewFromPath(window.location.pathname));
  const [booked, setBooked] = useState<RegistrationBookingSummary | null>(() => loadOnboardingPersist(token).booked ?? null);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("Aguarde...");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [s1, setS1] = useState<Step1>({ fullName: "", cpf: "", phone: "", birthDate: "", weightKg: "", heightCm: "", anacCode: "" });
  const [s2, setS2] = useState<Step2>({
    rg: "",
    rgOrgaoExpedidor: "",
    rgDataEmissao: "",
    nacionalidade: "Brasileiro(a)",
    estadoCivil: "",
    endereco: "",
    cep: "",
    cidade: "",
    uf: "",
    password: "",
  });
  const [s3, setS3] = useState<Step3>({
    sexo: "",
    naturalidade: "",
    filiacaoPai: "",
    filiacaoMae: "",
    escolaridade: "",
    escolaridadePeriodo: "",
    escolaridadeCurso: "",
    alergiasMedicamentos: "Nenhuma",
    emergenciaNome: "",
    emergenciaParentesco: "",
    emergenciaEndereco: "",
    emergenciaTelefone: "",
  });
  const [docs, setDocs] = useState<DocFiles>({ identification: null, voterTitle: null, proofOfResidence: null, militaryCertificate: null, enrollmentForm: null, schoolCertificate: null, transferDocument: null });
  const [transferProfile, setTransferProfile] = useState<PilotProfile | null>(null);
  const [transferFiles, setTransferFiles] = useState<File[]>([]);
  const [transferDocuments, setTransferDocuments] = useState<ProfileDocumentAttachment[]>([]);
  const [transferUploading, setTransferUploading] = useState(false);
  const [registrationContracts, setRegistrationContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsRefreshing, setContractsRefreshing] = useState(false);
  const [enrollmentAutomationRunning, setEnrollmentAutomationRunning] = useState(false);
  const groundMoveDone = useRef(false);

  const onboardingEnabled = hasRegistrationOnboarding(registrationOptions) || invite?.source === "crm";
  const needsPay = needsRegistrationPayment(registrationOptions);
  const needsBook = needsRegistrationBooking(registrationOptions);
  const isTransferRegistration = invite?.source === "crm" && Boolean(crmLead?.transferSchool || crmLead?.crmStatus === "aguardando_transferencia");
  const needsContracts = invite?.source === "crm";
  const transferDocumentDone = transferDocuments.length > 0 || Boolean(transferProfile?.documents.transferDocument);
  const transferRemainingSlots = Math.max(0, TRANSFER_DOCUMENT_LIMIT - transferDocuments.length);
  const activeRegistrationContracts = registrationContracts.filter((contract) => contract.status !== "cancelled");
  const contractsDone = !needsContracts || (activeRegistrationContracts.length > 0 && activeRegistrationContracts.every((contract) => !contractNeedsStudentSignature(contract)));
  const { paid, markPaid } = useRegistrationPaymentStatus({
    enabled: done && needsPay,
    token,
    userId: registeredUserId,
    chargeGround: registrationOptions.chargeGround,
    chargeEnrollment: registrationOptions.chargeEnrollment,
    chargeTransfer: registrationOptions.chargeTransfer,
  });
  const paymentDone = !needsPay || paid;
  const bookingDone = !needsBook || Boolean(booked);
  const transferDone = !isTransferRegistration || transferDocumentDone;
  const onboardingComplete = done && onboardingEnabled && paymentDone && bookingDone && transferDone && contractsDone;

  useEffect(() => {
    const onPopState = () => setOnboardingView(onboardingViewFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    setTransferFiles([]);
    setTransferDocuments([]);
    setTransferProfile(null);
    if (!registeredUserId || !isTransferRegistration) return;
    void Promise.all([
      getProfile(registeredUserId),
      listProfileDocumentAttachments(registeredUserId, "transferDocument"),
    ]).then(([{ data }, documents]) => {
      if (data) setTransferProfile(data);
      if (documents.length > 0) {
        setTransferDocuments(documents);
      } else if (data?.documents.transferDocument) {
        setTransferDocuments([data.documents.transferDocument]);
      }
    });
  }, [isTransferRegistration, registeredUserId]);

  const refreshRegistrationContracts = useCallback(async (mode: "load" | "refresh" = "refresh", targetUserId = registeredUserId) => {
    if (!targetUserId || !needsContracts) {
      setRegistrationContracts([]);
      setContractsLoading(false);
      setContractsRefreshing(false);
      return;
    }
    if (mode === "load") setContractsLoading(true);
    else setContractsRefreshing(true);
    try {
      const contracts = await listContractsForUser(DEFAULT_SCHOOL_ID, targetUserId);
      setRegistrationContracts(contracts.filter((contract) => contract.standardType === "matricula"));
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao carregar contratos.");
    } finally {
      if (mode === "load") setContractsLoading(false);
      else setContractsRefreshing(false);
    }
  }, [needsContracts, registeredUserId]);

  useEffect(() => {
    if (!done || !registeredUserId || !needsContracts) return;
    void refreshRegistrationContracts("load");
  }, [done, needsContracts, refreshRegistrationContracts, registeredUserId]);

  useEffect(() => {
    if (!done || !registeredUserId || !needsContracts || contractsDone) return;
    const id = window.setInterval(() => void refreshRegistrationContracts("refresh"), 5000);
    return () => window.clearInterval(id);
  }, [contractsDone, done, needsContracts, refreshRegistrationContracts, registeredUserId]);

  function goToOnboardingView(view: OnboardingView, mode: "push" | "replace" = "push") {
    if (mode === "replace") replaceOnboardingView(view);
    else pushOnboardingView(view);
    setOnboardingView(view);
  }

  function backToChecklist() {
    if (window.history.state?.cadastroOnboarding) {
      window.history.back();
      return;
    }
    replaceOnboardingView("checklist");
    setOnboardingView("checklist");
  }

  useEffect(() => {
    if (!onboardingEnabled) return;
    if (done && onboardingView === "form") {
      replaceOnboardingView("checklist");
      setOnboardingView("checklist");
      return;
    }
    if (done && onboardingView === "schedule" && needsPay && !paid) {
      replaceOnboardingView("checklist");
      setOnboardingView("checklist");
      return;
    }
    if (done && onboardingView === "transfer" && !isTransferRegistration) {
      replaceOnboardingView("checklist");
      setOnboardingView("checklist");
      return;
    }
    if (done && onboardingView === "contracts" && !needsContracts) {
      replaceOnboardingView("checklist");
      setOnboardingView("checklist");
      return;
    }
    if (!done && (onboardingView === "transfer" || onboardingView === "contracts" || onboardingView === "payment" || onboardingView === "schedule")) {
      replaceOnboardingView("checklist");
      setOnboardingView("checklist");
    }
  }, [done, isTransferRegistration, needsContracts, needsPay, onboardingEnabled, onboardingView, paid]);

  useEffect(() => {
    if (!isTestMode || !invite || done || alreadyDone) return;
    setS1((current) => ({
      ...TEST_STEP1,
      fullName: current.fullName.trim() || TEST_STEP1.fullName,
      phone: current.phone.trim() || TEST_STEP1.phone,
    }));
    setS2(TEST_STEP2);
    setS3(TEST_STEP3);
    setDocs(makeTestDocuments());
  }, [alreadyDone, done, invite, isTestMode]);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    void (async () => {
      const { data: lead } = await getLeadByToken(token);
      if (lead) {
        setCrmLead(lead);
        setInvite({
          source: "crm",
          id: lead.id,
          email: lead.email,
          name: lead.name,
          phone: lead.phone,
          userId: lead.userId,
          referrerUserId: lead.referrerUserId,
          cpf: lead.cpf,
          birthDate: lead.birthDate,
          weightKg: lead.weightKg,
          heightCm: lead.heightCm,
          anacCode: lead.anacCode,
        });
        const options = registrationLinkOptionsFromParams(params);
        setRegistrationOptions(options);
        if (lead.userId) {
          if (options.allowCheckout || options.allowFirstFlightBooking) {
            setRegisteredUserId(lead.userId);
            setS1((current) => ({
              ...current,
              fullName: lead.name ?? current.fullName,
              phone: lead.phone ? formatPhone(lead.phone) : current.phone,
            }));
            setDone(true);
          } else {
            setAlreadyDone(true);
          }
        } else {
          setS1({
            fullName: lead.name ?? "",
            cpf: lead.cpf ? formatCpf(lead.cpf) : "",
            phone: lead.phone ? formatPhone(lead.phone) : "",
            birthDate: lead.birthDate ?? "",
            weightKg: lead.weightKg != null ? String(lead.weightKg) : "",
            heightCm: lead.heightCm != null ? String(lead.heightCm) : "",
            anacCode: lead.anacCode ?? "",
          });
        }
        setLoading(false);
        return;
      }

      const candidate = await getInstructorAdmissionCandidateByRegistrationToken(token);
      if (!candidate) {
        setNotFound(true);
      } else {
        const options = registrationLinkOptionsFromResponses(candidate.responses);
        setRegistrationOptions(options);
        setS1((current) => ({
          ...current,
          fullName: candidate.name ?? "",
          phone: candidate.phone ? formatPhone(candidate.phone) : current.phone,
        }));
        if (candidate.userId) {
          if (options.allowCheckout || options.allowFirstFlightBooking) {
            setRegisteredUserId(candidate.userId);
            setS1((current) => ({
              ...current,
              fullName: candidate.name ?? current.fullName,
              phone: candidate.phone ? formatPhone(candidate.phone) : current.phone,
            }));
            setDone(true);
          } else {
            setAlreadyDone(true);
          }
          setLoading(false);
          return;
        }
        setInvite({
          source: "instructor",
          id: candidate.id,
          email: candidate.email,
          name: candidate.name,
          phone: candidate.phone ?? null,
          userId: candidate.userId ?? null,
          referrerUserId: null,
          cpf: null,
          birthDate: null,
          weightKg: null,
          heightCm: null,
          anacCode: null,
        });
        setS1({
          fullName: candidate.name ?? "",
          cpf: "",
          phone: candidate.phone ? formatPhone(candidate.phone) : "",
          birthDate: "",
          weightKg: "",
          heightCm: "",
          anacCode: "",
        });
      }
      setLoading(false);
    })();
  }, [token]);

  function handleStep1Next() {
    const cpfDigits = onlyDigits(s1.cpf);
    const phoneDigits = onlyDigits(s1.phone);
    const weight = Number(s1.weightKg.replace(",", "."));
    const height = Number(s1.heightCm.replace(",", "."));
    if (
      !s1.fullName.trim() ||
      cpfDigits.length !== 11 ||
      phoneDigits.length < 10 ||
      !s1.birthDate ||
      !Number.isFinite(weight) || weight <= 0 ||
      !Number.isFinite(height) || height <= 0 ||
      !onlyDigits(s1.anacCode)
    ) {
      setErrorMsg("Preencha todos os dados corretamente antes de continuar.");
      return;
    }
    setErrorMsg(null);
    setStep(2);
  }

  function handleStep2Next() {
    const cepDigits = onlyDigits(s2.cep);
    if (
      !s2.rg.trim() ||
      !s2.rgOrgaoExpedidor.trim() ||
      !s2.rgDataEmissao ||
      !s2.nacionalidade.trim() ||
      !s2.estadoCivil ||
      !s2.endereco.trim() ||
      cepDigits.length !== 8 ||
      !s2.cidade.trim() ||
      !s2.uf
    ) {
      setErrorMsg("Preencha todos os dados pessoais e o endereço antes de continuar.");
      return;
    }
    if (s2.password.length < 8) {
      setErrorMsg("Senha deve ter no mínimo 8 caracteres.");
      return;
    }
    setErrorMsg(null);
    setStep(3);
  }

  function handleStep3Next() {
    const emergPhone = onlyDigits(s3.emergenciaTelefone);
    if (
      !s3.sexo ||
      !s3.naturalidade.trim() ||
      !s3.filiacaoPai.trim() ||
      !s3.filiacaoMae.trim() ||
      !s3.escolaridade ||
      !s3.alergiasMedicamentos.trim() ||
      !s3.emergenciaNome.trim() ||
      !s3.emergenciaParentesco.trim() ||
      !s3.emergenciaEndereco.trim() ||
      emergPhone.length < 10
    ) {
      setErrorMsg("Preencha todos os campos da ficha de matrícula antes de enviar os documentos.");
      return;
    }
    setErrorMsg(null);
    setStep(4);
  }

  async function handleSubmit() {
    if (!invite || !account) return;

    // Validar docs obrigatórios (certificado militar obrigatório para homens)
    if (invite.source !== "crm") {
      const missingDocs = DOC_DEFS.filter((d) => {
        if (d.type === "militaryCertificate") return s3.sexo === "M" && !docs[d.type];
        return d.required && !docs[d.type];
      });
      if (missingDocs.length > 0) {
        setErrorMsg(`Envie os documentos obrigatórios: ${missingDocs.map((d) => d.label).join(", ")}.`);
        return;
      }
    }

    setErrorMsg(null);
    setBusy(true);

    const cpfDigits = onlyDigits(s1.cpf);
    const phoneDigits = onlyDigits(s1.phone);
    const anacDigits = onlyDigits(s1.anacCode);
    const weight = Number(s1.weightKg.replace(",", "."));
    const height = Number(s1.heightCm.replace(",", "."));

    try {
      let userId: string;

      // 1. Criar conta Appwrite
      setBusyMsg("Criando sua conta...");
      const currentAccount = await account.get().catch(() => null);
      if (currentAccount?.email === invite.email) {
        userId = currentAccount.$id;
      } else try {
        const created = await account.create(ID.unique(), invite.email, s2.password, s1.fullName.trim());
        userId = created.$id;
      } catch (e) {
        const appErr = e as { code?: number };
        if (appErr.code === 409) {
          try {
            await account.createEmailPasswordSession(invite.email, s2.password);
            const u = await account.get();
            userId = u.$id;
          } catch {
            setErrorMsg("Este e-mail já tem uma conta com senha diferente. Acesse a plataforma normalmente.");
            setBusy(false);
            return;
          }
        } else {
          throw e;
        }
      }

      // 2. Criar sessão
      try { await account.createEmailPasswordSession(invite.email, s2.password); } catch { /* já existe */ }

      // 3. Criar perfil
      setBusyMsg("Salvando seus dados...");
      const profileRole = invite.source === "instructor" ? "instrutor" : "aluno";
      await ensureProfile(userId, invite.email, profileRole, {
        full_name: s1.fullName.trim(),
        ...(invite.referrerUserId ? { referrer_user_id: invite.referrerUserId } : {}),
        cpf: cpfDigits,
        phone: phoneDigits,
        birth_date: s1.birthDate,
        weight_kg: weight,
        height_cm: height,
        anac_code: anacDigits,
        rg: s2.rg.trim(),
        rg_orgao_expedidor: s2.rgOrgaoExpedidor.trim(),
        rg_data_emissao: s2.rgDataEmissao,
        endereco: s2.endereco.trim(),
        cep: onlyDigits(s2.cep),
        cidade: s2.cidade.trim(),
        uf: s2.uf,
        nacionalidade: s2.nacionalidade.trim(),
        estado_civil: s2.estadoCivil,
        sexo: s3.sexo,
        naturalidade: s3.naturalidade.trim(),
        filiacao_pai: s3.filiacaoPai.trim(),
        filiacao_mae: s3.filiacaoMae.trim(),
        escolaridade: s3.escolaridade,
        escolaridade_periodo: s3.escolaridadePeriodo.trim(),
        escolaridade_curso: s3.escolaridadeCurso.trim(),
        alergias_medicamentos: s3.alergiasMedicamentos.trim(),
        emergencia_nome: s3.emergenciaNome.trim(),
        emergencia_parentesco: s3.emergenciaParentesco.trim(),
        emergencia_endereco: s3.emergenciaEndereco.trim(),
        emergencia_telefone: onlyDigits(s3.emergenciaTelefone),
      });

      // 4. Buscar perfil para obter docId (necessário para upload)
      setBusyMsg("Enviando documentos...");
      const { data: profile } = await getProfile(userId);

      // 5. Upload dos documentos
      if (profile) {
        const docEntries = Object.entries(docs) as [ProfileDocumentType, File | null][];
        for (const [type, file] of docEntries) {
          if (!file) continue;
          await uploadProfileDocumentAttachment(
            { docId: profile.docId, userId: profile.userId, documents: profile.documents },
            type,
            file,
          );
        }
      }

      // 6. ANAC sync (best-effort)
      void executeAnacSync({ cpf: cpfDigits, anacCode: anacDigits, birthDate: s1.birthDate });

      // 7. Vincular userId ao lead/candidato
      if (invite.source === "crm" && crmLead) {
        const { data: registeredLead } = await moveLeadToCrmStatus(crmLead.id, "registro_preenchido", {
          currentLead: crmLead,
          extraUpdates: {
            userId,
            name: s1.fullName.trim(),
            phone: phoneDigits,
            weightKg: weight,
            heightCm: height,
            qualFilledAt: new Date().toISOString(),
          },
        });
        const leadAfterRegistration = registeredLead ?? { ...crmLead, userId, crmStatus: "registro_preenchido" as const };
        setCrmLead(leadAfterRegistration);
        setRegisteredUserId(userId);
        setBusyMsg("Preparando sua matrícula...");
        setEnrollmentAutomationRunning(true);
        try {
          const result = await runRegistrationEnrollmentAutomation({ token, userId });
          setCrmLead((current) => current ? { ...current, crmStatus: result.nextStatus as CrmLead["crmStatus"] } : current);
          await refreshRegistrationContracts("load", userId);
        } catch (automationError) {
          setStep(1);
          setErrorMsg(formatRegistrationRetryError(automationError));
          return;
        } finally {
          setEnrollmentAutomationRunning(false);
        }
      } else if (invite.source === "instructor") {
        await updateInstructorAdmissionCandidate(invite.id, {
          userId,
          name: s1.fullName.trim(),
          phone: phoneDigits,
          formFilledAt: new Date().toISOString(),
        });
      }
      setRegisteredUserId(userId);

      // 8. Encerrar sessão apenas em links simples. Links com pagamento/agendamento precisam da sessão recém-criada.
      if (!registrationOptions.allowCheckout && !registrationOptions.allowFirstFlightBooking) {
        await account.deleteSession("current").catch(() => undefined);
      }

      setDone(true);
    } catch (e) {
      const err = e as { message?: string };
      setErrorMsg(err.message ?? "Erro ao criar conta. Tente novamente.");
    } finally {
      setBusy(false);
      setBusyMsg("Aguarde...");
    }
  }

  function handleBooked(summary: RegistrationBookingSummary) {
    setBooked(summary);
    saveOnboardingPersist(token, { booked: summary });
    goToOnboardingView("checklist", "replace");
  }

  function handleContractSigned(updated: Contract) {
    setRegistrationContracts((current) => current.map((contract) => (contract.id === updated.id ? updated : contract)));
  }

  function handleTransferFilesSelected(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList);
    if (!nextFiles.length) return;
    const invalidType = nextFiles.find((file) => !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type));
    if (invalidType) {
      setErrorMsg("Formato inválido. Envie PDF, JPG ou PNG.");
      return;
    }
    const oversized = nextFiles.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      setErrorMsg("Arquivo muito grande. Máximo 10 MB por documento.");
      return;
    }
    if (transferFiles.length + nextFiles.length > transferRemainingSlots) {
      setErrorMsg(`Você pode anexar até ${TRANSFER_DOCUMENT_LIMIT} documentos da transferência.`);
      return;
    }
    setErrorMsg(null);
    setTransferFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const additions = nextFiles.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...current, ...additions];
    });
  }

  function removeTransferFile(index: number) {
    setTransferFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleTransferDocumentSubmit() {
    if (!registeredUserId || transferFiles.length === 0) {
      setErrorMsg("Selecione ao menos um documento da transferência antes de continuar.");
      return;
    }
    if (transferFiles.length > transferRemainingSlots) {
      setErrorMsg(`Você pode anexar até ${TRANSFER_DOCUMENT_LIMIT} documentos da transferência.`);
      return;
    }
    setTransferUploading(true);
    setErrorMsg(null);
    try {
      const profile = transferProfile ?? (await getProfile(registeredUserId)).data;
      if (!profile) throw new Error("Perfil não encontrado para anexar o documento.");
      const result = await uploadProfileDocumentAttachments(profile, "transferDocument", transferFiles, {
        maxFiles: TRANSFER_DOCUMENT_LIMIT,
      });
      if (result.error || !result.data || !result.documents) throw result.error ?? new Error("Não foi possível anexar os documentos.");
      setTransferProfile({ ...profile, documents: result.documents });
      setTransferDocuments(result.data);
      setTransferFiles([]);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao anexar documentos da transferência.");
    } finally {
      setTransferUploading(false);
    }
  }

  useEffect(() => {
    if (!done || !crmLead || invite?.source !== "crm" || groundMoveDone.current) return;
    if (!paymentDone || !bookingDone || !transferDone || !contractsDone) return;
    if (crmLead.crmStatus === "ground_agendado" || crmLead.crmStatus === "cadastro_anac" || crmLead.crmStatus === "aluno_pronto") {
      groundMoveDone.current = true;
      return;
    }
    groundMoveDone.current = true;
    void moveLeadToCrmStatus(crmLead.id, "ground_agendado", { currentLead: crmLead }).then(({ data, error }) => {
      if (data) setCrmLead(data);
      if (error) {
        groundMoveDone.current = false;
        setErrorMsg(error.message || "Checklist concluído, mas não foi possível atualizar o CRM.");
      }
    });
  }, [bookingDone, contractsDone, crmLead, done, invite?.source, paymentDone, transferDone]);

  // ─── Telas auxiliares ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mx-auto mb-3 h-12 w-12 text-slate-600">
          <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
        </svg>
        <p className="text-lg font-semibold text-slate-200">Link inválido ou expirado</p>
        <p className="mt-1 text-sm text-slate-500">Entre em contato com a escola para solicitar um novo link.</p>
      </div>
    );
  }

  if (alreadyDone) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
        <div className="w-full max-w-sm rounded-2xl border border-sky-700/30 bg-slate-900 p-8">
          <p className="text-lg font-semibold text-slate-100">Cadastro já realizado</p>
          <p className="mt-2 text-sm text-slate-400">Sua conta já foi criada. Faça login na plataforma para acessar.</p>
        </div>
      </div>
    );
  }

  if (done) {
    if (onboardingEnabled) {
      return (
        <div className="flex min-h-screen items-start justify-center overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 sm:items-center sm:py-12">
          <div className={`${ONBOARDING_COL_CLASS} space-y-4`}>
            {logoUrl ? (
              <img src={logoUrl} alt={schoolName || "Logo"} className="mx-auto mb-1 max-h-14 max-w-[160px] object-contain" />
            ) : null}
            {onboardingComplete ? (
              <RegistrationReadyView
                name={s1.fullName || invite?.name || ""}
                booked={booked}
                includePayment={needsPay}
                includeBooking={needsBook}
              />
            ) : onboardingView === "payment" ? (
              <RegistrationPaymentView
                token={token}
                userId={registeredUserId}
                options={registrationOptions}
                isTestMode={isTestMode}
                onBack={backToChecklist}
                onPaid={markPaid}
              />
            ) : onboardingView === "contracts" && needsContracts ? (
              <RegistrationContractsStepView
                contracts={registrationContracts}
                loading={contractsLoading || enrollmentAutomationRunning}
                refreshing={contractsRefreshing}
                onBack={backToChecklist}
                onRefresh={() => void refreshRegistrationContracts("refresh")}
                onSigned={handleContractSigned}
              />
            ) : onboardingView === "schedule" ? (
              <div className="rounded-2xl border border-slate-700/80 bg-slate-900 p-6">
                <RegistrationFirstFlightScheduler
                  onBack={backToChecklist}
                  onBooked={handleBooked}
                />
              </div>
            ) : onboardingView === "transfer" && isTransferRegistration ? (
              <div className="rounded-2xl border border-slate-700/80 bg-slate-900 p-6">
                <button type="button" onClick={backToChecklist} className="text-xs text-slate-500 hover:text-slate-300">
                  ← Voltar ao checklist
                </button>
                <h2 className="mt-3 text-lg font-semibold text-slate-100">Documentos da transferência</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  Anexe o documento da sua transferência para a equipe validar com a escola de origem. Esta etapa não bloqueia o pagamento.
                </p>
                <div className="mt-5">
                  <TransferDocumentsUploadField
                    files={transferFiles}
                    documents={transferDocuments}
                    remainingSlots={transferRemainingSlots}
                    onFilesSelected={handleTransferFilesSelected}
                    onRemoveFile={removeTransferFile}
                  />
                </div>
                {errorMsg ? <p className="mt-4 text-xs text-red-300">{errorMsg}</p> : null}
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={transferUploading || transferFiles.length === 0}
                    onClick={() => void handleTransferDocumentSubmit()}
                    className="w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
                  >
                    {transferUploading ? "Enviando..." : transferFiles.length > 1 ? "Enviar documentos" : "Enviar documento"}
                  </button>
                  {transferDocumentDone ? (
                    <button
                      type="button"
                      onClick={backToChecklist}
                      className="w-full rounded-lg border border-slate-700 px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 sm:w-auto"
                    >
                      Voltar ao checklist
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-700/80 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold text-slate-100">Cadastro concluído!</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Olá, <span className="font-medium text-slate-200">{s1.fullName || invite?.name}</span>. Siga os próximos passos.
                </p>
                <div className="mt-5">
                  <RegistrationChecklistCards
                    options={registrationOptions}
                    cadastroDone
                    paid={paid}
                    booked={booked}
                    isTransfer={isTransferRegistration}
                    transferDocumentDone={transferDocumentDone}
                    transferDocumentCount={transferDocuments.length}
                    showContracts={needsContracts}
                    contractsDone={contractsDone}
                    contractsCount={activeRegistrationContracts.length}
                    contractsLoading={contractsLoading || enrollmentAutomationRunning}
                    onTransferDocuments={() => goToOnboardingView("transfer")}
                    onContracts={() => goToOnboardingView("contracts")}
                    onPay={() => goToOnboardingView("payment")}
                    onSchedule={() => goToOnboardingView("schedule")}
                  />
                </div>
                {errorMsg ? <p className="mt-4 text-xs text-red-300">{errorMsg}</p> : null}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
        <div className="w-full max-w-md rounded-2xl border border-emerald-700/40 bg-slate-900 p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-100">Cadastro concluído!</h2>
          <p className="mb-4 text-sm text-slate-400">
            Olá, <span className="font-medium text-slate-200">{s1.fullName}</span>! Seus dados e documentos foram recebidos.
            Em breve a escola irá liberar seu acesso à plataforma.
          </p>
          {errorMsg && <p className="mb-4 text-xs text-red-300">{errorMsg}</p>}
          <p className="text-left text-xs text-slate-400">
            <span className="font-medium text-slate-200">Próximo passo: </span>
            você receberá um contato confirmando a liberação do acesso.
          </p>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  const inputCls = "mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none";

  if (onboardingEnabled && onboardingView !== "form") {
    return (
      <div className="flex min-h-screen items-start justify-center overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 sm:items-center sm:py-12">
        <div className={`${ONBOARDING_COL_CLASS} space-y-4`}>
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || "Logo"} className="mx-auto mb-1 max-h-14 max-w-[160px] object-contain" />
          ) : null}
          {schoolName ? (
            <h1 className="text-center text-2xl font-bold tracking-tight" style={{ color: "var(--school-primary, #10b981)" }}>
              {schoolName}
            </h1>
          ) : null}
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-slate-100">Seu processo de entrada</h2>
            <p className="mt-1 text-sm text-slate-400">Comece pelo envio dos documentos. Os próximos passos são liberados em seguida.</p>
            <div className="mt-5">
              <RegistrationChecklistCards
                options={registrationOptions}
                cadastroDone={false}
                paid={false}
                booked={null}
                isTransfer={isTransferRegistration}
                transferDocumentDone={false}
                showContracts={needsContracts}
                contractsDone={false}
                contractsCount={0}
                contractsLoading={false}
                onStartCadastro={() => goToOnboardingView("form")}
                onTransferDocuments={() => undefined}
                onContracts={() => undefined}
                onPay={() => undefined}
                onSchedule={() => undefined}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-xl space-y-6 sm:space-y-8">

        {/* Header */}
        <div className="text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName || "Logo"} className="mx-auto mb-3 max-h-16 max-w-[180px] object-contain" />
          ) : null}
          {schoolName ? (
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--school-primary, #10b981)" }}>
              {schoolName}
            </h1>
          ) : (
            <div className="mx-auto h-8 w-32 rounded-lg bg-slate-800/60" />
          )}
          <p className="mt-2 text-sm text-slate-400">Complete seu cadastro para acessar a plataforma</p>
        </div>

        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5 shadow-xl backdrop-blur-sm sm:p-6">
          {onboardingEnabled ? (
            <button type="button" onClick={backToChecklist} className="mb-4 text-xs text-slate-500 hover:text-slate-300">
              ← Voltar ao checklist
            </button>
          ) : null}

          {/* Step indicator */}
          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            {([
              { n: 1, label: "Básicos" },
              { n: 2, label: "Identidade" },
              { n: 3, label: "Ficha" },
              { n: 4, label: "Documentos" },
            ] as const).map(({ n, label }, i) => (
              <>
                {i > 0 && <span key={`sep-${n}`} className="text-slate-700 text-xs">›</span>}
                <div key={n} className="flex items-center gap-1.5">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    step > n ? "bg-emerald-700/40 text-emerald-400" : step === n ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-500"
                  }`}>
                    {step > n ? "✓" : n}
                  </div>
                  <span className={`text-xs ${step === n ? "text-sky-400" : "text-slate-500"}`}>{label}</span>
                </div>
              </>
            ))}
          </div>

          <div className="space-y-3">
            {/* E-mail sempre visível */}
            <label className="block text-xs text-slate-500">
              E-mail
              <div className={`${inputCls} text-slate-400 cursor-default`}>{invite.email}</div>
            </label>

            {/* ── Conteúdo do step com animação ── */}
            <div key={step} className="step-animate space-y-3">

            {/* ── Step 1 ── */}
            {step === 1 && (
              <>
                <label className="block text-xs text-slate-500">
                  Nome completo
                  <input type="text" autoComplete="name" value={s1.fullName}
                    onChange={(e) => setS1((p) => ({ ...p, fullName: e.target.value }))}
                    className={inputCls} placeholder="Nome e sobrenome" />
                </label>
                <label className="block text-xs text-slate-500">
                  CPF
                  <input type="text" inputMode="numeric" autoComplete="off" value={s1.cpf}
                    onChange={(e) => setS1((p) => ({ ...p, cpf: formatCpf(e.target.value) }))}
                    className={inputCls} placeholder="000.000.000-00" />
                </label>
                <label className="block text-xs text-slate-500">
                  Telefone / WhatsApp
                  <input type="text" inputMode="tel" autoComplete="tel" value={s1.phone}
                    onChange={(e) => setS1((p) => ({ ...p, phone: formatPhone(e.target.value) }))}
                    className={inputCls} placeholder="(11) 99999-9999" />
                </label>
                <label className="block text-xs text-slate-500">
                  Data de nascimento
                  <input type="date" autoComplete="bday" value={s1.birthDate}
                    onChange={(e) => setS1((p) => ({ ...p, birthDate: e.target.value }))}
                    className={inputCls} />
                </label>
                <label className="block text-xs text-slate-500">
                  Peso (kg)
                  <input type="number" inputMode="decimal" min={1} step="0.1" value={s1.weightKg}
                    onChange={(e) => setS1((p) => ({ ...p, weightKg: e.target.value }))}
                    className={inputCls} placeholder="75.5" />
                </label>
                <label className="block text-xs text-slate-500">
                  Altura (cm)
                  <input type="number" inputMode="decimal" min={1} step="0.1" value={s1.heightCm}
                    onChange={(e) => setS1((p) => ({ ...p, heightCm: e.target.value }))}
                    className={inputCls} placeholder="178" />
                </label>
                <label className="block text-xs text-slate-500">
                  Código ANAC
                  <input type="text" inputMode="numeric" autoComplete="off" value={s1.anacCode}
                    onChange={(e) => setS1((p) => ({ ...p, anacCode: onlyDigits(e.target.value) }))}
                    className={inputCls} placeholder="Ex.: 264933" />
                </label>
              </>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <>
                <p className="text-xs text-slate-400">Documento de identidade e endereço (como na ficha de matrícula).</p>
                <label className="block text-xs text-slate-500">
                  RG
                  <input type="text" autoComplete="off" value={s2.rg}
                    onChange={(e) => setS2((p) => ({ ...p, rg: e.target.value }))}
                    className={inputCls} placeholder="00.000.000-0" />
                </label>
                <label className="block text-xs text-slate-500">
                  Órgão expedidor do RG
                  <input type="text" autoComplete="off" value={s2.rgOrgaoExpedidor}
                    onChange={(e) => setS2((p) => ({ ...p, rgOrgaoExpedidor: e.target.value }))}
                    className={inputCls} placeholder="Ex.: SSP/SP" />
                </label>
                <label className="block text-xs text-slate-500">
                  Data de emissão do RG
                  <input type="date" value={s2.rgDataEmissao}
                    onChange={(e) => setS2((p) => ({ ...p, rgDataEmissao: e.target.value }))}
                    className={inputCls} />
                </label>
                <label className="block text-xs text-slate-500">
                  Nacionalidade
                  <input type="text" autoComplete="off" value={s2.nacionalidade}
                    onChange={(e) => setS2((p) => ({ ...p, nacionalidade: e.target.value }))}
                    className={inputCls} placeholder="Brasileiro(a)" />
                </label>
                <label className="block text-xs text-slate-500">
                  Estado civil
                  <select value={s2.estadoCivil}
                    onChange={(e) => setS2((p) => ({ ...p, estadoCivil: e.target.value }))}
                    className={inputCls}>
                    <option value="">Selecione...</option>
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                    <option value="União Estável">União Estável</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-500">
                  Endereço residencial
                  <input type="text" autoComplete="street-address" value={s2.endereco}
                    onChange={(e) => setS2((p) => ({ ...p, endereco: e.target.value }))}
                    className={inputCls} placeholder="Rua, número, complemento, bairro" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-slate-500">
                    CEP
                    <input type="text" inputMode="numeric" autoComplete="postal-code" value={s2.cep}
                      onChange={(e) => setS2((p) => ({ ...p, cep: formatCep(e.target.value) }))}
                      className={inputCls} placeholder="00000-000" />
                  </label>
                  <label className="block text-xs text-slate-500">
                    UF
                    <select value={s2.uf} onChange={(e) => setS2((p) => ({ ...p, uf: e.target.value }))}
                      className={inputCls}>
                      <option value="">UF</option>
                      {BRAZIL_UFS.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-xs text-slate-500">
                  Cidade
                  <input type="text" autoComplete="address-level2" value={s2.cidade}
                    onChange={(e) => setS2((p) => ({ ...p, cidade: e.target.value }))}
                    className={inputCls} placeholder="São Paulo" />
                </label>
                <label className="block text-xs text-slate-500">
                  Senha <span className="text-slate-600">(mínimo 8 caracteres)</span>
                  <input type="password" autoComplete="new-password" value={s2.password}
                    onChange={(e) => setS2((p) => ({ ...p, password: e.target.value }))}
                    className={inputCls} placeholder="Mínimo 8 caracteres" />
                </label>
                <button type="button" onClick={() => { setStep(1); setErrorMsg(null); }}
                  className="text-xs text-slate-500 hover:text-slate-300">
                  ← Voltar
                </button>
              </>
            )}

            {/* ── Step 3 — complemento ficha de matrícula ── */}
            {step === 3 && (
              <>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Estes dados compõem sua ficha de matrícula na escola. Preencha com atenção.
                </p>
                <label className="block text-xs text-slate-500">
                  Sexo
                  <select value={s3.sexo} onChange={(e) => setS3((p) => ({ ...p, sexo: e.target.value }))}
                    className={inputCls}>
                    <option value="">Selecione...</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-500">
                  Naturalidade
                  <input type="text" value={s3.naturalidade}
                    onChange={(e) => setS3((p) => ({ ...p, naturalidade: e.target.value }))}
                    className={inputCls} placeholder="Cidade onde nasceu" />
                </label>
                <label className="block text-xs text-slate-500">
                  Filiação — pai
                  <input type="text" value={s3.filiacaoPai}
                    onChange={(e) => setS3((p) => ({ ...p, filiacaoPai: e.target.value }))}
                    className={inputCls} placeholder="Nome completo do pai" />
                </label>
                <label className="block text-xs text-slate-500">
                  Filiação — mãe
                  <input type="text" value={s3.filiacaoMae}
                    onChange={(e) => setS3((p) => ({ ...p, filiacaoMae: e.target.value }))}
                    className={inputCls} placeholder="Nome completo da mãe" />
                </label>
                <label className="block text-xs text-slate-500">
                  Escolaridade
                  <select value={s3.escolaridade}
                    onChange={(e) => setS3((p) => ({ ...p, escolaridade: e.target.value }))}
                    className={inputCls}>
                    <option value="">Selecione...</option>
                    {ESCOLARIDADE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-slate-500">
                  Série/período <span className="text-slate-600">(se incompleto)</span>
                  <input type="text" value={s3.escolaridadePeriodo}
                    onChange={(e) => setS3((p) => ({ ...p, escolaridadePeriodo: e.target.value }))}
                    className={inputCls} placeholder="Ex.: 1º semestre" />
                </label>
                <label className="block text-xs text-slate-500">
                  Curso <span className="text-slate-600">(formação acadêmica)</span>
                  <input type="text" value={s3.escolaridadeCurso}
                    onChange={(e) => setS3((p) => ({ ...p, escolaridadeCurso: e.target.value }))}
                    className={inputCls} placeholder="Ex.: Aviação Civil" />
                </label>
                <label className="block text-xs text-slate-500">
                  Alergias a medicamentos
                  <textarea value={s3.alergiasMedicamentos} rows={2}
                    onChange={(e) => setS3((p) => ({ ...p, alergiasMedicamentos: e.target.value }))}
                    className={inputCls} placeholder="Descreva ou informe Nenhuma" />
                </label>
                <p className="pt-1 text-xs font-medium text-slate-400">Em caso de emergência avisar:</p>
                <label className="block text-xs text-slate-500">
                  Nome
                  <input type="text" value={s3.emergenciaNome}
                    onChange={(e) => setS3((p) => ({ ...p, emergenciaNome: e.target.value }))}
                    className={inputCls} />
                </label>
                <label className="block text-xs text-slate-500">
                  Grau de parentesco
                  <input type="text" value={s3.emergenciaParentesco}
                    onChange={(e) => setS3((p) => ({ ...p, emergenciaParentesco: e.target.value }))}
                    className={inputCls} placeholder="Ex.: Pai, Mãe, Cônjuge" />
                </label>
                <label className="block text-xs text-slate-500">
                  Endereço
                  <input type="text" value={s3.emergenciaEndereco}
                    onChange={(e) => setS3((p) => ({ ...p, emergenciaEndereco: e.target.value }))}
                    className={inputCls} />
                </label>
                <label className="block text-xs text-slate-500">
                  Telefone(s)
                  <input type="text" inputMode="tel" value={s3.emergenciaTelefone}
                    onChange={(e) => setS3((p) => ({ ...p, emergenciaTelefone: formatPhone(e.target.value) }))}
                    className={inputCls} placeholder="(11) 99999-9999" />
                </label>
                <button type="button" onClick={() => { setStep(2); setErrorMsg(null); }}
                  className="text-xs text-slate-500 hover:text-slate-300">
                  ← Voltar
                </button>
              </>
            )}

            {/* ── Step 4 — documentos ── */}
            {step === 4 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Para concluir seu cadastro, você pode enviar os documentos agora ou deixar para depois. Aceitamos arquivos <strong className="text-slate-200">PDF, JPG ou PNG</strong> com até 10 MB cada.
                </p>
                {DOC_DEFS
                  .filter((def) => !(def.type === "militaryCertificate" && s3.sexo === "F"))
                  .map((def) => {
                    const effectiveDef = def.type === "militaryCertificate" && s3.sexo === "M"
                      ? { ...def, required: true }
                      : def;
                    const visibleDef = invite?.source === "crm" ? { ...effectiveDef, required: false } : effectiveDef;
                    return (
                      <DocUploadField
                        key={visibleDef.type}
                        def={visibleDef}
                        file={docs[visibleDef.type]}
                        onChange={(f) => setDocs((p) => ({ ...p, [visibleDef.type]: f }))}
                      />
                    );
                  })}
                <button type="button" onClick={() => { setStep(3); setErrorMsg(null); }}
                  className="text-xs text-slate-500 hover:text-slate-300">
                  ← Voltar
                </button>
              </div>
            )}

            </div>{/* fim step-animate */}
          </div>

          {errorMsg && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {errorMsg}
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={
              step === 1 ? handleStep1Next :
              step === 2 ? handleStep2Next :
              step === 3 ? handleStep3Next :
              () => void handleSubmit()
            }
            className="mt-5 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 school-primary-button"
          >
            {busy ? busyMsg : step < 4 ? "Próximo →" : "Criar conta"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-600">
          {onboardingEnabled
            ? "Depois de concluir o cadastro você volta ao checklist para os próximos passos."
            : "Após criar a conta, nossa equipe irá liberar seu acesso à plataforma."}
        </p>
      </div>
    </div>
  );
}
