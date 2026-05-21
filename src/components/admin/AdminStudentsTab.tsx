import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { getAdminStudentsProgress, getAdminUserDetail } from "../../lib/adminUsersDb";
import type { AdminStudentAgendaBucketKey, AdminStudentProgressRow, AdminStudentProgressStatus, AdminStudentsProgressData } from "../../types/adminStudents";
import type { AdminUserDetail, AdminUserFlight, AdminUserPlannedFlight } from "../../types/adminUsers";
import { FlightDetailView } from "../FlightDetailView";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import { AdminUserCreditsSection } from "./AdminUserCreditsSection";

const DEFAULT_INACTIVE_DAYS = 14;
const INACTIVE_OPTIONS = [7, 14, 21, 30] as const;
const FILTER_STORAGE_KEY = "admin-students-filter-presets-v1";
const COLUMNS_STORAGE_KEY = "admin-students-columns-v1";

type SortDirection = "asc" | "desc";
type StudentColumnCategory = "identity" | "training" | "activity" | "alerts" | "hours" | "agenda";
type StudentColumnKey =
  | "student"
  | "email"
  | "anac"
  | "status"
  | "track"
  | "trackProgress"
  | "hours"
  | "flights"
  | "landings"
  | "daysSinceLastFlight"
  | "lastFlight"
  | "nextFlight"
  | "alertRisk"
  | "alertAttention"
  | "alertLight"
  | "navigationHours"
  | "ifrHours"
  | "nightHours"
  | "navigationDistanceNm"
  | "today"
  | "tomorrow"
  | "week";

type ColumnDef = {
  key: StudentColumnKey;
  label: string;
  category: StudentColumnCategory;
  compact?: boolean;
  widthClass?: string;
  sortable?: boolean;
  format: (student: AdminStudentProgressRow) => string;
  render?: (student: AdminStudentProgressRow) => React.ReactNode;
  sortValue?: (student: AdminStudentProgressRow) => string | number | null;
};

type NumericRange = { min: string; max: string };
type StudentFilters = {
  daysWithoutFlying: NumericRange;
  tracks: string[];
  hours: NumericRange;
  progress: NumericRange;
  flights: NumericRange;
  landings: NumericRange;
};

type SavedStudentPreset = {
  name: string;
  filters: StudentFilters;
  selectedColumns: StudentColumnKey[];
};

const EMPTY_RANGE: NumericRange = { min: "", max: "" };
const DEFAULT_FILTERS: StudentFilters = {
  daysWithoutFlying: { ...EMPTY_RANGE },
  tracks: [],
  hours: { ...EMPTY_RANGE },
  progress: { ...EMPTY_RANGE },
  flights: { ...EMPTY_RANGE },
  landings: { ...EMPTY_RANGE },
};

const DEFAULT_COLUMNS: StudentColumnKey[] = [
  "student",
  "status",
  "track",
  "trackProgress",
  "hours",
  "flights",
  "landings",
  "daysSinceLastFlight",
  "alertRisk",
  "alertAttention",
  "alertLight",
  "navigationHours",
  "ifrHours",
  "nightHours",
  "navigationDistanceNm",
  "nextFlight",
];

const BUCKET_LABEL: Record<AdminStudentAgendaBucketKey, string> = {
  yesterday: "Voaram ontem",
  today: "Voam hoje",
  tomorrow: "Voam amanha",
  week: "Voam nessa semana",
};

const STATUS_LABEL: Record<AdminStudentProgressStatus, string> = {
  active: "Em ritmo",
  watch: "Observar",
  inactive: "Sem voar",
  noFlights: "Sem voos",
};

const STATUS_CLASS: Record<AdminStudentProgressStatus, string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  watch: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  inactive: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  noFlights: "border-slate-600 bg-slate-800/60 text-slate-300",
};

const CATEGORY_LABELS: Record<StudentColumnCategory, string> = {
  identity: "Identificacao",
  training: "Trilha",
  activity: "Atividade",
  alerts: "Alertas",
  hours: "Horas especiais",
  agenda: "Agenda",
};

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(flight: AdminUserFlight): string {
  return `${formatDate(flight.flightDate ?? flight.createdAt)}${flight.startTime ? ` ${flight.startTime}` : ""}`;
}

