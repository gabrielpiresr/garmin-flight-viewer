import type { AvailableDay, AvailablePeriod } from "../types/crm";
import { AVAILABLE_DAY_LABELS } from "../types/crm";
import {
  AVAILABILITY_ALL_DAYS,
  AVAILABILITY_PRESETS,
  emptyAvailabilityValue,
  formatAvailabilitySummary,
  isAvailabilityComplete,
  type AvailabilityPreset,
  type AvailabilityValue,
} from "../lib/availabilityPresets";

export { formatAvailabilitySummary, isAvailabilityComplete };

type Props = {
  value: AvailabilityValue | undefined;
  onChange: (value: AvailabilityValue) => void;
  disabled?: boolean;
  error?: boolean;
  helpText?: string;
};

/** UI de disponibilidade idêntica à qualificação do aluno (presets + dias + período). */
export function AvailabilityPicker({ value, onChange, disabled, error, helpText }: Props) {
  const current = value?.kind === "availability" ? value : emptyAvailabilityValue();
  const isCustom = current.preset === "personalizado";
  const isLocked = current.preset !== null && !isCustom;

  function applyPreset(preset: AvailabilityPreset) {
    if (preset.id === "personalizado") {
      onChange({ ...current, preset: "personalizado" });
      return;
    }
    onChange({
      kind: "availability",
      preset: preset.id,
      days: [...preset.days],
      period: preset.period ?? "ambos",
    });
  }

  function toggleDay(day: AvailableDay) {
    if (isLocked) return;
    const days = current.days.includes(day)
      ? current.days.filter((d) => d !== day)
      : [...current.days, day];
    onChange({ ...current, days, preset: "personalizado" });
  }

  function setPeriod(period: AvailablePeriod) {
    if (isLocked) return;
    onChange({
      ...current,
      period: period === current.period ? "" : period,
      preset: "personalizado",
    });
  }

  return (
    <div className="mt-2 space-y-4">
      {helpText ? <p className="text-xs text-slate-500 leading-relaxed">{helpText}</p> : null}

      <div
        className={`grid grid-cols-3 gap-2 rounded-xl sm:grid-cols-6 ${error ? "ring-1 ring-red-500 p-2" : ""}`}
      >
        {AVAILABILITY_PRESETS.map((preset) => {
          const isActive = current.preset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(preset)}
              className={`flex flex-col items-center rounded-xl border p-3 text-center transition disabled:opacity-50 ${
                isActive
                  ? "border-sky-500 bg-sky-500/15"
                  : "border-slate-700 bg-slate-800/30 hover:border-slate-600"
              }`}
            >
              <span className="mb-1 text-lg">{preset.icon}</span>
              <span
                className={`text-[11px] font-semibold leading-tight ${isActive ? "text-sky-200" : "text-slate-200"}`}
              >
                {preset.label}
              </span>
              <span className="mt-0.5 text-[10px] leading-tight text-slate-500">{preset.sub}</span>
            </button>
          );
        })}
      </div>

      {current.preset !== null && (
        <div
          className={`space-y-3 rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 transition ${
            isLocked ? "opacity-50 pointer-events-none select-none" : ""
          }`}
        >
          {isLocked && (
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Configuração do preset — selecione &quot;Personalizado&quot; para editar
            </p>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">Dias da semana</p>
            <div className="flex gap-1.5">
              {AVAILABILITY_ALL_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  disabled={disabled || isLocked}
                  onClick={() => toggleDay(day)}
                  className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition disabled:opacity-50 ${
                    current.days.includes(day)
                      ? "border-sky-500 bg-sky-500/20 text-sky-200"
                      : "border-slate-700 bg-slate-800/30 text-slate-500"
                  }`}
                >
                  {AVAILABLE_DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">Período preferido</p>
            <div className="flex gap-2">
              {(["manha", "tarde", "ambos"] as AvailablePeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={disabled || isLocked}
                  onClick={() => setPeriod(p)}
                  className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition disabled:opacity-50 ${
                    current.period === p
                      ? "border-sky-500 bg-sky-500/20 text-sky-200"
                      : "border-slate-700 bg-slate-800/30 text-slate-500"
                  }`}
                >
                  {p === "manha" ? "☀️ Manhã" : p === "tarde" ? "🌆 Tarde" : "✨ Ambos"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
