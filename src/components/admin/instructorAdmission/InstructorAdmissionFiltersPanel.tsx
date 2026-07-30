import type { InstructorAdmissionFilters } from "../../../lib/instructorAdmissionFilters";
import {
  countInstructorAdmissionFilters,
  EMPTY_INSTRUCTOR_ADMISSION_FILTERS,
} from "../../../lib/instructorAdmissionFilters";
import type { InstructorAdmissionCandidateSource } from "../../../types/instructorAdmission";

type Props = {
  filters: InstructorAdmissionFilters;
  onChange: (filters: InstructorAdmissionFilters) => void;
  open: boolean;
  onToggle: () => void;
  referralOptions: string[];
  scoreUpper: number;
  hoursUpper: number;
};

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-[var(--bg)] px-2.5 py-1.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none";

const SOURCE_OPTIONS: { value: InstructorAdmissionCandidateSource; label: string }[] = [
  { value: "form", label: "Via formulário" },
  { value: "instructor", label: "Instrutor ativo" },
  { value: "manual", label: "Manual" },
];

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
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-slate-500">Nenhuma opção</p>
          ) : (
            options.map((opt) => (
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
            ))
          )}
        </div>
      </details>
    </div>
  );
}

function RangeFilter({
  label,
  minBound,
  maxBound,
  unit = "",
  valueMin,
  valueMax,
  onChange,
}: {
  label: string;
  minBound: number;
  maxBound: number;
  unit?: string;
  valueMin: number | null;
  valueMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const active = valueMin != null || valueMax != null;
  return (
    <div className="block sm:col-span-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        {active && (
          <button type="button" onClick={() => onChange(null, null)} className="text-[10px] text-slate-500 hover:text-sky-400">
            Limpar
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          placeholder={`Mín ${minBound}${unit}`}
          value={valueMin ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value), valueMax)}
          className={inputCls}
        />
        <input
          type="number"
          placeholder={`Máx ${maxBound}${unit}`}
          value={valueMax ?? ""}
          onChange={(e) => onChange(valueMin, e.target.value === "" ? null : Number(e.target.value))}
          className={inputCls}
        />
      </div>
    </div>
  );
}

export function InstructorAdmissionFiltersPanel({
  filters,
  onChange,
  open,
  onToggle,
  referralOptions,
  scoreUpper,
  hoursUpper,
}: Props) {
  const activeCount = countInstructorAdmissionFilters(filters);

  function set<K extends keyof InstructorAdmissionFilters>(key: K, value: InstructorAdmissionFilters[K]) {
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
          <div className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-xl border border-slate-700/60 bg-[var(--panel)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <p className="text-xs font-semibold text-slate-200">Filtros</p>
              <button
                type="button"
                onClick={() => onChange(EMPTY_INSTRUCTOR_ADMISSION_FILTERS)}
                className="text-[11px] text-slate-500 hover:text-sky-400"
              >
                Limpar tudo
              </button>
            </div>
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <MultiFilterGroup
                label="Origem"
                options={SOURCE_OPTIONS}
                selected={filters.sources}
                onChange={(values) => set("sources", values as InstructorAdmissionCandidateSource[])}
              />
              <MultiFilterGroup
                label="Fonte / campanha"
                options={referralOptions.map((r) => ({ value: r, label: r }))}
                selected={filters.referralSources}
                onChange={(values) => set("referralSources", values)}
              />
              <MultiFilterGroup
                label="Conta"
                options={[
                  { value: "linked", label: "Vinculada" },
                  { value: "pending", label: "Sem conta" },
                ]}
                selected={filters.accountStatuses}
                onChange={(values) => set("accountStatuses", values as Array<"linked" | "pending">)}
              />
              <MultiFilterGroup
                label="Formulário"
                options={[
                  { value: "filled", label: "Preenchido" },
                  { value: "pending", label: "Pendente" },
                ]}
                selected={filters.formStatuses}
                onChange={(values) => set("formStatuses", values as Array<"filled" | "pending">)}
              />
              <RangeFilter
                label="Score"
                minBound={0}
                maxBound={Math.max(scoreUpper, 1)}
                valueMin={filters.scoreMin}
                valueMax={filters.scoreMax}
                onChange={(min, max) => onChange({ ...filters, scoreMin: min, scoreMax: max })}
              />
              <RangeFilter
                label="Horas totais"
                minBound={0}
                maxBound={Math.max(Math.ceil(hoursUpper), 1)}
                unit="h"
                valueMin={filters.totalHoursMin}
                valueMax={filters.totalHoursMax}
                onChange={(min, max) => onChange({ ...filters, totalHoursMin: min, totalHoursMax: max })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