function formatHours(value: number | null | undefined): string {
  return `${(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  return (value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function formatDuration(seconds: number | null | undefined): string {
  return seconds ? formatHours(seconds / 3600) : "-";
}

function displayName(student: Pick<AdminStudentProgressRow, "profile" | "name" | "email" | "userId">): string {
  return student.profile.fullName || student.name || student.email || student.userId;
}

function searchText(student: AdminStudentProgressRow): string {
  return [displayName(student), student.email, student.profile.anacCode, student.userId, student.trainingProgress?.trackName]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function lastFlightLabel(student: AdminStudentProgressRow): string {
  if (student.daysSinceLastFlight === null) return "Sem voos executados";
  if (student.daysSinceLastFlight === 0) return "Voou hoje";
  if (student.daysSinceLastFlight === 1) return "1 dia sem voar";
  return `${student.daysSinceLastFlight} dias sem voar`;
}

function isExpiredDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const [day, month, year] = value.includes("/") ? value.split("/") : value.split("-").reverse();
  const date = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59);
  return Number.isFinite(date.getTime()) && date < new Date();
}

function rangeMatches(value: number | null | undefined, range: NumericRange): boolean {
  const min = range.min.trim() === "" ? null : Number(range.min);
  const max = range.max.trim() === "" ? null : Number(range.max);
  const current = value ?? 0;
  if (min !== null && Number.isFinite(min) && current < min) return false;
  if (max !== null && Number.isFinite(max) && current > max) return false;
  return true;
}

function csvEscape(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportCsv(rows: AdminStudentProgressRow[], columns: ColumnDef[]) {
  const header = columns.map((column) => csvEscape(column.label)).join(";");
  const body = rows.map((row) => columns.map((column) => csvEscape(column.format(row))).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `alunos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function sanitizeColumns(value: unknown): StudentColumnKey[] {
  const valid = new Set(COLUMNS.map((column) => column.key));
  const columns = Array.isArray(value) ? value.filter((key): key is StudentColumnKey => typeof key === "string" && valid.has(key as StudentColumnKey)) : [];
  return columns.length ? columns : DEFAULT_COLUMNS;
}

function readPresets(): SavedStudentPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readColumns(): StudentColumnKey[] {
  try {
    return sanitizeColumns(JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) || "[]"));
  } catch {
    return DEFAULT_COLUMNS;
  }
}

function sortRows(rows: AdminStudentProgressRow[], column: ColumnDef | undefined, direction: SortDirection): AdminStudentProgressRow[] {
  if (!column) return rows;
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = column.sortValue?.(a) ?? column.format(a);
    const bv = column.sortValue?.(b) ?? column.format(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * multiplier;
    return String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { numeric: true }) * multiplier;
  });
}

function TrackProgress({ student }: { student: AdminStudentProgressRow }) {
  const progress = student.trainingProgress?.percentComplete ?? 0;
  return (
    <div className="min-w-36">
      <div className="flex items-center justify-between gap-2">
        <span className="max-w-40 truncate text-slate-200">{student.trainingProgress?.trackName || "Sem trilha"}</span>
        <span className="tabular-nums text-slate-400">{progress}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
      </div>
    </div>
  );
}

