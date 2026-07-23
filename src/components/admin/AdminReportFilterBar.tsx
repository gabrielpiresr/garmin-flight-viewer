import { useState } from "react";

export type PeriodPresetKey = "custom" | "last3" | "thisWeek" | "thisMonth" | "last30" | "thisYear" | "lastYear" | "all";

export type MultiFilterKey = "instructors" | "students" | "aircrafts";

export const PERIOD_PRESETS: Array<{ key: PeriodPresetKey; label: string }> = [
  { key: "custom", label: "Personalizado" },
  { key: "last3", label: "Últimos 3 dias" },
  { key: "thisWeek", label: "Essa semana" },
  { key: "thisMonth", label: "Esse mês" },
  { key: "last30", label: "Últimos 30 dias" },
  { key: "thisYear", label: "Esse ano" },
  { key: "lastYear", label: "Ano passado" },
  { key: "all", label: "Todo período" },
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfIsoWeek(dateText: string): string {
  const date = new Date(`${dateText.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText.slice(0, 10);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return isoDate(date);
}

function endOfIsoWeek(dateText: string): string {
  const date = new Date(`${startOfIsoWeek(dateText)}T00:00:00`);
  date.setDate(date.getDate() + 6);
  return isoDate(date);
}

export function periodForPreset(key: PeriodPresetKey): { fromDate: string; toDate: string } {
  const today = new Date();
  const todayIso = isoDate(today);
  if (key === "all" || key === "custom") return { fromDate: "", toDate: "" };
  if (key === "thisWeek") return { fromDate: startOfIsoWeek(todayIso), toDate: endOfIsoWeek(todayIso) };
  if (key === "thisMonth") return { fromDate: `${todayIso.slice(0, 8)}01`, toDate: todayIso };
  if (key === "last3") {
    const from = new Date(today);
    from.setDate(from.getDate() - 2);
    return { fromDate: isoDate(from), toDate: todayIso };
  }
  if (key === "last30") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { fromDate: isoDate(from), toDate: todayIso };
  }
  if (key === "thisYear") return { fromDate: `${todayIso.slice(0, 4)}-01-01`, toDate: todayIso };
  const year = Number(todayIso.slice(0, 4)) - 1;
  return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` };
}

export function FilterMultiSelect({
  label,
  options,
  value,
  open,
  onOpen,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  open: boolean;
  onOpen: () => void;
  onChange: (value: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const selected = new Set(value);
  const buttonLabel =
    value.length === 0 ? `Todas ${label.toLowerCase()}` : value.length === 1 ? value[0] : `${value.length} selecionados`;
  const visibleOptions = options.filter((item) => item.toLowerCase().includes(search.trim().toLowerCase()));

  function toggle(item: string) {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    onChange(Array.from(next));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-10 w-full items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950 px-3 text-left text-sm text-slate-100 outline-none hover:border-slate-600"
      >
        <span className="min-w-0 truncate">
          <span className="text-slate-500">{label}: </span>
          {buttonLabel}
        </span>
        <svg className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.22 7.22a.75.75 0 011.06 0L10 10.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded border border-slate-700 bg-slate-950 p-2 shadow-2xl shadow-slate-950">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Pesquisar ${label.toLowerCase()}`}
            className="mb-2 h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => onChange([])}
            className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${value.length === 0 ? "bg-emerald-500/10 text-emerald-300" : "text-slate-300 hover:bg-slate-800"}`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${value.length === 0 ? "border-emerald-400 bg-emerald-500/20" : "border-slate-600"}`}>
              {value.length === 0 ? "✓" : ""}
            </span>
            Todas
          </button>
          {visibleOptions.map((item) => (
            <label key={item} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-slate-300 hover:bg-slate-800">
              <input type="checkbox" checked={selected.has(item)} onChange={() => toggle(item)} className="h-4 w-4 accent-emerald-500" />
              <span className="min-w-0 truncate">{item}</span>
            </label>
          ))}
          {!visibleOptions.length ? <p className="px-2 py-3 text-xs text-slate-500">Nenhuma opção encontrada.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export type AdminReportFilterState = {
  periodPreset: PeriodPresetKey;
  fromDate: string;
  toDate: string;
  instructors: string[];
  students: string[];
  aircrafts: string[];
};

type Props = {
  state: AdminReportFilterState;
  options: {
    instructors: string[];
    students: string[];
    aircrafts: string[];
  };
  openFilter: MultiFilterKey | null;
  onOpenFilter: (key: MultiFilterKey | null) => void;
  onChange: (patch: Partial<AdminReportFilterState>) => void;
};

export function AdminReportFilterBar({ state, options, openFilter, onOpenFilter, onChange }: Props) {
  function setPresetPeriod(key: PeriodPresetKey) {
    const next = periodForPreset(key);
    onChange({ periodPreset: key, fromDate: next.fromDate, toDate: next.toDate });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <select
        value={state.periodPreset}
        onChange={(e) => setPresetPeriod(e.target.value as PeriodPresetKey)}
        className="h-10 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
      >
        {PERIOD_PRESETS.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={state.fromDate}
        onChange={(e) => onChange({ fromDate: e.target.value, periodPreset: "custom" })}
        className="h-10 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
      />
      <input
        type="date"
        value={state.toDate}
        onChange={(e) => onChange({ toDate: e.target.value, periodPreset: "custom" })}
        className="h-10 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
      />
      <FilterMultiSelect
        label="Instrutores"
        options={options.instructors}
        value={state.instructors}
        open={openFilter === "instructors"}
        onOpen={() => onOpenFilter(openFilter === "instructors" ? null : "instructors")}
        onChange={(instructors) => onChange({ instructors })}
      />
      <FilterMultiSelect
        label="Alunos"
        options={options.students}
        value={state.students}
        open={openFilter === "students"}
        onOpen={() => onOpenFilter(openFilter === "students" ? null : "students")}
        onChange={(students) => onChange({ students })}
      />
      <FilterMultiSelect
        label="Aviões"
        options={options.aircrafts}
        value={state.aircrafts}
        open={openFilter === "aircrafts"}
        onOpen={() => onOpenFilter(openFilter === "aircrafts" ? null : "aircrafts")}
        onChange={(aircrafts) => onChange({ aircrafts })}
      />
    </div>
  );
}
