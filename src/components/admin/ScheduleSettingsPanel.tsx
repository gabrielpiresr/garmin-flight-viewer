import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getSchoolRules, saveSchoolRules } from "../../lib/schoolRulesDb";
import { listAircrafts } from "../../lib/aircraftDb";
import { listSagaSchedulesDirect } from "../../lib/sagaImportDb";
import { SCHOOL_ID } from "../../lib/appwrite";
import { DEFAULT_SCHOOL_RULES, type FlightScheduleRules, type SchoolRules } from "../../types/schoolRules";
import { ScheduleStudentHelpSection } from "./ScheduleStudentHelpSection";
import { useToast } from "../ui/ToastProvider";

// Convert decimal hours (18.5) to HH:MM string ("18:30")
function hoursToHHMM(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// Convert HH:MM string ("18:30") to decimal hours (18.5)
function hhmmToHours(value: string): number {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr ?? 0);
  const m = Number(mStr ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 18;
  return h + m / 60;
}

const inputCls = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-white";

/** Ícone de informação com tooltip própria (hover no desktop, toque no mobile). */
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={text}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-slate-500 transition hover:text-sky-300"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open ? (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-slate-200 shadow-xl">
          {text}
        </span>
      ) : null}
    </span>
  );
}

/** Rótulo com tooltip explicando o efeito do campo no sistema. */
function Field({ label, tooltip, children }: { label: string; tooltip: string; children: ReactNode }) {
  return (
    <label className="min-w-0 max-w-xs text-xs text-slate-400">
      <span className="inline-flex items-center gap-1">
        {label}
        <InfoTip text={tooltip} />
      </span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  tooltip,
  checked,
  onChange,
}: {
  label: string;
  tooltip: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex max-w-md cursor-pointer items-center gap-3 rounded-lg border border-slate-700 bg-slate-950/30 px-3 py-2 text-sm text-slate-200">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="inline-flex items-center gap-1.5">
        {label}
        <InfoTip text={tooltip} />
      </span>
    </label>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      {description ? <p className="mt-0.5 text-[11px] text-slate-500">{description}</p> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
    </section>
  );
}

export function ScheduleSettingsPanel() {
  const { showToast } = useToast();
  const [rules, setRules] = useState<SchoolRules>(DEFAULT_SCHOOL_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aircraftRegistrations, setAircraftRegistrations] = useState<string[]>([]);
  // Agendas que aparecem na escala do SAGA (ex.: BLOQUEIO ESCALA) e não estão nas aeronaves locais.
  const [sagaAgendaIdents, setSagaAgendaIdents] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getSchoolRules()
      .then((loaded) => {
        if (cancelled) return;
        setRules(loaded);
        // No modo SAGA, busca as agendas reais para permitir esconder também as que não são aeronaves locais.
        if (loaded.schedule.sagaOnlySchedule) {
          void listSagaSchedulesDirect(3)
            .then((events) => {
              if (cancelled) return;
              setSagaAgendaIdents([
                ...new Set(events.map((event) => String(event.aircraft || "").trim().toUpperCase()).filter(Boolean)),
              ]);
            })
            .catch(() => {});
        }
      })
      .catch((error) => showToast({ variant: "error", message: (error as Error).message }))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void listAircrafts(SCHOOL_ID ?? "")
      .then((rows) => {
        if (cancelled) return;
        setAircraftRegistrations(
          rows.filter((row) => row.active).map((row) => String(row.registration || "").trim().toUpperCase()).filter(Boolean),
        );
      })
      .catch(() => setAircraftRegistrations([]));
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  // Agendas adicionadas manualmente nesta sessão (ex.: agenda SAGA nova, ainda sem eventos).
  const [manualAgendaIdents, setManualAgendaIdents] = useState<string[]>([]);
  const [newAgendaIdent, setNewAgendaIdent] = useState("");

  // Lista exibida = aeronaves locais + agendas do SAGA + agendas já ocultas ou marcadas
  // como lista de espera (para poder reexibir/desmarcar) + adicionadas manualmente.
  const scheduleAgendaOptions = useMemo(
    () =>
      [...new Set([
        ...aircraftRegistrations,
        ...sagaAgendaIdents,
        ...rules.schedule.studentHiddenAircraftIdents,
        ...rules.schedule.studentWaitlistAircraftIdents,
        ...manualAgendaIdents,
      ])].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [
      aircraftRegistrations,
      sagaAgendaIdents,
      rules.schedule.studentHiddenAircraftIdents,
      rules.schedule.studentWaitlistAircraftIdents,
      manualAgendaIdents,
    ],
  );

  function setSchedule(patch: Partial<FlightScheduleRules>) {
    setRules((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));
  }

  function setHelpConfig(next: typeof rules.scheduleStudentHelp) {
    setRules((current) => ({ ...current, scheduleStudentHelp: next }));
  }

  const schedule = rules.schedule;

  function numberField(
    key: keyof FlightScheduleRules,
    label: string,
    tooltip: string,
    opts: { step?: number; max?: number } = {},
  ) {
    return (
      <Field key={String(key)} label={label} tooltip={tooltip}>
        <input
          type="number"
          min={0}
          max={opts.max}
          step={opts.step ?? 1}
          value={schedule[key] as number}
          onChange={(event) => setSchedule({ [key]: Number(event.target.value) } as Partial<FlightScheduleRules>)}
          className={inputCls}
        />
      </Field>
    );
  }

  function nullableField(
    key: keyof FlightScheduleRules,
    label: string,
    tooltip: string,
    opts: { step?: number } = {},
  ) {
    return (
      <Field key={String(key)} label={`${label} (vazio = sem limite)`} tooltip={tooltip}>
        <input
          type="number"
          min={0}
          step={opts.step ?? 1}
          value={(schedule[key] as number | null) ?? ""}
          onChange={(event) =>
            setSchedule({ [key]: event.target.value ? Number(event.target.value) : null } as Partial<FlightScheduleRules>)
          }
          className={inputCls}
        />
      </Field>
    );
  }

  async function save() {
    if (schedule.weekdayMinHours > schedule.weekdayMaxHours || schedule.weekendMinHours > schedule.weekendMaxHours) {
      showToast({ variant: "error", message: "O tempo mínimo não pode superar o máximo." });
      return;
    }
    if (schedule.minBookingLeadDays > schedule.maxBookingLeadDays) {
      showToast({ variant: "error", message: "A antecedência mínima não pode superar a máxima." });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveSchoolRules({
        studentTabs: rules.studentTabs,
        theme: rules.theme,
        schedule: {
          ...schedule,
          minRequestHours: schedule.weekdayMinHours,
          maxRequestHours: schedule.weekdayMaxHours,
        },
        emailNotifications: rules.emailNotifications,
        flightReviewClub: rules.flightReviewClub,
        scheduleStudentHelp: rules.scheduleStudentHelp,
      });
      setRules(saved);
      showToast({ variant: "success", message: "Configurações da escala salvas." });
    } catch (error) {
      showToast({ variant: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-10 text-center text-sm text-slate-500">Carregando configurações...</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Configurações da escala</h2>
        <p className="text-xs text-slate-500">
          Regras aplicadas no servidor ao visualizar, solicitar, alterar e cancelar voos. As travas de quantidade e
          horas valem apenas para alunos — admin e instrutores marcam voos livremente.
        </p>
      </div>

      <Section title="Modo da escala" description="Como a escala é exibida e onde os agendamentos são armazenados.">
        <Field
          label="Formato da escala"
          tooltip="Define o que o aluno pode fazer na aba Escala: 'Agendamento' permite marcar horários livres; 'Visualização' apenas mostra a agenda; 'Fechada' esconde tudo; 'Intenções' usa o fluxo de intenções semanais com gerador de escala."
        >
          <select
            value={schedule.mode}
            onChange={(event) => setSchedule({ mode: event.target.value as FlightScheduleRules["mode"] })}
            className={inputCls}
          >
            <option value="booking">Aberta para agendamento</option>
            <option value="view">Somente visualização</option>
            <option value="closed">Fechada</option>
            <option value="intentions">Via intenções</option>
          </select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-2 xl:col-span-3">
          <ToggleField
            label="Usar somente o SAGA (não salvar a escala no sistema)"
            tooltip="Quando ativado, a escala é lida e editada diretamente na agenda do SAGA: solicitações, alterações e cancelamentos criam/editam/removem o evento no SAGA, sem criar voos no sistema. O horário do SAGA é o bloco completo (briefing + voo + debriefing)."
            checked={schedule.sagaOnlySchedule}
            onChange={(next) => setSchedule({ sagaOnlySchedule: next })}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
            Agendas exibidas para os alunos
            <InfoTip text="Desmarque uma agenda para escondê-la dos alunos na escala: eles não veem os voos dela nem conseguem agendar nessa aeronave. Admin e instrutores continuam vendo tudo." />
          </p>
          {scheduleAgendaOptions.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma aeronave ativa cadastrada.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {scheduleAgendaOptions.map((registration) => {
                const hidden = schedule.studentHiddenAircraftIdents.includes(registration);
                const waitlist = schedule.studentWaitlistAircraftIdents.includes(registration);
                return (
                  <div
                    key={registration}
                    className={`rounded border px-2 py-1.5 text-xs text-slate-300 ${waitlist ? "border-amber-600/60 bg-amber-900/10" : "border-slate-700"}`}
                  >
                    <p className="mb-1 font-semibold">
                      {registration}
                      {waitlist ? <span className="ml-1.5 rounded bg-amber-600/30 px-1 py-0.5 text-[10px] font-semibold text-amber-300">Lista de espera</span> : null}
                    </p>
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-1">
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={(event) =>
                            setSchedule({
                              studentHiddenAircraftIdents: event.target.checked
                                ? schedule.studentHiddenAircraftIdents.filter((value) => value !== registration)
                                : [...new Set([...schedule.studentHiddenAircraftIdents, registration])],
                            })
                          }
                        />
                        Visível
                      </label>
                      <label className="flex cursor-pointer items-center gap-1">
                        <input
                          type="checkbox"
                          checked={waitlist}
                          onChange={(event) =>
                            setSchedule({
                              studentWaitlistAircraftIdents: event.target.checked
                                ? [...new Set([...schedule.studentWaitlistAircraftIdents, registration])]
                                : schedule.studentWaitlistAircraftIdents.filter((value) => value !== registration),
                            })
                          }
                        />
                        <span className="inline-flex items-center gap-1">
                          Lista de espera
                          <InfoTip text="Agenda de LISTA DE ESPERA: o aluno só consegue marcar nela quando nenhum avião real está livre no horário. A solicitação fica aguardando ajustes/cancelamentos e a escola confirma ou cancela até 12h antes do voo. Vale apenas no modo SAGA." />
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Agenda do SAGA sem eventos recentes não aparece na lista automática — permite incluir pelo nome. */}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={newAgendaIdent}
              onChange={(event) => setNewAgendaIdent(event.target.value)}
              placeholder="Adicionar agenda do SAGA (ex.: LISTA DE ESPERA)"
              className="w-64 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600"
            />
            <button
              type="button"
              onClick={() => {
                const ident = newAgendaIdent.trim().toUpperCase();
                if (!ident) return;
                setManualAgendaIdents((current) => [...new Set([...current, ident])]);
                setNewAgendaIdent("");
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Adicionar
            </button>
          </div>
        </div>
      </Section>

      <Section title="Horários e slots" description="Grade de horários da escala e tempos de solo ao redor do voo.">
        <Field
          label="Tamanho dos slots"
          tooltip="Granularidade da agenda: horários de início e durações precisam ser múltiplos deste valor. Ex.: com 30 min o aluno pode marcar 10:00 ou 10:30, nunca 10:15."
        >
          <select
            value={schedule.slotMinutes}
            onChange={(event) => setSchedule({ slotMinutes: Number(event.target.value) as 15 | 30 | 45 | 60 })}
            className={inputCls}
          >
            {[15, 30, 45, 60].map((value) => (
              <option key={value} value={value}>{value} minutos</option>
            ))}
          </select>
        </Field>
        <Field
          label="Horário inicial de acionamento"
          tooltip="Primeiro horário do dia em que um voo pode acionar. Solicitações antes deste horário são bloqueadas."
        >
          <input
            type="time"
            value={schedule.scheduleStartTime}
            onChange={(e) => setSchedule({ scheduleStartTime: e.target.value })}
            className={inputCls}
          />
        </Field>
        {numberField(
          "bufferBeforeMinutes",
          "Briefing (min antes do acionamento)",
          "Tempo de apresentação/briefing antes do acionamento. Soma na ocupação da aeronave e, no modo SAGA, faz parte do bloco do evento: o acionamento é o horário do SAGA + este valor.",
          { step: 5 },
        )}
        {numberField(
          "bufferAfterMinutes",
          "Debriefing (min após o corte)",
          "Tempo de encerramento/debriefing após o corte. Soma na ocupação da aeronave e, no modo SAGA, faz parte do bloco do evento: o corte é o fim do SAGA − este valor.",
          { step: 5 },
        )}
        <Field
          label="Início do período noturno"
          tooltip="A partir deste horário o voo é considerado noturno: usa créditos noturnos e só pode ser marcado nos dias permitidos abaixo."
        >
          <input
            type="time"
            value={hoursToHHMM(schedule.nightFlightStartHour)}
            onChange={(e) => setSchedule({ nightFlightStartHour: hhmmToHours(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-2 xl:col-span-3">
          <ToggleField
            label="Permitir voos noturnos"
            tooltip="Quando desligado, alunos não conseguem marcar voos que iniciem após o início do período noturno."
            checked={schedule.allowNightFlights}
            onChange={(next) => setSchedule({ allowNightFlights: next })}
          />
          {schedule.allowNightFlights ? (
            <div className="mt-2">
              <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                Dias permitidos para agendamento noturno
                <InfoTip text="Somente nestes dias da semana o aluno pode marcar voo noturno. Não afeta voos marcados por admin/instrutor." />
              </p>
              <div className="flex flex-wrap gap-2">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label, day) => (
                  <label key={label} className="flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={schedule.nightBookingWeekdays.includes(day)}
                      onChange={(event) =>
                        setSchedule({
                          nightBookingWeekdays: event.target.checked
                            ? [...new Set([...schedule.nightBookingWeekdays, day])]
                            : schedule.nightBookingWeekdays.filter((value) => value !== day),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Duração dos voos" description="Faixa de tempo de voo (acionamento → corte) que o aluno pode solicitar.">
        {numberField("weekdayMinHours", "Mínimo em dia de semana (h)", "Menor tempo de voo que o aluno pode solicitar de segunda a sexta. Solicitações abaixo disso são bloqueadas.", { step: 0.25 })}
        {numberField("weekdayMaxHours", "Máximo em dia de semana (h)", "Maior tempo de voo que o aluno pode solicitar de segunda a sexta em um único voo.", { step: 0.25 })}
        {numberField("weekendMinHours", "Mínimo no fim de semana (h)", "Menor tempo de voo que o aluno pode solicitar aos sábados e domingos.", { step: 0.25 })}
        {numberField("weekendMaxHours", "Máximo no fim de semana (h)", "Maior tempo de voo que o aluno pode solicitar aos sábados e domingos em um único voo.", { step: 0.25 })}
      </Section>

      <Section
        title="Limites do aluno"
        description="Travas de antecedência, quantidade e horas. Não se aplicam a voos marcados por admin ou instrutor."
      >
        {numberField("minBookingLeadDays", "Antecedência mínima (dias)", "O aluno só consegue marcar voos com pelo menos esta quantidade de dias de antecedência. 0 = pode marcar para hoje.")}
        {numberField("maxBookingLeadDays", "Antecedência máxima (dias)", "Horizonte máximo de agendamento: o aluno não consegue marcar voos além desta quantidade de dias no futuro.")}
        {nullableField("weekdayMaxFlightsPerDay", "Voos por dia (seg–sex)", "Quantidade máxima de voos ativos que um aluno pode ter num mesmo dia de semana.")}
        {nullableField("weekendMaxFlightsPerDay", "Voos por dia (fim de semana)", "Quantidade máxima de voos ativos que um aluno pode ter num mesmo dia de sábado ou domingo.")}
        {nullableField("weeklyMaxFlights", "Voos por semana", "Quantidade máxima de voos agendados que o aluno pode ter na mesma semana (segunda a domingo, fim de semana incluído).")}
        {nullableField("weeklyMaxFlightHours", "Horas de voo por semana", "Total máximo de horas de voo (acionamento → corte, sem briefing/debriefing) que o aluno pode ter agendado na mesma semana, fim de semana incluído.", { step: 0.5 })}
        {nullableField("weekendMaxFlights", "Voos no fim de semana", "Quantidade máxima de voos que o aluno pode ter agendados no sábado + domingo da mesma semana.")}
        {nullableField("weekendMaxFlightHours", "Horas de voo no fim de semana", "Total máximo de horas de voo (acionamento → corte) que o aluno pode ter agendado no sábado + domingo da mesma semana.", { step: 0.5 })}
      </Section>

      <Section title="Créditos" description="Como o saldo de horas do aluno é exigido na hora de marcar o voo.">
        <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 space-y-2">
          <ToggleField
            label="Exigir crédito para marcar voo"
            tooltip="Quando ativado, o aluno só consegue marcar voos se tiver saldo de horas suficiente no modelo da aeronave (créditos − horas já voadas − horas futuras agendadas)."
            checked={schedule.requireCreditsForBooking}
            onChange={(next) => setSchedule({ requireCreditsForBooking: next })}
          />
          <ToggleField
            label="Aluno pode marcar 1 hora de voo se estiver zerado"
            tooltip="Exceção ao crédito obrigatório: com saldo entre 0 e -0,5h o aluno ainda consegue marcar um voo de até 1 hora. Ele verá um aviso de que precisa repor os créditos até o início do voo."
            checked={schedule.allowZeroCreditOneHour}
            onChange={(next) => setSchedule({ allowZeroCreditOneHour: next })}
          />
        </div>
      </Section>

      <Section title="Cancelamento" description="Multas progressivas conforme a proximidade da apresentação do voo.">
        {numberField("cancellationPenalty48hPct", "Multa < 48h (%)", "Percentual do tempo de voo debitado dos créditos quando o aluno cancela entre 24h e 48h antes da apresentação.", { max: 100 })}
        {numberField("cancellationPenalty24hPct", "Multa < 24h (%)", "Percentual debitado quando o cancelamento acontece entre 12h e 24h antes da apresentação.", { max: 100 })}
        {numberField("cancellationPenalty12hPct", "Multa < 12h (%)", "Percentual debitado quando o cancelamento acontece entre 1h e 12h antes da apresentação.", { max: 100 })}
        {numberField("cancellationPenalty1hPct", "Multa < 1h (%)", "Percentual debitado quando o cancelamento acontece com menos de 1 hora para a apresentação.", { max: 100 })}
        <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
          <ToggleField
            label="Descontar multa automaticamente"
            tooltip="Quando ativado, a multa de cancelamento é debitada dos créditos do aluno na hora, sem ação manual. O admin ainda pode isentar a multa ao cancelar pelo painel."
            checked={schedule.autoDebitCancellationPenalty}
            onChange={(next) => setSchedule({ autoDebitCancellationPenalty: next })}
          />
        </div>
      </Section>

      <ScheduleStudentHelpSection
        schedule={schedule}
        helpConfig={rules.scheduleStudentHelp}
        onChange={setHelpConfig}
      />

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </div>
  );
}