const COLUMNS: ColumnDef[] = [
  { key: "student", label: "Aluno", category: "identity", widthClass: "min-w-56 w-56", sortable: true, format: displayName, sortValue: displayName },
  { key: "email", label: "Email", category: "identity", widthClass: "min-w-56 w-56", sortable: true, format: (row) => row.email || "", sortValue: (row) => row.email || "" },
  { key: "anac", label: "ANAC", category: "identity", compact: true, widthClass: "min-w-24 w-24", sortable: true, format: (row) => row.profile.anacCode || "", sortValue: (row) => row.profile.anacCode || "" },
  { key: "status", label: "Status", category: "activity", widthClass: "min-w-32 w-32", sortable: true, format: (row) => STATUS_LABEL[row.status], sortValue: (row) => row.status },
  { key: "track", label: "Trilha", category: "training", widthClass: "min-w-52 w-52", sortable: true, format: (row) => row.trainingProgress?.trackName || "", sortValue: (row) => row.trainingProgress?.trackName || "" },
  { key: "trackProgress", label: "% trilha", category: "training", widthClass: "min-w-48 w-48", sortable: true, format: (row) => `${row.trainingProgress?.percentComplete ?? 0}%`, render: (row) => <TrackProgress student={row} />, sortValue: (row) => row.trainingProgress?.percentComplete ?? 0 },
  { key: "hours", label: "Horas", category: "activity", compact: true, widthClass: "min-w-24 w-24", sortable: true, format: (row) => formatHours(row.executed.hours), sortValue: (row) => row.executed.hours },
  { key: "flights", label: "Voos", category: "activity", compact: true, sortable: true, format: (row) => String(row.executed.count), sortValue: (row) => row.executed.count },
  { key: "landings", label: "Pousos", category: "activity", compact: true, sortable: true, format: (row) => String(row.executed.landings), sortValue: (row) => row.executed.landings },
  { key: "daysSinceLastFlight", label: "Dias sem voar", category: "activity", widthClass: "min-w-32 w-32", sortable: true, format: lastFlightLabel, sortValue: (row) => row.daysSinceLastFlight ?? 99999 },
  { key: "lastFlight", label: "Ultimo voo", category: "activity", compact: true, widthClass: "min-w-28 w-28", sortable: true, format: (row) => formatDate(row.executed.lastFlightAt), sortValue: (row) => row.executed.lastFlightAt || "" },
  { key: "nextFlight", label: "Proximo voo", category: "agenda", compact: true, widthClass: "min-w-28 w-28", sortable: true, format: (row) => formatDate(row.planned.nextFlightAt), sortValue: (row) => row.planned.nextFlightAt || "" },
  { key: "alertRisk", label: "Alertas risco", category: "alerts", compact: true, widthClass: "min-w-28 w-28", sortable: true, format: (row) => String(row.alertCounts?.risco ?? 0), sortValue: (row) => row.alertCounts?.risco ?? 0 },
  { key: "alertAttention", label: "Alertas atencao", category: "alerts", compact: true, widthClass: "min-w-32 w-32", sortable: true, format: (row) => String(row.alertCounts?.atencao ?? 0), sortValue: (row) => row.alertCounts?.atencao ?? 0 },
  { key: "alertLight", label: "Alertas leves", category: "alerts", compact: true, widthClass: "min-w-28 w-28", sortable: true, format: (row) => String(row.alertCounts?.leve ?? 0), sortValue: (row) => row.alertCounts?.leve ?? 0 },
  { key: "navigationHours", label: "Horas naveg.", category: "hours", compact: true, widthClass: "min-w-28 w-28", sortable: true, format: (row) => formatHours(row.executed.navigationHours), sortValue: (row) => row.executed.navigationHours ?? 0 },
  { key: "ifrHours", label: "Horas IFR", category: "hours", compact: true, widthClass: "min-w-24 w-24", sortable: true, format: (row) => formatHours(row.executed.ifrHours), sortValue: (row) => row.executed.ifrHours ?? 0 },
  { key: "nightHours", label: "Horas noturno", category: "hours", compact: true, widthClass: "min-w-32 w-32", sortable: true, format: (row) => formatHours(row.executed.nightHours), sortValue: (row) => row.executed.nightHours ?? 0 },
  { key: "navigationDistanceNm", label: "Dist. naveg.", category: "hours", compact: true, widthClass: "min-w-28 w-28", sortable: true, format: (row) => `${formatNumber(row.executed.navigationDistanceNm)} NM`, sortValue: (row) => row.executed.navigationDistanceNm ?? 0 },
  { key: "today", label: "Hoje", category: "agenda", compact: true, sortable: true, format: (row) => String(row.agenda.today.flights), sortValue: (row) => row.agenda.today.flights },
  { key: "tomorrow", label: "Amanha", category: "agenda", compact: true, sortable: true, format: (row) => String(row.agenda.tomorrow.flights), sortValue: (row) => row.agenda.tomorrow.flights },
  { key: "week", label: "Semana", category: "agenda", compact: true, sortable: true, format: (row) => String(row.agenda.week.flights), sortValue: (row) => row.agenda.week.flights },
];

function SummaryCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function RangeInput({ label, value, onChange }: { label: string; value: NumericRange; onChange: (range: NumericRange) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })} placeholder="Min" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500" />
        <input type="number" value={value.max} onChange={(e) => onChange({ ...value, max: e.target.value })} placeholder="Max" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500" />
      </div>
    </div>
  );
}

function TrackFilter({ options, value, onChange }: { options: string[]; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Trilha</p>
      <div className="max-h-24 overflow-y-auto rounded border border-slate-800 bg-slate-950/60 p-2">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 py-1 text-xs text-slate-300">
            <input type="checkbox" checked={value.includes(option)} onChange={() => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])} className="h-4 w-4 accent-emerald-500" />
            <span className="truncate">{option}</span>
          </label>
        ))}
        {!options.length ? <p className="py-2 text-xs text-slate-600">Nenhuma trilha encontrada.</p> : null}
      </div>
    </div>
  );
}

