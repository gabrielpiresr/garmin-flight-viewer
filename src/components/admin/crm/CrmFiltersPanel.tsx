import type { AvailableDay, CrmLeadFilters } from "../../../types/crm";
import {
  AVAILABLE_DAY_LABELS,
  CRM_AVAILABLE_PERIOD_OPTIONS,
  CRM_COURSE_OPTIONS,
  CRM_START_DATE_OPTIONS,
  CRM_WEEKLY_HOURS_OPTIONS,
} from "../../../types/crm";
import { EMPTY_CRM_LEAD_FILTERS, hasActiveFilters } from "../../../lib/crmLeadFilters";
import { estimateMaxLeadScore } from "../../../lib/crmLeadScore";
import type { CrmLeadScoreRule } from "../../../types/crm";

type Props = {
  filters: CrmLeadFilters;
  onChange: (filters: CrmLeadFilters) => void;
  open: boolean;
  onToggle: () => void;
  scoreRules: CrmLeadScoreRule[];
};

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none";

function MultiFilterGroup({
  label,
  options,
  selected,
  onChange,
  emptyLabel = "Todos",
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  emptyLabel?: string;
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const summary =
    selected.length === 0
      ? emptyLabel
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? "1 selecionado"
        : `${selected.length} selecionados`;

  return (
    <div className="block text-[11px] text-slate-500">
      <span className="mb-1 block font-medium text-slate-300">{label}</span>
      <details className="group relative">
        <summary className={`${inputCls} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-slate-200">{summary}</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-slate-500 group-open:rotate-180 transition">
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </span>
        </summary>
        <div className="absolute left-0 right-0 z-10 mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-700 bg-[var(--panel)] p-1 shadow-xl">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-800/60"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="h-3.5 w-3.5 rounded accent-sky-500"
              />
              <span className="text-xs text-slate-200">{opt.label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function RangeSliderFilter({
  label,
  minBound,
  maxBound,
  step = 1,
  unit = "",
  valueMin,
  valueMax,
  onChange,
}: {
  label: string;
  minBound: number;
  maxBound: number;
  step?: number;
  unit?: string;
  valueMin: number | null;
  valueMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const lo = valueMin ?? minBound;
  const hi = valueMax ?? maxBound;
  const active = valueMin != null || valueMax != null;

  return (
    <div className="col-span-2 block text-[11px] text-slate-500">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-300">{label}</span>
        <span className="text-slate-400">
          {lo}{unit} — {hi}{unit}
          {active && (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="ml-2 text-[10px] text-sky-400 hover:text-sky-300"
            >
              limpar
            </button>
          )}
        </span>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-800 bg-[var(--bg)] px-3 py-2.5">
        <div>
          <span className="mb-1 block text-[10px] text-slate-500">Mínimo</span>
          <input
            type="range"
            min={minBound}
            max={maxBound}
            step={step}
            value={lo}
            onChange={(e) => {
              const next = Number(e.target.value);
              const curMax = valueMax ?? maxBound;
              const adjMax = next > curMax ? next : valueMax;
              onChange(next <= minBound ? null : next, adjMax != null && adjMax >= maxBound ? null : adjMax);
            }}
            className="w-full accent-sky-500"
          />
        </div>
        <div>
          <span className="mb-1 block text-[10px] text-slate-500">Máximo</span>
          <input
            type="range"
            min={minBound}
            max={maxBound}
            step={step}
            value={hi}
            onChange={(e) => {
              const next = Number(e.target.value);
              const curMin = valueMin ?? minBound;
              const adjMin = next < curMin ? next : valueMin;
              onChange(adjMin != null && adjMin <= minBound ? null : adjMin, next >= maxBound ? null : next);
            }}
            className="w-full accent-sky-500"
          />
        </div>
      </div>
    </div>
  );
}

export function CrmFiltersPanel({ filters, onChange, open, onToggle, scoreRules }: Props) {
  const scoreUpper = estimateMaxLeadScore(scoreRules);

  function set<K extends keyof CrmLeadFilters>(key: K, value: CrmLeadFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
          hasActiveFilters(filters)
            ? "border-sky-600 bg-sky-600/10 text-sky-300"
            : "border-slate-700 text-slate-300 hover:bg-slate-800"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M1.5 2.75a.75.75 0 0 0 0 1.5h.752l1.017 6.096a2.5 2.5 0 0 0 2.429 2.089h5.604a2.5 2.5 0 0 0 2.429-2.089l1.017-6.096h.752a.75.75 0 0 0 0-1.5H1.5ZM4.25 8.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75ZM6 10.5a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 0-1.5H6Z" />
        </svg>
        Filtros
        {hasActiveFilters(filters) && (
          <span className="rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">ativo</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,560px)] max-h-[min(80vh,640px)] overflow-y-auto rounded-xl border border-slate-700/60 bg-[var(--panel)] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-200">Filtrar leads</p>
              <button
                type="button"
                onClick={() => onChange(EMPTY_CRM_LEAD_FILTERS)}
                className="text-[11px] text-slate-500 hover:text-slate-300"
              >
                Limpar filtros
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MultiFilterGroup
                label="Curso desejado"
                options={CRM_COURSE_OPTIONS.map((c) => ({ value: c, label: c }))}
                selected={filters.desiredCourses}
                onChange={(values) => set("desiredCourses", values)}
              />
              <MultiFilterGroup
                label="Início dos voos"
                options={CRM_START_DATE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                selected={filters.startDates}
                onChange={(values) => set("startDates", values)}
              />
              <MultiFilterGroup
                label="Horas por semana"
                options={CRM_WEEKLY_HOURS_OPTIONS.map((h) => ({ value: String(h), label: `${h} h/sem` }))}
                selected={filters.weeklyHours}
                onChange={(values) => set("weeklyHours", values)}
                emptyLabel="Todas"
              />
              <MultiFilterGroup
                label="Período disponível"
                options={CRM_AVAILABLE_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                selected={filters.availablePeriods}
                onChange={(values) => set("availablePeriods", values)}
              />
              <MultiFilterGroup
                label="Dias disponíveis"
                options={(Object.keys(AVAILABLE_DAY_LABELS) as AvailableDay[]).map((d) => ({
                  value: d,
                  label: AVAILABLE_DAY_LABELS[d],
                }))}
                selected={filters.availableDays}
                onChange={(values) => set("availableDays", values as AvailableDay[])}
              />
              <MultiFilterGroup
                label="Banca teórica"
                options={[
                  { value: "true", label: "Já fez banca" },
                  { value: "false", label: "Ainda não fez" },
                  { value: "unknown", label: "Não informado" },
                ]}
                selected={filters.theoreticalExam}
                onChange={(values) => set("theoreticalExam", values as CrmLeadFilters["theoreticalExam"])}
              />
              <MultiFilterGroup
                label="Conta na plataforma"
                options={[
                  { value: "created", label: "Conta criada" },
                  { value: "pending", label: "Sem conta" },
                ]}
                selected={filters.accountStatuses}
                onChange={(values) => set("accountStatuses", values as CrmLeadFilters["accountStatuses"])}
              />
              <MultiFilterGroup
                label="Transferência"
                options={[
                  { value: "yes", label: "É transferência" },
                  { value: "no", label: "Não é transferência" },
                ]}
                selected={filters.transferStatuses}
                onChange={(values) => set("transferStatuses", values as CrmLeadFilters["transferStatuses"])}
              />
              <MultiFilterGroup
                label="Qualificação"
                options={[
                  { value: "filled", label: "Preenchida" },
                  { value: "pending", label: "Pendente" },
                ]}
                selected={filters.qualStatuses}
                onChange={(values) => set("qualStatuses", values as CrmLeadFilters["qualStatuses"])}
                emptyLabel="Todas"
              />
              <MultiFilterGroup
                label="Follow-ups"
                options={[
                  { value: "overdue", label: "Com vencidos" },
                  { value: "pending", label: "Com pendentes" },
                  { value: "none", label: "Sem FUPs abertos" },
                ]}
                selected={filters.fupStatuses}
                onChange={(values) => set("fupStatuses", values as CrmLeadFilters["fupStatuses"])}
              />
              <MultiFilterGroup
                label="Expiração do status"
                options={[
                  { value: "expired", label: "Expirados" },
                  { value: "active", label: "Ativos" },
                ]}
                selected={filters.expiredStatuses}
                onChange={(values) => set("expiredStatuses", values as CrmLeadFilters["expiredStatuses"])}
              />
              <RangeSliderFilter
                label="Peso do aluno"
                minBound={40}
                maxBound={150}
                unit=" kg"
                valueMin={filters.weightMin}
                valueMax={filters.weightMax}
                onChange={(min, max) => onChange({ ...filters, weightMin: min, weightMax: max })}
              />
              <RangeSliderFilter
                label="Altura do aluno"
                minBound={140}
                maxBound={220}
                unit=" cm"
                valueMin={filters.heightMin}
                valueMax={filters.heightMax}
                onChange={(min, max) => onChange({ ...filters, heightMin: min, heightMax: max })}
              />
              <RangeSliderFilter
                label="Lead score"
                minBound={0}
                maxBound={scoreUpper}
                valueMin={filters.scoreMin}
                valueMax={filters.scoreMax}
                onChange={(min, max) => onChange({ ...filters, scoreMin: min, scoreMax: max })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
