import { useEffect, useRef, useState } from "react";
import { account, ID } from "../lib/appwrite";
import { ensureProfile, getProfile, uploadProfileDocumentAttachment } from "../lib/rbac";
import { executeAnacSync } from "../lib/anacSync";
import { getLeadByToken, moveLeadToCrmStatus } from "../lib/crmDb";
import {
  getInstructorAdmissionCandidateByRegistrationToken,
  updateInstructorAdmissionCandidate,
} from "../lib/instructorAdmissionDb";
import { getCachedBrandSettings } from "../lib/notificationsDb";
import type { CrmLead } from "../types/crm";
import type { ProfileDocumentType } from "../lib/rbac";

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

const DOC_DEFS: {
  type: ProfileDocumentType;
  label: string;
  required: boolean;
  description: string;
  hint: string;
}[] = [
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

// ─── Componente de upload de documento ───────────────────────────────────────

function DocUploadField({
  def,
  file,
  onChange,
}: {
  def: typeof DOC_DEFS[number];
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

// ─── CadastroPage ─────────────────────────────────────────────────────────────

export function CadastroPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const brand = getCachedBrandSettings();
  const schoolName = brand?.schoolName ?? "";
  const logoUrl = brand?.logoUrl ?? "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<CadastroInvite | null>(null);
  const [crmLead, setCrmLead] = useState<CrmLead | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [done, setDone] = useState(false);
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

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    void (async () => {
      const { data: lead } = await getLeadByToken(token);
      if (lead) {
        if (lead.userId) {
          setAlreadyDone(true);
        } else {
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
      } else if (candidate.userId) {
        setAlreadyDone(true);
      } else {
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
    const missingDocs = DOC_DEFS.filter((d) => {
      if (d.type === "militaryCertificate") return s3.sexo === "M" && !docs[d.type];
      return d.required && !docs[d.type];
    });
    if (missingDocs.length > 0) {
      setErrorMsg(`Envie os documentos obrigatórios: ${missingDocs.map((d) => d.label).join(", ")}.`);
      return;
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
      try {
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
        await moveLeadToCrmStatus(crmLead.id, "registro_preenchido", {
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
      } else if (invite.source === "instructor") {
        await updateInstructorAdmissionCandidate(invite.id, {
          userId,
          name: s1.fullName.trim(),
          phone: phoneDigits,
          formFilledAt: new Date().toISOString(),
        });
      }

      // 8. Encerrar sessão
      await account.deleteSession("current").catch(() => undefined);

      setDone(true);
    } catch (e) {
      const err = e as { message?: string };
      setErrorMsg(err.message ?? "Erro ao criar conta. Tente novamente.");
    } finally {
      setBusy(false);
      setBusyMsg("Aguarde...");
    }
  }

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
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-left">
            <p className="text-xs text-amber-300/80">
              <span className="font-medium text-amber-300">Próximo passo:</span> Você receberá um contato confirmando a liberação do acesso.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  const inputCls = "mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none";

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

        {/* Card */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5 shadow-xl backdrop-blur-sm sm:p-6">

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
                  Para concluir seu cadastro, envie os documentos abaixo. Aceitamos arquivos <strong className="text-slate-200">PDF, JPG ou PNG</strong> com até 10 MB cada.
                </p>
                {DOC_DEFS
                  .filter((def) => !(def.type === "militaryCertificate" && s3.sexo === "F"))
                  .map((def) => {
                    const effectiveDef = def.type === "militaryCertificate" && s3.sexo === "M"
                      ? { ...def, required: true }
                      : def;
                    return (
                      <DocUploadField
                        key={effectiveDef.type}
                        def={effectiveDef}
                        file={docs[effectiveDef.type]}
                        onChange={(f) => setDocs((p) => ({ ...p, [effectiveDef.type]: f }))}
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
          Após criar a conta, nossa equipe irá liberar seu acesso à plataforma.
        </p>
      </div>
    </div>
  );
}