function StudentMiniList({ title, students, empty, onOpen }: { title: string; students: AdminStudentProgressRow[]; empty: string; onOpen: (student: AdminStudentProgressRow) => void }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{students.length}</span>
      </div>
      {students.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-2">
          {students.slice(0, 6).map((student) => (
            <button key={student.userId} type="button" onClick={() => onOpen(student)} className="w-full rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2 text-left transition hover:border-emerald-500/40 hover:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-slate-100">{displayName(student)}</p>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[student.status]}`}>{STATUS_LABEL[student.status]}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatHours(student.executed.hours)} | {student.trainingProgress?.trackName || "Sem trilha"} | {student.trainingProgress?.percentComplete ?? 0}%</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function FlightCard({ flight, onOpen }: { flight: AdminUserFlight; onOpen: (flightId: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(flight.id)} className="w-full rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2 text-left transition hover:border-cyan-500/40 hover:bg-slate-900">
      <p className="text-xs text-slate-500">{formatDateTime(flight)} | {flight.aircraftIdent || "Aeronave nao informada"}</p>
      <div className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
        <span>Duracao: {formatDuration(flight.durationSec)}</span>
        <span>Pousos: {flight.landings || 0}</span>
        <span>Rota: {flight.route || "-"}</span>
        <span>Instrutor: {flight.instructorName || "-"}</span>
      </div>
    </button>
  );
}

function IntentionCard({ plan }: { plan: AdminUserPlannedFlight }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-200">Semana {formatDate(plan.weekStart)}</p>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-[10px] uppercase text-slate-400">{plan.status}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{plan.requestedFlightsCount} voos | {formatHours(plan.totalHours)} | atualizado {formatDate(plan.updatedAt)}</p>
    </div>
  );
}

function StudentDetailModal({ student, detail, loading, onClose, onOpenFlight }: { student: AdminStudentProgressRow; detail: AdminUserDetail | null; loading: boolean; onClose: () => void; onOpenFlight: (flightId: string) => void }) {
  const source = detail ?? student;
  const executedFlights = detail?.executedFlights ?? student.recentExecutedFlights;
  const plannedFlights = detail?.plannedFlights ?? student.upcomingFlights;
  const intentions = detail?.futureIntentions ?? student.futureIntentions;
  const profile = detail?.profile;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="mx-auto max-w-7xl space-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Aluno</p>
            <h2 className="mt-1 break-words text-xl font-semibold text-slate-100">{displayName(student)}</h2>
            <p className="break-words text-sm text-slate-500">{student.email} | ANAC {student.profile.anacCode || "-"}</p>
            <p className="mt-1 break-words text-xs text-slate-600">ID: {student.userId}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Fechar</button>
        </div>

        {loading ? <div className="grid gap-3 md:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</div> : null}

        <div className="grid gap-3 md:grid-cols-5">
          <SummaryCard label="Horas executadas" value={formatHours(source.executed.hours)} hint={`${source.executed.count} voos`} />
          <SummaryCard label="Pousos" value={source.executed.landings} hint={`Ultimo ${formatDate(source.executed.lastFlightAt)}`} />
          <SummaryCard label="Navegacao" value={formatHours(source.executed.navigationHours)} hint={`${formatNumber(source.executed.navigationDistanceNm)} NM`} />
          <SummaryCard label="IFR / noturno" value={`${formatHours(source.executed.ifrHours)} / ${formatHours(source.executed.nightHours)}`} />
          <SummaryCard label="Ritmo" value={STATUS_LABEL[student.status]} hint={lastFlightLabel(student)} />
        </div>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-200">Dados cadastrais</h3>
            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <div><dt className="text-xs text-slate-500">Nome</dt><dd className="text-slate-200">{profile?.fullName || displayName(student)}</dd></div>
              <div><dt className="text-xs text-slate-500">Email</dt><dd className="break-words text-slate-200">{detail?.email || student.email || "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">Perfil</dt><dd className="text-slate-200">{detail?.role || "aluno"}</dd></div>
              <div><dt className="text-xs text-slate-500">CPF</dt><dd className="text-slate-200">{profile?.cpf || "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">Telefone</dt><dd className="text-slate-200">{profile?.phone || "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">Nascimento</dt><dd className="text-slate-200">{profile?.birthDate || "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">Peso / altura</dt><dd className="text-slate-200">{profile?.weightKg ?? "-"}kg / {profile?.heightCm ?? "-"}cm</dd></div>
              <div><dt className="text-xs text-slate-500">Email verificado</dt><dd className="text-slate-200">{detail?.emailVerification ? "Sim" : "Nao"}</dd></div>
              <div><dt className="text-xs text-slate-500">Criado em</dt><dd className="text-slate-200">{formatDate(detail?.createdAt)}</dd></div>
            </dl>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <h3 className="text-sm font-semibold text-slate-200">Trilha atual</h3>
            <div className="mt-4">
              <TrackProgress student={student} />
              <p className="mt-2 text-xs text-slate-500">{student.trainingProgress.completedMissions}/{student.trainingProgress.totalMissions} missoes concluidas</p>
            </div>
            <div className="mt-4 space-y-2">
              {(detail?.trainingTracks ?? student.trainingTracks ?? []).map((row) => (
                <div key={row.id} className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
                  <p className="font-medium text-slate-200">{row.track?.name || row.trackId}</p>
                  <p>{row.status}{row.isPrimary ? " | principal" : ""}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {profile ? (
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
              <h3 className="text-sm font-semibold text-slate-200">Habilitacoes</h3>
              {profile.anacRatings.length === 0 ? <p className="mt-2 text-xs text-slate-500">Nenhuma habilitacao importada.</p> : (
                <ul className="mt-2 space-y-2 text-sm text-slate-300">{profile.anacRatings.map((item, idx) => {
                  const expired = isExpiredDate(item.validade);
                  return <li key={`${item.habilitacao}-${idx}`} className="flex items-center justify-between gap-2"><span>{item.habilitacao}</span><span className={`text-xs ${expired ? "text-red-400" : "text-slate-400"}`}>{item.validade || "-"}{expired ? " | vencida" : ""}</span></li>;
                })}</ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
              <h3 className="text-sm font-semibold text-slate-200">Licencas</h3>
              {profile.anacLicenses.length === 0 ? <p className="mt-2 text-xs text-slate-500">Nenhuma licenca importada.</p> : (
                <ul className="mt-2 space-y-2 text-sm text-slate-300">{profile.anacLicenses.map((item, idx) => <li key={`${item.licenca}-${idx}`} className="flex items-center justify-between gap-2"><span>{item.licenca}</span><span className="text-xs text-slate-400">{item.expedicao || "-"}</span></li>)}</ul>
              )}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
              <h3 className="text-sm font-semibold text-slate-200">Certificado medico</h3>
              <div className="mt-3 grid gap-2 text-sm text-slate-300">
                <p><span className="text-slate-400">Classe:</span> {profile.anacMedical.classe || "-"}</p>
                <p><span className="text-slate-400">Validade:</span> <span className={isExpiredDate(profile.anacMedical.validade) ? "text-red-400" : ""}>{profile.anacMedical.validade || "-"}{isExpiredDate(profile.anacMedical.validade) ? " | vencida" : ""}</span></p>
                <p><span className="text-slate-400">Orgao:</span> {profile.anacMedical.orgao_expedidor || "-"}</p>
                <p><span className="text-slate-400">Obs:</span> {profile.anacMedical.observacoes || "-"}</p>
              </div>
            </div>
          </section>
        ) : null}

        {detail?.role === "aluno" ? <AdminUserCreditsSection studentUserId={detail.userId} studentName={displayName(student)} /> : null}

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Historico executado</p>
            <div className="space-y-2">{executedFlights.slice(0, 30).map((flight) => <FlightCard key={flight.id} flight={flight} onOpen={onOpenFlight} />)}{executedFlights.length === 0 ? <p className="text-sm text-slate-500">Nenhum voo executado encontrado.</p> : null}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Proximos voos</p>
            <div className="space-y-2">{plannedFlights.slice(0, 30).map((flight) => <FlightCard key={flight.id} flight={flight} onOpen={onOpenFlight} />)}{plannedFlights.length === 0 ? <p className="text-sm text-slate-500">Nenhum voo planejado encontrado.</p> : null}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Intencoes futuras</p>
            <div className="space-y-2">{intentions.slice(0, 30).map((plan) => <IntentionCard key={plan.id} plan={plan} />)}{intentions.length === 0 ? <p className="text-sm text-slate-500">Nenhuma intencao futura encontrada.</p> : null}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

function FlightModal({ flightId, onClose }: { flightId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
        <div className="mb-3 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Fechar ficha</button></div>
        <FlightDetailView flightId={flightId} onBack={onClose} backLabel="Voltar ao aluno" />
      </div>
    </div>
  );
}

export function AdminStudentsTab() {
  const { showToast } = useToast();
  const [inactiveDays, setInactiveDays] = useState(DEFAULT_INACTIVE_DAYS);
  const [customInactiveDays, setCustomInactiveDays] = useState(String(DEFAULT_INACTIVE_DAYS));
  const [data, setData] = useState<AdminStudentsProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<StudentFilters>(DEFAULT_FILTERS);
  const [savedPresets, setSavedPresets] = useState<SavedStudentPreset[]>(() => readPresets());
  const [presetName, setPresetName] = useState("");
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<StudentColumnKey[]>(() => readColumns());
  const [showColumns, setShowColumns] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [sortKey, setSortKey] = useState<StudentColumnKey>("daysSinceLastFlight");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedStudent, setSelectedStudent] = useState<AdminStudentProgressRow | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminUserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null);

  async function load(nextInactiveDays = inactiveDays) {
    setLoading(true);
    try {
      const next = await getAdminStudentsProgress({ today: isoDate(new Date()), inactiveDays: nextInactiveDays });
      setData(next);
    } catch (e) {
      showToast({ variant: "error", message: e instanceof Error ? e.message : "Falha ao carregar alunos." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(DEFAULT_INACTIVE_DAYS); }, []);
  useEffect(() => { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(selectedColumns)); }, [selectedColumns]);
  useEffect(() => { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(savedPresets)); }, [savedPresets]);

  useEffect(() => {
    if (!selectedStudent) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setSelectedDetail(null);
    void getAdminUserDetail(selectedStudent.userId)
      .then((detail) => { if (!cancelled) setSelectedDetail(detail); })
      .catch((e) => { if (!cancelled) showToast({ variant: "error", message: e instanceof Error ? e.message : "Falha ao carregar detalhe do aluno." }); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [selectedStudent, showToast]);

  const trackOptions = useMemo(() => Array.from(new Set((data?.students ?? []).map((student) => student.trainingProgress?.trackName || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [data?.students]);
  const visibleColumns = useMemo(() => COLUMNS.filter((column) => selectedColumns.includes(column.key)), [selectedColumns]);
  const sortColumn = useMemo(() => COLUMNS.find((column) => column.key === sortKey) ?? COLUMNS[0], [sortKey]);

  const tableStudents = useMemo(() => {
    const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return (data?.students ?? []).filter((student) => {
      if (normalized && !searchText(student).includes(normalized)) return false;
      if (filters.tracks.length && !filters.tracks.includes(student.trainingProgress?.trackName || "")) return false;
      if (!rangeMatches(student.daysSinceLastFlight, filters.daysWithoutFlying)) return false;
      if (!rangeMatches(student.executed.hours, filters.hours)) return false;
      if (!rangeMatches(student.trainingProgress?.percentComplete ?? 0, filters.progress)) return false;
      if (!rangeMatches(student.executed.count, filters.flights)) return false;
      if (!rangeMatches(student.executed.landings, filters.landings)) return false;
      return true;
    });
  }, [data?.students, filters, query]);

  const sortedStudents = useMemo(() => sortRows(tableStudents, sortColumn, sortDirection), [tableStudents, sortColumn, sortDirection]);
  const allStudents = data?.students ?? [];
  const inactiveStudents = useMemo(() => allStudents.filter((student) => student.status === "inactive" || student.status === "noFlights"), [allStudents]);
  const bucketStudents = useMemo(() => {
    const map = {} as Record<AdminStudentAgendaBucketKey, AdminStudentProgressRow[]>;
    (["yesterday", "today", "tomorrow", "week"] as AdminStudentAgendaBucketKey[]).forEach((key) => { map[key] = allStudents.filter((student) => student.agenda[key].flights > 0); });
    return map;
  }, [allStudents]);

  function changeInactiveDays(next: number) {
    setInactiveDays(next);
    setCustomInactiveDays(String(next));
    void load(next);
  }

  function applyCustomDays() {
    const parsed = Number(customInactiveDays);
    changeInactiveDays(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : DEFAULT_INACTIVE_DAYS);
  }

  function updateFilter<K extends keyof StudentFilters>(key: K, value: StudentFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
  }

  function handleSort(column: ColumnDef) {
    if (!column.sortable) return;
    if (sortKey === column.key) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(column.key);
      setSortDirection("asc");
    }
  }

  function toggleColumn(column: StudentColumnKey) {
    setSelectedColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column]);
  }

  function saveCurrentPreset() {
    const name = presetName.trim();
    if (!name) return;
    const preset: SavedStudentPreset = { name, filters, selectedColumns };
    setSavedPresets((current) => [...current.filter((item) => item.name !== name), preset].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    setPresetName("");
  }

  function loadPreset(name: string) {
    const preset = savedPresets.find((item) => item.name === name);
    if (!preset) return;
    setFilters(preset.filters);
    setSelectedColumns(sanitizeColumns(preset.selectedColumns));
  }

  function deletePreset(name: string) {
    setSavedPresets((current) => current.filter((item) => item.name !== name));
    setPresetToDelete(null);
  }

  const searchableColumns = useMemo(() => {
    const needle = columnSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return needle ? COLUMNS.filter((column) => `${column.label} ${CATEGORY_LABELS[column.category]}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(needle)) : COLUMNS;
  }, [columnSearch]);

  return (
    <div className="w-full space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Acompanhamento pedagogico</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">Alunos</h2>
            <p className="mt-1 text-sm text-slate-400">Ritmo de voo, trilhas, alertas e progresso operacional.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-56 text-xs font-medium text-slate-400">Buscar aluno<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, email, ANAC ou trilha" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" /></label>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Sem voar ha</p>
              <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-1">{INACTIVE_OPTIONS.map((days) => <button key={days} type="button" onClick={() => changeInactiveDays(days)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${inactiveDays === days ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-slate-200"}`}>{days}d</button>)}</div>
            </div>
            <label className="w-28 text-xs font-medium text-slate-400">Custom<input type="number" min={1} max={180} value={customInactiveDays} onChange={(event) => setCustomInactiveDays(event.target.value)} onBlur={applyCustomDays} onKeyDown={(event) => { if (event.key === "Enter") applyCustomDays(); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" /></label>
            <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50">{loading ? "Atualizando..." : "Atualizar"}</button>
          </div>
        </div>
      </section>

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <SummaryCard label="Alunos" value={data.summary.totalStudents} hint={`${data.summary.activeStudents} em ritmo`} />
            <SummaryCard label="Sem voar" value={data.summary.inactiveStudents + data.summary.studentsWithoutFlights} hint={`corte ${data.inactiveDays} dias`} />
            <SummaryCard label="Horas totais" value={formatHours(data.summary.totalHours)} hint={`${data.summary.totalExecutedFlights} voos`} />
            <SummaryCard label="Ontem" value={data.buckets.yesterday.flights} hint={`${data.buckets.yesterday.students} alunos`} />
            <SummaryCard label="Hoje" value={data.buckets.today.flights} hint={`${data.buckets.today.students} alunos`} />
            <SummaryCard label="Amanha" value={data.buckets.tomorrow.flights} hint={`${data.buckets.tomorrow.students} alunos`} />
            <SummaryCard label="Semana" value={data.buckets.week.flights} hint={`${data.buckets.week.students} alunos`} />
          </section>

          <section className="grid gap-4 xl:grid-cols-5">
            <StudentMiniList title="Sem voar ha muito tempo" students={inactiveStudents} empty="Nenhum aluno parado nesse corte." onOpen={setSelectedStudent} />
            {(["yesterday", "today", "tomorrow", "week"] as AdminStudentAgendaBucketKey[]).map((key) => <StudentMiniList key={key} title={BUCKET_LABEL[key]} students={bucketStudents[key]} empty="Nenhum aluno nesse grupo." onOpen={setSelectedStudent} />)}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-sm font-semibold text-slate-100">Filtros da tabela</h3><p className="text-xs text-slate-500">{sortedStudents.length} alunos filtrados</p></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <RangeInput label="Dias sem voar" value={filters.daysWithoutFlying} onChange={(value) => updateFilter("daysWithoutFlying", value)} />
              <TrackFilter options={trackOptions} value={filters.tracks} onChange={(value) => updateFilter("tracks", value)} />
              <RangeInput label="Qtd. horas" value={filters.hours} onChange={(value) => updateFilter("hours", value)} />
              <RangeInput label="% concluido" value={filters.progress} onChange={(value) => updateFilter("progress", value)} />
              <RangeInput label="Qtd. voos" value={filters.flights} onChange={(value) => updateFilter("flights", value)} />
              <RangeInput label="Qtd. pousos" value={filters.landings} onChange={(value) => updateFilter("landings", value)} />
            </div>
            <div className="mt-4 border-t border-slate-800 pt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Presets</p>
              <div className="flex flex-wrap gap-2">
                <select value="" onChange={(e) => loadPreset(e.target.value)} className="min-w-48 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500">
                  <option value="">Carregar preset</option>
                  {savedPresets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
                </select>
                <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Nome do preset" className="w-44 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500" />
                <button type="button" onClick={saveCurrentPreset} className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20">Salvar</button>
              </div>
              {savedPresets.length ? <div className="mt-2 flex flex-wrap gap-1">{savedPresets.map((preset) => <span key={preset.name} className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-300"><button type="button" onClick={() => loadPreset(preset.name)}>{preset.name}</button><button type="button" onClick={() => setPresetToDelete(preset.name)} className="text-slate-500 hover:text-rose-300">x</button></span>)}</div> : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => exportCsv(sortedStudents, visibleColumns)} className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Exportar CSV</button>
              <button type="button" onClick={clearFilters} className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Limpar filtros</button>
              <button type="button" onClick={() => setShowColumns(true)} className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Colunas</button>
            </div>
          </section>

          {/* Mobile cards */}
          <section className="space-y-2 md:hidden">
            {sortedStudents.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-950/30 p-6 text-center text-sm text-slate-500">Nenhum aluno encontrado.</p>
            ) : sortedStudents.map((student) => (
              <div key={student.userId} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-slate-100">{displayName(student)}</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[student.status]}`}>{STATUS_LABEL[student.status]}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">{student.email || "—"}</p>
                <div className="mt-2">
                  <TrackProgress student={student} />
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  <p>Horas: <span className="text-slate-300">{formatHours(student.executed.hours)}</span></p>
                  <p>Voos: <span className="text-slate-300">{student.executed.count}</span></p>
                  {(student.alertCounts?.risco ?? 0) > 0
                    ? <p>Risco: <span className="font-semibold text-rose-300">{student.alertCounts?.risco}</span></p>
                    : (student.alertCounts?.atencao ?? 0) > 0
                      ? <p>Atenção: <span className="font-semibold text-amber-300">{student.alertCounts?.atencao}</span></p>
                      : null}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-800/50 pt-2.5">
                  <p className="text-xs text-slate-500">{lastFlightLabel(student)}</p>
                  <button type="button" onClick={() => setSelectedStudent(student)} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20">Detalhes</button>
                </div>
              </div>
            ))}
          </section>

          {/* Desktop table */}
          <section className="hidden overflow-hidden rounded-xl border border-slate-800 bg-slate-900/45 md:block">
            <div className="overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
                <thead className="sticky top-0 z-20 bg-slate-900 text-slate-500">
                  <tr>
                    {visibleColumns.map((column, index) => (
                      <th key={column.key} className={`border-b border-slate-800 bg-slate-900 px-2 py-2 font-semibold uppercase tracking-wider ${column.widthClass ?? (column.compact ? "w-px whitespace-nowrap" : "min-w-36")} ${index === 0 ? "sticky left-0 z-30 shadow-[8px_0_12px_-12px_rgba(0,0,0,0.9)]" : ""}`}>
                        <button type="button" disabled={!column.sortable} onClick={() => handleSort(column)} className={`flex w-full items-center gap-1 text-left ${column.sortable ? "hover:text-slate-200" : ""}`}>
                          <span>{column.label}</span>
                          {sortKey === column.key ? <span className="text-emerald-300">{sortDirection === "asc" ? "↑" : "↓"}</span> : column.sortable ? <span className="text-slate-700">↕</span> : null}
                        </button>
                      </th>
                    ))}
                    <th className="border-b border-slate-800 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.length === 0 ? (
                    <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-10 text-center text-sm text-slate-500">Nenhum aluno encontrado.</td></tr>
                  ) : sortedStudents.map((student) => (
                    <tr key={student.userId} className="group odd:bg-slate-950/20 hover:bg-slate-800/35">
                      {visibleColumns.map((column, index) => (
                        <td key={column.key} className={`border-b border-slate-800/70 px-2 py-2 text-slate-300 ${column.widthClass ?? (column.compact ? "whitespace-nowrap tabular-nums" : "max-w-72 truncate")} ${index === 0 ? "sticky left-0 z-10 bg-slate-950 shadow-[8px_0_12px_-12px_rgba(0,0,0,0.9)] group-hover:bg-slate-800" : ""}`}>
                          {column.key === "student" ? <div><p className="truncate font-semibold text-slate-100">{displayName(student)}</p><p className="truncate text-slate-500">ANAC {student.profile.anacCode || "-"}</p></div> : column.key === "status" ? <div><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[student.status]}`}>{STATUS_LABEL[student.status]}</span><p className="mt-1 text-slate-500">{lastFlightLabel(student)}</p></div> : column.key === "alertRisk" ? <span className="font-semibold text-rose-300">{column.format(student)}</span> : column.key === "alertAttention" ? <span className="font-semibold text-amber-300">{column.format(student)}</span> : column.render ? column.render(student) : column.format(student)}
                        </td>
                      ))}
                      <td className="border-b border-slate-800/70 px-2 py-2 text-right">
                        <button type="button" onClick={() => setSelectedStudent(student)} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20">Detalhes</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {showColumns ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div><h3 className="text-sm font-semibold text-slate-100">Colunas de alunos</h3><p className="text-xs text-slate-500">{selectedColumns.length} selecionadas</p></div>
              <button type="button" onClick={() => setShowColumns(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Fechar</button>
            </div>
            <div className="border-b border-slate-800 px-5 py-3"><input value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} placeholder="Pesquisar coluna" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500" /></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {(["identity", "training", "activity", "alerts", "hours", "agenda"] as StudentColumnCategory[]).map((category) => {
                const categoryColumns = searchableColumns.filter((column) => column.category === category);
                if (!categoryColumns.length) return null;
                return (
                  <section key={category} className="mb-5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{CATEGORY_LABELS[category]}</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {categoryColumns.map((column) => <label key={column.key} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={selectedColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} className="h-4 w-4 accent-emerald-500" /><span>{column.label}</span></label>)}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {presetToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-slate-950">
            <h3 className="text-sm font-semibold text-slate-100">Excluir preset</h3>
            <p className="mt-2 text-sm text-slate-400">Deseja excluir o preset <span className="font-semibold text-slate-200">{presetToDelete}</span>?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPresetToDelete(null)} className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Cancelar</button>
              <button type="button" onClick={() => deletePreset(presetToDelete)} className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20">Excluir</button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedStudent ? <StudentDetailModal student={selectedStudent} detail={selectedDetail} loading={loadingDetail} onClose={() => setSelectedStudent(null)} onOpenFlight={setActiveFlightId} /> : null}
      {activeFlightId ? <FlightModal flightId={activeFlightId} onClose={() => setActiveFlightId(null)} /> : null}
    </div>
  );
}
