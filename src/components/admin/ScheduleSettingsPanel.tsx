import { useEffect, useState } from "react";
import { getSchoolRules, saveSchoolRules } from "../../lib/schoolRulesDb";
import { DEFAULT_SCHOOL_RULES, type FlightScheduleRules, type SchoolRules } from "../../types/schoolRules";
import { useToast } from "../ui/ToastProvider";

type NumberKey = {
  [K in keyof FlightScheduleRules]: FlightScheduleRules[K] extends number ? K : never;
}[keyof FlightScheduleRules];

// Fields handled via plain number inputs
const NUMBER_FIELDS: Array<{ key: NumberKey; label: string; step?: number; max?: number }> = [
  { key: "bufferBeforeMinutes", label: "Minutos antes do acionamento (apresentação)", step: 5 },
  { key: "bufferAfterMinutes", label: "Minutos após o corte (encerramento)", step: 5 },
  { key: "weekdayMinHours", label: "Tempo mínimo em dia de semana (h)", step: 0.25 },
  { key: "weekdayMaxHours", label: "Tempo máximo em dia de semana (h)", step: 0.25 },
  { key: "weekendMinHours", label: "Tempo mínimo no fim de semana (h)", step: 0.25 },
  { key: "weekendMaxHours", label: "Tempo máximo no fim de semana (h)", step: 0.25 },
  { key: "minBookingLeadDays", label: "Antecedência mínima (dias)" },
  { key: "maxBookingLeadDays", label: "Antecedência máxima (dias)" },
  { key: "cancellationPenalty48hPct", label: "Multa com menos de 48h (%)", max: 100 },
  { key: "cancellationPenalty24hPct", label: "Multa com menos de 24h (%)", max: 100 },
  { key: "cancellationPenalty12hPct", label: "Multa com menos de 12h (%)", max: 100 },
  { key: "cancellationPenalty1hPct", label: "Multa com menos de 1h (%)", max: 100 },
];

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

export function ScheduleSettingsPanel() {
  const { showToast } = useToast();
  const [rules, setRules] = useState<SchoolRules>(DEFAULT_SCHOOL_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSchoolRules()
      .then(setRules)
      .catch((error) => showToast({ variant: "error", message: (error as Error).message }))
      .finally(() => setLoading(false));
  }, [showToast]);

  function setSchedule(patch: Partial<FlightScheduleRules>) {
    setRules((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));
  }

  async function save() {
    const schedule = rules.schedule;
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
    <section className="space-y-5 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Configurações da escala</h2>
        <p className="text-xs text-slate-500">Regras aplicadas no servidor ao visualizar, solicitar e cancelar voos.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs text-slate-400 md:col-span-2">Formato da escala
          <select value={rules.schedule.mode} onChange={(event) => setSchedule({ mode: event.target.value as FlightScheduleRules["mode"] })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white">
            <option value="booking">Aberta para agendamento de horários livres</option>
            <option value="view">Aberta somente para visualização</option>
            <option value="closed">Fechada</option>
            <option value="intentions">Via intenções</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">Tamanho dos slots
          <select value={rules.schedule.slotMinutes} onChange={(event) => setSchedule({ slotMinutes: Number(event.target.value) as 15 | 30 | 45 | 60 })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white">
            {[15, 30, 45, 60].map((value) => <option key={value} value={value}>{value} minutos</option>)}
          </select>
        </label>

        {/* Horário inicial de acionamento (bug 3) */}
        <label className="text-xs text-slate-400">Horário inicial de acionamento
          <input
            type="time"
            value={rules.schedule.scheduleStartTime}
            onChange={(e) => setSchedule({ scheduleStartTime: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          />
        </label>

        {/* Início do período noturno em HH:MM (bug 2) */}
        <label className="text-xs text-slate-400">Início do período noturno (HH:MM)
          <input
            type="time"
            value={hoursToHHMM(rules.schedule.nightFlightStartHour)}
            onChange={(e) => setSchedule({ nightFlightStartHour: hhmmToHours(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
          />
        </label>

        {NUMBER_FIELDS.map((field) => (
          <label key={field.key} className="text-xs text-slate-400">{field.label}
            <input type="number" min={0} max={field.max} step={field.step ?? 1} value={rules.schedule[field.key]} onChange={(event) => setSchedule({ [field.key]: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
        ))}
        {([
          ["weekdayMaxFlightsPerDay", "Voos por aluno/dia de semana"],
          ["weekendMaxFlightsPerDay", "Voos por aluno/dia no fim de semana"],
        ] as const).map(([key, label]) => (
          <label key={key} className="text-xs text-slate-400">{label} (vazio = ilimitado)
            <input type="number" min={1} value={rules.schedule[key] ?? ""} onChange={(event) => setSchedule({ [key]: event.target.value ? Number(event.target.value) : null })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
        ))}
      </div>
      <div className="grid gap-2">
        {([
          ["requireCreditsForBooking", "Exigir crédito para marcar voo"],
          ["allowNightFlights", "Permitir voos noturnos"],
          ["autoDebitCancellationPenalty", "Descontar multa automaticamente"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950/30 p-3 text-sm text-slate-200">
            <input type="checkbox" checked={rules.schedule[key]} onChange={(event) => setSchedule({ [key]: event.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      {rules.schedule.allowNightFlights ? (
        <div>
          <p className="mb-2 text-xs text-slate-400">Dias permitidos para agendamento noturno</p>
          <div className="flex flex-wrap gap-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label, day) => (
              <label key={label} className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">
                <input type="checkbox" checked={rules.schedule.nightBookingWeekdays.includes(day)} onChange={(event) => setSchedule({ nightBookingWeekdays: event.target.checked ? [...new Set([...rules.schedule.nightBookingWeekdays, day])] : rules.schedule.nightBookingWeekdays.filter((value) => value !== day) })} />
                {label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex justify-end">
        <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </section>
  );
}
