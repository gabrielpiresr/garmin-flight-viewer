import { useState } from "react";
import type { AvailableDay, CrmLeadFilters } from "../../../types/crm";
import {
  AVAILABLE_DAY_LABELS,
  CRM_AVAILABLE_PERIOD_OPTIONS,
  CRM_COURSE_OPTIONS,
  CRM_START_DATE_OPTIONS,
  CRM_WEEKLY_HOURS_OPTIONS,
} from "../../../types/crm";
import { countActiveFilters, EMPTY_CRM_LEAD_FILTERS } from "../../../lib/crmLeadFilters";
import { estimateMaxLeadScore } from "../../../lib/crmLeadScore";
import type { CrmLeadScoreRule } from "../../../types/crm";

type Props = {
  filters: CrmLeadFilters;
  onChange: (filters: CrmLeadFilters) => void;
  open: boolean;
  onToggle: () => void;
  scoreRules: CrmLeadScoreRule[];
};

type FilterTab = "perfil" | "crm";

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
        ? options.find((o) => o.value === selected[0])?.label ?? "1"
        : `${selected.length}`;

  return (
    <div className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <details className="group relative">
        <summary className={`${inputCls} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <span className="flex items-center justify-between gap-2">
            <span className={`truncate ${selected.length > 0 ? "text-sky-300" : "text-slate-300"}`}>{summary}</span>
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
    <div className="col-span-2 block">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`text-[11px] tabular-nums ${active ? "text-sky-300" : "text-slate-400"}`}>
          {lo}{unit} – {hi}{unit}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-[var(--bg)] px-2.5 py-2">
        <input
          type="range"
          min={minBound}
          max={maxBound}
          step={step}
          value={lo}
          title="Mínimo"
          onChange={(e) => {
            const next = Number(e.target.value);
            const curMax = valueMax ?? maxBound;
            const adjMax = next > curMax ? next : valueMax;
            onChange(next <= minBound ? null : next, adjMax != null && adjMax >= maxBound ? null : adjMax);
          }}
          className="w-full accent-sky-500"
        />
        <input
          type="range"
          min={minBound}
          max={maxBound}
          step={step}
          value={hi}
          title="Máximo"
          onChange={(e) => {
            const next = Number(e.target.value);
            const curMin = valueMin ?? minBound;
            const adjMin = next < curMin ? next : valueMin;
            onChange(adjMin != null && adjMin <= minBound ? null : adjMin, next >= maxBound ? null : next);
          }}
          className="w-full accent-sky-500"
        />
      </div>
      {active && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className="mt-1 text-[10px] text-slate-500 hover:text-sky-400"
        >
          Limpar
        </button>
      )}
    </div>
  );
}

export function CrmFiltersPanel({ filters, onChange, open, onToggle, scoreRules }: Props) {
  const [tab, setTab] = useState<FilterTab>("perfil");
  const scoreUpper = estimateMaxLeadScore(scoreRules);
  const activeCount = countActiveFilters(filters);

  function set<K extends keyof CrmLeadFilters>(key: K, value: CrmLeadFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title="Filtros"
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
          activeCount > 0
            ? "border-sky-600 bg-sky-600/10 text-sky-300"
            : "border-slate-700 text-slate-300 hover:bg-slate-800"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
          <path d="M1.5 2.75a.75.75 0 0 0 0 1.5h.752l1.017 6.096a2.5 2.5 0 0 0 2.429 2.089h5.604a2.5 2.5 0 0 0 2.429-2.089l1.017-6.096h.752a.75.75 0 0 0 0-1.5H1.5ZM4.25 8.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75ZM6 10.5a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 0-1.5H6Z" />
        </svg>
        {activeCount > 0 ? (
          <span className="rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {activeCount}
          </span>
        ) : (
          <span className="hidden sm:inline">Filtros</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,480px)] max-h-[min(80vh,560px)] overflow-hidden rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <div className="flex gap-1">
                {([
                  ["perfil", "Perfil"],
                  ["crm", "CRM"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-md px-2.5 py-1 text-xs transition ${
                      tab === id ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(EMPTY_CRM_LEAD_FILTERS)}
                  className="text-[11px] text-slate-500 hover:text-slate-300"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 overflow-y-auto p-3" style={{ maxHeight: "min(72vh, 500px)" }}>
              {tab === "perfil" ? (
                <>
                  <MultiFilterGroup
                    label="Curso"
                    options={CRM_COURSE_OPTIONS.map((c) => ({ value: c, label: c }))}
                    selected={filters.desiredCourses}
                    onChange={(values) => set("desiredCourses", values)}
                  />
                  <MultiFilterGroup
                    label="Início"
                    options={CRM_START_DATE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    selected={filters.startDates}
                    onChange={(values) => set("startDates", values)}
                  />
                  <MultiFilterGroup
                    label="Horas/sem"
                    options={CRM_WEEKLY_HOURS_OPTIONS.map((h) => ({ value: String(h), label: `${h}h` }))}
                    selected={filters.weeklyHours}
                    onChange={(values) => set("weeklyHours", values)}
                  />
                  <MultiFilterGroup
                    label="Período"
                    options={CRM_AVAILABLE_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    selected={filters.availablePeriods}
                    onChange={(values) => set("availablePeriods", values)}
                  />
                  <MultiFilterGroup
                    label="Dias"
                    options={(Object.keys(AVAILABLE_DAY_LABELS) as AvailableDay[]).map((d) => ({
                      value: d,
                      label: AVAILABLE_DAY_LABELS[d],
                    }))}
                    selected={filters.availableDays}
                    onChange={(values) => set("availableDays", values as AvailableDay[])}
                  />
                  <MultiFilterGroup
                    label="Banca"
                    options={[
                      { value: "true", label: "Fez" },
                      { value: "false", label: "Não fez" },
                      { value: "unknown", label: "?" },
                    ]}
                    selected={filters.theoreticalExam}
                    onChange={(values) => set("theoreticalExam", values as CrmLeadFilters["theoreticalExam"])}
                  />
                  <RangeSliderFilter
                    label="Peso"
                    minBound={40}
                    maxBound={150}
                    unit="kg"
                    valueMin={filters.weightMin}
                    valueMax={filters.weightMax}
                    onChange={(min, max) => onChange({ ...filters, weightMin: min, weightMax: max })}
                  />
                  <RangeSliderFilter
                    label="Altura"
                    minBound={140}
                    maxBound={220}
                    unit="cm"
                    valueMin={filters.heightMin}
                    valueMax={filters.heightMax}
                    onChange={(min, max) => onChange({ ...filters, heightMin: min, heightMax: max })}
                  />
                </>
              ) : (
                <>
                  <MultiFilterGroup
                    label="Conta"
                    options={[
                      { value: "created", label: "Criada" },
                      { value: "pending", label: "Pendente" },
                    ]}
                    selected={filters.accountStatuses}
                    onChange={(values) => set("accountStatuses", values as CrmLeadFilters["accountStatuses"])}
                  />
                  <MultiFilterGroup
                    label="Transfer."
                    options={[
                      { value: "yes", label: "Sim" },
                      { value: "no", label: "Não" },
                    ]}
                    selected={filters.transferStatuses}
                    onChange={(values) => set("transferStatuses", values as CrmLeadFilters["transferStatuses"])}
                  />
                  <MultiFilterGroup
                    label="Qual."
                    options={[
                      { value: "filled", label: "OK" },
                      { value: "pending", label: "Pendente" },
                    ]}
                    selected={filters.qualStatuses}
                    onChange={(values) => set("qualStatuses", values as CrmLeadFilters["qualStatuses"])}
                  />
                  <MultiFilterGroup
                    label="FUPs"
                    options={[
                      { value: "overdue", label: "Vencidos" },
                      { value: "pending", label: "Pendentes" },
                      { value: "none", label: "Nenhum" },
                    ]}
                    selected={filters.fupStatuses}
                    onChange={(values) => set("fupStatuses", values as CrmLeadFilters["fupStatuses"])}
                  />
                  <MultiFilterGroup
                    label="Status exp."
                    options={[
                      { value: "expired", label: "Expirado" },
                      { value: "active", label: "Ativo" },
                    ]}
                    selected={filters.expiredStatuses}
                    onChange={(values) => set("expiredStatuses", values as CrmLeadFilters["expiredStatuses"])}
                  />
                  <RangeSliderFilter
                    label="Score"
                    minBound={0}
                    maxBound={scoreUpper}
                    valueMin={filters.scoreMin}
                    valueMax={filters.scoreMax}
                    onChange={(min, max) => onChange({ ...filters, scoreMin: min, scoreMax: max })}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
