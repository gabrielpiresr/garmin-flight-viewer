import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  isGhostFlightListItem,
  listScheduledFlightsForWeek,
  normalizeScheduleFlightStatus,
  type SavedFlightListItem,
} from "../../lib/flightsDb";
import { listSagaSchedulesDirect, type SagaDirectScheduleItem } from "../../lib/sagaImportDb";
import { getCachedSchoolRules, getSchoolRules } from "../../lib/schoolRulesDb";
import {
  createSoloFlightRequest,
  evaluateSoloFlight,
  listSoloFlightEndorsements,
  listSoloFlightRequests,
  uploadSoloFlightEndorsement,
} from "../../lib/soloFlightDb";
import {
  SOLO_FLIGHT_DEFAULT_MANUAL_CHECKS,
  type SoloFlightCheckResult,
  type SoloFlightEndorsement,
  type SoloFlightEvaluation,
  type SoloFlightManualCheck,
  type SoloFlightRequest,
  type SoloFlightRequestType,
} from "../../types/soloFlight";
import { DEFAULT_FLIGHT_SCHEDULE_RULES } from "../../types/schoolRules";
import { AiswebAerodromePicker } from "../AiswebAerodromePicker";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const STEPS = ["Voo da escala", "Aeródromos", "Critérios manuais", "Resumo"] as const;
const DEFAULT_SCHOOL_ORIGIN_ICAO = "SBJD";
const DEFAULT_DESTINATION_ICAO = "SDCO";
const DEFAULT_ALTERNATE_ICAO = "SDPW";
const SOLO_CUTOFF_LIMIT_ZULU = "19:00";
type Mode = "history" | "flow";
type SoloAgendaFlight = SavedFlightListItem & {
  soloStudentName?: string;
  soloInstructorName?: string;
  soloNotes?: string;
};

function isoToday(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function addDaysIso(baseIso: string, days: number): string {
  const date = new Date(`${baseIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStartIso(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function minutesFromTime(value: string | null | undefined): number | null {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function isFutureAgendaFlight(flight: SavedFlightListItem, days: string[]): boolean {
  const date = flight.flight_date || "";
  if (!days.includes(date)) return false;
  if (["Cancelado", "Realizado"].includes(flight.flight_status)) return false;
  return true;
}

function addMinutesToTime(time: string | null | undefined, minutes: number | null | undefined): string {
  const start = minutesFromTime(time);
  if (start === null || !minutes || !Number.isFinite(minutes)) return "";
  const total = start + Math.round(minutes);
  const hours = Math.floor((total % (24 * 60)) / 60);
  const mins = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function minutesBetween(startAt: string | null | undefined, endAt: string | null | undefined): number | null {
  const start = new Date(String(startAt || ""));
  const end = new Date(String(endAt || ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diff = Math.round((end.getTime() - start.getTime()) / 60000);
  return diff > 0 ? diff : null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "sem data";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function requestTypeLabel(type: SoloFlightRequestType): string {
  return type === "primeiro_circuito_solo" ? "Primeiro circuito solo" : "Voo solo";
}

function statusLabel(status: SoloFlightRequest["status"] | SoloFlightEvaluation["status"]): string {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    pending_approval: "Pendente de aprovação",
    approved: "Aprovado",
    auto_approved: "Aprovado automaticamente",
    rejected: "Rejeitado",
  };
  return labels[status] || status;
}

function statusBadgeClass(status: SoloFlightRequest["status"] | SoloFlightEvaluation["status"]): string {
  if (status === "pending_approval" || status === "draft") return "border-amber-700 bg-amber-500/15 text-amber-200";
  if (status === "rejected") return "border-red-800 bg-red-500/15 text-red-300";
  if (status === "approved" || status === "auto_approved") return "border-emerald-700 bg-emerald-500/15 text-emerald-300";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function sortRequestsNewestFirst(items: SoloFlightRequest[]): SoloFlightRequest[] {
  return [...items].sort((a, b) => {
    const left = new Date(b.createdAt || b.updatedAt || 0).getTime();
    const right = new Date(a.createdAt || a.updatedAt || 0).getTime();
    return left - right;
  });
}

function flightTitle(flight: SoloAgendaFlight): string {
  return [flight.start_time ? `${flight.start_time}Z` : "sem horário", flight.aircraft_ident || "", flight.from_to || ""].filter(Boolean).join(" · ");
}

function sagaScheduleToFlight(item: SagaDirectScheduleItem): SoloAgendaFlight {
  const flightDate = String(item.startAt || "").slice(0, 10) || null;
  const startTime = String(item.startAt || "").slice(11, 16) || null;
  const durationMinutes = minutesBetween(item.startAt, item.endAt);
  return {
    id: `saga_schedule_${item.id}`,
    source_filename: `saga-schedule-${item.id}`,
    created_at: item.createdAt || item.startAt || "",
    aircraft_ident: item.aircraft || null,
    duration_sec: durationMinutes ? durationMinutes * 60 : null,
    flight_date: flightDate,
    start_time: startTime,
    student_user_id: item.studentUserId || (item.studentSagaId ? `saga_${item.studentSagaId}` : null),
    instructor_user_id: item.instructorUserId || (item.instructorSagaId ? `saga_${item.instructorSagaId}` : null),
    training_track_id: null,
    training_stage_id: null,
    training_mission_id: null,
    training_snapshot_json: null,
    from_to: item.notes || "",
    landings: null,
    block_time_minutes: durationMinutes,
    total_flight_minutes: durationMinutes,
    total_miles: null,
    telemetry_present: false,
    instructor_suggestion_md: null,
    student_suggestion_md: null,
    instructor_suggestion_present: null,
    student_suggestion_present: null,
    weight_balance_complete: null,
    is_night: null,
    training_mission_ids_json: null,
    schedule_week_start: flightDate ? weekStartIso(flightDate) : null,
    schedule_demand_id: null,
    flight_seq_number: null,
    instructor_signed: null,
    student_signed: null,
    admin_operator_signed: null,
    instructor_signed_at: null,
    flight_status: normalizeScheduleFlightStatus(item.status),
    saga_flight_id: null,
    saga_schedule_id: item.id,
    saga_schedule_synced_at: null,
    saga_schedule_sync_status: "saga_direct",
    soloStudentName: item.studentName || "",
    soloInstructorName: item.instructorName || "",
    soloNotes: item.notes || "",
  };
}

function sourceFlightIdForRequest(flight: SoloAgendaFlight | null): string | null {
  if (!flight?.id) return null;
  return flight.id.startsWith("saga_schedule_") ? null : flight.id;
}

function shortName(value: string | null | undefined, fallback = ""): string {
  const clean = String(value || "").trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return clean;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function studentLabel(flight: SoloAgendaFlight): string {
  return flight.soloStudentName || flight.student_user_id || "Aluno não vinculado";
}

function instructorLabel(flight: SoloAgendaFlight): string {
  return flight.soloInstructorName || flight.instructor_user_id || "Sem instrutor";
}

function endTimeLabel(flight: SoloAgendaFlight): string {
  return addMinutesToTime(flight.start_time, flight.block_time_minutes || flight.total_flight_minutes) || "--:--";
}

function cutoffTimeForFlight(flight: SoloAgendaFlight, debriefingMinutes: number): string {
  const blockMinutes = flight.block_time_minutes || flight.total_flight_minutes;
  if (!blockMinutes || !Number.isFinite(blockMinutes)) return "";
  return addMinutesToTime(flight.start_time, Math.max(0, blockMinutes - debriefingMinutes));
}

function activeEndorsement(items: SoloFlightEndorsement[]): SoloFlightEndorsement | null {
  return items.find((item) => item.active) || items[0] || null;
}

function metarIcao(check: SoloFlightCheckResult): string {
  const value = check.value && typeof check.value === "object" ? check.value as { icao?: unknown } : null;
  return String(value?.icao || check.id.replace(/^metar_/, "")).toUpperCase();
}

function metarRaw(check: SoloFlightCheckResult): string {
  const value = check.value && typeof check.value === "object" ? check.value as { metar?: unknown } : null;
  return String(value?.metar || "").trim();
}

function metarHasNoData(check: SoloFlightCheckResult): boolean {
  const value = check.value && typeof check.value === "object" ? check.value as { noMetar?: unknown } : null;
  return value?.noMetar === true || check.details === "Sem metar" || (!metarRaw(check) && check.ok === true);
}

function CheckRow({ check, compact = false }: { check: SoloFlightCheckResult; compact?: boolean }) {
  const ok = check.applicable ? check.ok === true : true;
  return (
    <li className={`rounded-lg border px-3 py-2 ${ok ? "border-emerald-800/70 bg-emerald-950/15" : "border-amber-800 bg-amber-950/20"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-xs font-bold ${ok ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-amber-500 bg-amber-500/15 text-amber-200"}`}>
          {ok ? "✓" : "!"}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${ok ? "text-emerald-100" : "text-amber-100"}`}>{check.label}</p>
          {!compact && check.details ? <p className="mt-1 text-xs text-slate-400">{check.details}</p> : null}
        </div>
      </div>
    </li>
  );
}

function MetarChecklist({ checks }: { checks: SoloFlightCheckResult[] }) {
  if (!checks.length) return null;
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/35 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-100">METAR dos aeródromos</h3>
        <p className="text-xs text-slate-500">Mínimo aluno_solo; aeródromos sem METAR são aprovados automaticamente.</p>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {checks.map((check) => {
          const ok = check.ok === true;
          const noMetar = metarHasNoData(check);
          const raw = metarRaw(check);
          return (
            <div key={check.id} className={`rounded-lg border p-3 ${ok ? "border-emerald-800/70 bg-emerald-950/15" : "border-amber-800 bg-amber-950/20"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-sm font-semibold ${ok ? "text-emerald-100" : "text-amber-100"}`}>{metarIcao(check)}</p>
                  <p className="mt-1 text-xs text-slate-400">{check.details}</p>
                </div>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ok ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"}`}>
                  {noMetar ? "sem metar" : ok ? "ok" : "flag"}
                </span>
              </div>
              {raw ? <p className="mt-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1 font-mono text-[11px] leading-relaxed text-slate-300">{raw}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RequestChecklistDetails({ request }: { request: SoloFlightRequest }) {
  const checks = [...(request.automaticChecks || []), ...(request.manualChecks || []), ...(request.metarChecks || [])];
  return (
    <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
      <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
        <p><span className="font-semibold text-slate-500">Tipo:</span> {requestTypeLabel(request.requestType)}</p>
        <p><span className="font-semibold text-slate-500">Início:</span> {request.startTime || "--:--"}Z</p>
        <p><span className="font-semibold text-slate-500">Corte:</span> {request.cutoffTime || "--:--"}Z</p>
        <p><span className="font-semibold text-slate-500">Criado:</span> {request.createdAt ? new Date(request.createdAt).toLocaleString("pt-BR") : "-"}</p>
      </div>
      {request.flags.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Flags</p>
          {request.flags.map((flag) => (
            <div key={flag.id} className="rounded border border-amber-900/60 bg-amber-950/20 px-2.5 py-1.5 text-xs text-amber-100">
              <strong>{flag.label}</strong>
              {flag.details ? <p className="mt-0.5 opacity-80">{flag.details}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-emerald-300">Sem flags.</p>
      )}
      {checks.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Itens do checklist</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {checks.map((check) => <CheckRow key={check.id} check={check} />)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ExpandableRequestCard({ request }: { request: SoloFlightRequest }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{request.studentName || request.studentUserId}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {request.flightDate} · {request.route || "-"} · {requestTypeLabel(request.requestType)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(request.status)}`}>
            {statusLabel(request.status)}
          </span>
          <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open ? (
        <div className="px-3 pb-3">
          <RequestChecklistDetails request={request} />
        </div>
      ) : null}
    </div>
  );
}

function CheckList({ evaluation }: { evaluation: SoloFlightEvaluation | null }) {
  if (!evaluation) return null;
  const checks = [...evaluation.automaticChecks, ...evaluation.manualChecks];
  const flagged = checks.filter((check) => check.flag);
  const ok = checks.filter((check) => !check.flag);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section className="rounded-lg border border-amber-900/70 bg-slate-950/35 p-4">
        <h3 className="text-sm font-semibold text-amber-100">Pendências</h3>
        {flagged.length ? (
          <ul className="mt-3 space-y-2">{flagged.map((check) => <CheckRow key={check.id} check={check} />)}</ul>
        ) : (
          <p className="mt-3 rounded-lg border border-emerald-800/70 bg-emerald-950/15 px-3 py-2 text-sm text-emerald-200">Nenhuma pendência operacional.</p>
        )}
      </section>
      <section className="rounded-lg border border-emerald-900/60 bg-slate-950/35 p-4">
        <h3 className="text-sm font-semibold text-emerald-100">Atendidos</h3>
        {ok.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{ok.map((check) => <CheckRow key={check.id} check={check} compact />)}</ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Nenhum item atendido ainda.</p>
        )}
      </section>
    </div>
  );
}

export function InstructorSoloFlightTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>("history");
  const [step, setStep] = useState(0);
  const [flights, setFlights] = useState<SoloAgendaFlight[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(true);
  const [selectedFlight, setSelectedFlight] = useState<SoloAgendaFlight | null>(null);
  const [requestType, setRequestType] = useState<SoloFlightRequestType>("voo_solo");
  const [flightDate, setFlightDate] = useState(isoToday());
  const [startTime, setStartTime] = useState("");
  const [cutoffTime, setCutoffTime] = useState("");
  const [originIcaos, setOriginIcaos] = useState<string[]>([]);
  const [destinationIcaos, setDestinationIcaos] = useState<string[]>([DEFAULT_DESTINATION_ICAO]);
  const [alternateIcaos, setAlternateIcaos] = useState<string[]>([DEFAULT_ALTERNATE_ICAO]);
  const [manualChecks, setManualChecks] = useState<SoloFlightManualCheck[]>(() =>
    SOLO_FLIGHT_DEFAULT_MANUAL_CHECKS.map((item) => ({ ...item })),
  );
  const [endorsements, setEndorsements] = useState<SoloFlightEndorsement[]>([]);
  const [endorsementsLoading, setEndorsementsLoading] = useState(false);
  const [endorsementUploadNotes, setEndorsementUploadNotes] = useState("");
  const [endorsementUploading, setEndorsementUploading] = useState(false);
  const [evaluation, setEvaluation] = useState<SoloFlightEvaluation | null>(null);
  const [requests, setRequests] = useState<SoloFlightRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [debriefingMinutes, setDebriefingMinutes] = useState(() =>
    getCachedSchoolRules()?.schedule.bufferAfterMinutes ?? DEFAULT_FLIGHT_SCHEDULE_RULES.bufferAfterMinutes,
  );

  const agendaDays = useMemo(() => {
    const today = isoToday();
    return [today, addDaysIso(today, 1), addDaysIso(today, 2)];
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      setRequests(sortRequestsNewestFirst(await listSoloFlightRequests({ instructorUserId: user?.id, limit: 50 })));
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar checklists." });
    } finally {
      setRequestsLoading(false);
    }
  }, [showToast, user?.id]);

  const loadFlights = useCallback(async () => {
    if (!user?.id) return;
    setFlightsLoading(true);
    try {
      const weeks = Array.from(new Set(agendaDays.map(weekStartIso)));
      const [pages, sagaSchedules] = await Promise.all([
        Promise.all(weeks.map((week) => listScheduledFlightsForWeek(week))),
        listSagaSchedulesDirect(1).catch(() => [] as SagaDirectScheduleItem[]),
      ]);
      const firstError = pages.find((page) => page.error)?.error;
      if (firstError) throw firstError;
      const byId = new Map<string, SoloAgendaFlight>();
      for (const page of pages) {
        for (const flight of page.data || []) byId.set(flight.id, flight);
      }
      const savedSagaScheduleIds = new Set(
        [...byId.values()].map((flight) => flight.saga_schedule_id).filter((id): id is string => Boolean(id)),
      );
      for (const schedule of sagaSchedules) {
        if (savedSagaScheduleIds.has(schedule.id)) continue;
        const flight = sagaScheduleToFlight(schedule);
        byId.set(flight.id, flight);
      }
      setFlights(
        [...byId.values()].filter(
          (flight) =>
            flight.instructor_user_id === user.id &&
            !isGhostFlightListItem(flight) &&
            isFutureAgendaFlight(flight, agendaDays),
        ),
      );
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar os voos da agenda." });
    } finally {
      setFlightsLoading(false);
    }
  }, [agendaDays, showToast, user?.id]);

  useEffect(() => {
    void loadRequests();
    void loadFlights();
  }, [loadFlights, loadRequests]);

  useEffect(() => {
    void getSchoolRules()
      .then((rules) => setDebriefingMinutes(rules.schedule.bufferAfterMinutes))
      .catch(() => undefined);
  }, []);

  const loadEndorsements = useCallback(async (studentUserId: string) => {
    if (!studentUserId) return;
    setEndorsementsLoading(true);
    try {
      const items = await listSoloFlightEndorsements(studentUserId);
      setEndorsements(
        [...items].sort((a, b) => new Date(b.uploadedAt || b.createdAt || 0).getTime() - new Date(a.uploadedAt || a.createdAt || 0).getTime()),
      );
    } catch (error) {
      setEndorsements([]);
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar endossos." });
    } finally {
      setEndorsementsLoading(false);
    }
  }, [showToast]);

  function startNewFlow() {
    setMode("flow");
    setStep(0);
    setSelectedFlight(null);
    setEvaluation(null);
    setEndorsements([]);
    setEndorsementUploadNotes("");
    setOriginIcaos([]);
    setDestinationIcaos([DEFAULT_DESTINATION_ICAO]);
    setAlternateIcaos([DEFAULT_ALTERNATE_ICAO]);
  }

  function pickFlight(flight: SoloAgendaFlight) {
    setSelectedFlight(flight);
    setEvaluation(null);
    setFlightDate(flight.flight_date || isoToday());
    setStartTime((flight.start_time || "").slice(0, 5));
    setCutoffTime(cutoffTimeForFlight(flight, debriefingMinutes));
    setOriginIcaos([DEFAULT_SCHOOL_ORIGIN_ICAO]);
    setDestinationIcaos([DEFAULT_DESTINATION_ICAO]);
    setAlternateIcaos([DEFAULT_ALTERNATE_ICAO]);
    setEndorsements([]);
    setEndorsementUploadNotes("");
    void loadEndorsements(flight.student_user_id || "");
  }

  const flightsByDay = useMemo(() => {
    const map = new Map<string, SoloAgendaFlight[]>();
    for (const day of agendaDays) map.set(day, []);
    for (const flight of flights) {
      if (!flight.flight_date || !map.has(flight.flight_date)) continue;
      map.get(flight.flight_date)!.push(flight);
    }
    for (const day of agendaDays) {
      map.get(day)!.sort((a, b) => (minutesFromTime(a.start_time) ?? 9999) - (minutesFromTime(b.start_time) ?? 9999));
    }
    return map;
  }, [agendaDays, flights]);

  const endorsement = activeEndorsement(endorsements);

  const effectiveManualChecks = useMemo(
    () =>
      manualChecks.map((item) =>
        requestType === "primeiro_circuito_solo" && item.id === "endorsement_printed"
          ? { ...item, checked: false, notApplicable: true }
          : { ...item, notApplicable: false },
      ),
    [manualChecks, requestType],
  );

  const payload = useMemo(
    () => ({
      studentUserId: selectedFlight?.student_user_id || "",
      requestType,
      sourceFlightId: sourceFlightIdForRequest(selectedFlight),
      flightDate,
      startTime,
      cutoffTime,
      originIcao: originIcaos[0] || "",
      destinationIcaos,
      alternateIcaos,
      manualChecks: effectiveManualChecks,
    }),
    [
      alternateIcaos,
      cutoffTime,
      destinationIcaos,
      effectiveManualChecks,
      flightDate,
      originIcaos,
      requestType,
      selectedFlight?.id,
      selectedFlight?.student_user_id,
      startTime,
    ],
  );

  const canGoAerodromes = Boolean(selectedFlight?.student_user_id);
  const canGoManual = Boolean(originIcaos[0] && destinationIcaos.length > 0 && flightDate && cutoffTime);
  const canGoSummary = canGoManual;

  async function uploadEndorsement(file: File | null) {
    const studentUserId = selectedFlight?.student_user_id || "";
    if (!file || !studentUserId) return;
    setEndorsementUploading(true);
    try {
      const uploaded = await uploadSoloFlightEndorsement({
        studentUserId,
        uploaderUserId: user?.id,
        uploaderRole: user?.role,
        file,
        notes: endorsementUploadNotes,
      });
      setEndorsements((current) => [uploaded, ...current.map((item) => ({ ...item, active: false }))]);
      setEndorsementUploadNotes("");
      setEvaluation(null);
      showToast({ variant: "success", message: "Endosso anexado." });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao anexar endosso." });
    } finally {
      setEndorsementUploading(false);
    }
  }

  async function evaluate() {
    if (!payload.studentUserId) {
      showToast({ variant: "warning", message: "Escolha um voo da agenda com aluno vinculado." });
      return null;
    }
    if (!canGoManual) {
      showToast({ variant: "warning", message: "Preencha origem, destino, data e corte previsto antes do resumo." });
      return null;
    }
    setLoading(true);
    try {
      const result = await evaluateSoloFlight(payload);
      setEvaluation(result);
      return result;
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao avaliar o voo solo." });
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function goToSummary() {
    const result = await evaluate();
    if (result) setStep(3);
  }

  async function submit() {
    setLoading(true);
    try {
      const request = await createSoloFlightRequest(payload);
      showToast({
        variant: "success",
        message: request.status === "pending_approval" ? "Checklist enviado para aprovação." : "Checklist solo aprovado automaticamente.",
      });
      setRequests((current) => sortRequestsNewestFirst([request, ...current]));
      setMode("history");
      setStep(0);
      setEvaluation(null);
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao criar o checklist." });
    } finally {
      setLoading(false);
    }
  }

  if (mode === "history") {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Voo solo</h1>
              <p className="mt-1 text-sm text-slate-500">Últimos checklists e novo fluxo de aprovação.</p>
            </div>
            <button type="button" onClick={startNewFlow} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
              Novo checklist solo
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-100">Últimos checklists</h2>
            <button type="button" onClick={() => void loadRequests()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
              Atualizar
            </button>
          </div>
          {requestsLoading ? <Skeleton className="mt-4 h-40 rounded-xl" /> : null}
          {!requestsLoading && requests.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nenhum checklist recente.</p> : null}
          <div className="mt-4 space-y-2">
            {sortRequestsNewestFirst(requests).map((request) => (
              <ExpandableRequestCard key={request.id} request={request} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Novo checklist solo</h1>
            <p className="mt-1 text-sm text-slate-500">
              {selectedFlight ? `${requestTypeLabel(requestType)} · ${formatDate(selectedFlight.flight_date)} · ${flightTitle(selectedFlight)}` : "Escolha um voo da agenda para começar."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {STEPS.map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() => index <= step && setStep(index)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                  index === step
                    ? "border-cyan-700 bg-cyan-950/40 text-cyan-200"
                    : index < step
                      ? "border-emerald-800 bg-emerald-950/20 text-emerald-300"
                      : "border-slate-800 text-slate-500"
                }`}
              >
                {index + 1}. {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      {step === 0 ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <label className="text-xs font-medium text-slate-400">
              Tipo de checklist
              <select
                value={requestType}
                onChange={(event) => {
                  setRequestType(event.target.value as SoloFlightRequestType);
                  setEvaluation(null);
                }}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 sm:w-64"
              >
                <option value="voo_solo">Voo solo</option>
                <option value="primeiro_circuito_solo">Primeiro circuito solo</option>
              </select>
            </label>
            <button type="button" onClick={() => setMode("history")} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
              Cancelar
            </button>
          </div>

          {flightsLoading ? (
            <Skeleton className="mt-4 h-56 rounded-xl" />
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {agendaDays.map((day) => (
                <div key={day} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <h2 className="mb-3 text-sm font-semibold text-slate-100">{formatDate(day)}</h2>
                  <div className="space-y-2">
                    {(flightsByDay.get(day) || []).map((flight) => (
                      <button
                        key={flight.id}
                        type="button"
                        onClick={() => pickFlight(flight)}
                        className={`block w-full overflow-hidden rounded border px-2.5 py-2 text-left text-[11px] leading-tight shadow-sm transition ${
                          selectedFlight?.id === flight.id ? "border-cyan-500 bg-cyan-950/35 ring-2 ring-cyan-500/20" : "border-slate-700 bg-slate-900/80 hover:border-cyan-700 hover:bg-slate-800/80"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="truncate font-semibold text-white">{studentLabel(flight)}</p>
                            <p className="mt-1 truncate text-slate-200/90">
                              {flight.start_time || "--:--"}Z-{endTimeLabel(flight)}Z
                            </p>
                            <p className="mt-0.5 truncate text-slate-300/80">{flight.aircraft_ident || "Aeronave"} · {shortName(instructorLabel(flight), "Sem instrutor")}</p>
                          </div>
                          <span className="shrink-0 rounded border border-slate-600/80 bg-slate-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{flight.flight_status}</span>
                        </div>
                      </button>
                    ))}
                    {(flightsByDay.get(day) || []).length === 0 ? <p className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">Sem voos na agenda.</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={!canGoAerodromes}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              Avançar
            </button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-xs font-medium text-slate-400">
              Aluno
              <input value={selectedFlight ? studentLabel(selectedFlight) : ""} readOnly className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300" />
            </label>
            <label className="text-xs font-medium text-slate-400">
              Data
              <input type="date" value={flightDate} readOnly className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300" />
            </label>
            <label className="text-xs font-medium text-slate-400">
              Início (Z)
              <input type="time" value={startTime} readOnly className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300" />
            </label>
            <label className="text-xs font-medium text-slate-400">
              Corte previsto (Z)
              <input type="time" value={cutoffTime} onChange={(event) => { setCutoffTime(event.target.value); setEvaluation(null); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Horários em Zulu (UTC). O corte é calculado antes do debriefing; limite solo: até {SOLO_CUTOFF_LIMIT_ZULU}Z.
          </p>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <AiswebAerodromePicker label="Origem" value={originIcaos} onChange={(next) => { setOriginIcaos(next); setEvaluation(null); }} multiple={false} helper="SBJD é usado como padrão, mas pode ser alterado." />
            <AiswebAerodromePicker label="Aeródromos de destino solo" value={destinationIcaos} onChange={(next) => { setDestinationIcaos(next); setEvaluation(null); }} helper="Padrão: SDCO. Use um ou mais aeródromos onde haverá operação solo." />
            <AiswebAerodromePicker label="Aeródromos alternativos" value={alternateIcaos} onChange={(next) => { setAlternateIcaos(next); setEvaluation(null); }} helper="Padrão: SDPW. Informe os alternativos previstos para o checklist." />
          </div>
          <div className="mt-5 flex justify-between gap-3">
            <button type="button" onClick={() => setStep(0)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">Voltar</button>
            <button type="button" onClick={() => setStep(2)} disabled={!canGoManual} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">Avançar</button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-100">Endosso anexado</h2>
                {endorsementsLoading ? <p className="mt-1 text-sm text-slate-500">Carregando endossos...</p> : null}
                {!endorsementsLoading && endorsement ? (
                  <p className="mt-1 text-sm text-slate-400">
                    Ativo: {endorsement.fileName} · v{endorsement.version} · {new Date(endorsement.uploadedAt).toLocaleDateString("pt-BR")}
                  </p>
                ) : null}
                {!endorsementsLoading && !endorsement ? <p className="mt-1 text-sm text-amber-300">Este aluno ainda não possui endosso anexado.</p> : null}
                {!endorsementsLoading && !endorsement ? <p className="mt-1 text-xs text-slate-500">Você pode seguir para o resumo mesmo sem endosso; isso entra como flag para aprovação.</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {endorsement ? (
                  <a href={endorsement.fileUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
                    Abrir endosso ativo
                  </a>
                ) : null}
                <button type="button" onClick={() => void loadEndorsements(selectedFlight?.student_user_id || "")} disabled={endorsementsLoading} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                  Atualizar endossos
                </button>
              </div>
            </div>
            {!endorsementsLoading && endorsements.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Histórico de endossos</p>
                {endorsements.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">
                        {item.fileName} · v{item.version}
                        {item.active ? <span className="ml-2 rounded border border-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">ativo</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(item.uploadedAt).toLocaleString("pt-BR")}
                        {item.notes ? ` · ${item.notes}` : ""}
                      </p>
                    </div>
                    {item.fileUrl ? (
                      <a href={item.fileUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">
                        Abrir
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="text-xs font-medium text-slate-400">
                Observação do endosso
                <input
                  value={endorsementUploadNotes}
                  onChange={(event) => setEndorsementUploadNotes(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className={`inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-white ${endorsementUploading ? "cursor-not-allowed bg-slate-700" : "cursor-pointer bg-emerald-600 hover:bg-emerald-500"}`}>
                {endorsementUploading ? "Enviando..." : "Anexar PDF/imagem"}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  disabled={endorsementUploading || !selectedFlight?.student_user_id}
                  onChange={(event) => void uploadEndorsement(event.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {effectiveManualChecks.map((item) => (
              <label key={item.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${item.notApplicable ? "border-slate-800 bg-slate-950/20 text-slate-500" : "border-slate-800 bg-slate-950/40 text-slate-200"}`}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={item.notApplicable}
                  onChange={(event) => {
                    setManualChecks((current) => current.map((row) => (row.id === item.id ? { ...row, checked: event.target.checked } : row)));
                    setEvaluation(null);
                  }}
                />
                <span>{item.label}{item.notApplicable ? <span className="ml-2 text-xs text-slate-500">(não aplicável)</span> : null}</span>
              </label>
            ))}
          </div>
          <div className="mt-5 flex justify-between gap-3">
            <button type="button" onClick={() => setStep(1)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">Voltar</button>
            <button type="button" onClick={() => void goToSummary()} disabled={loading || !canGoSummary} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
              {loading ? "Validando..." : "Ver resumo"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className={`rounded-lg border p-4 ${evaluation?.flags.length ? "border-amber-800 bg-amber-950/20" : "border-emerald-800 bg-emerald-950/20"}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={`font-semibold ${evaluation?.flags.length ? "text-amber-100" : "text-emerald-200"}`}>
                  {evaluation ? evaluation.flags.length ? "Precisa de aprovação" : "Aprovação automática" : "Resumo ainda não validado"}
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  {evaluation?.flags.length ? `${evaluation.flags.length} item(ns) em flag.` : "Todos os critérios atendidos."}
                </p>
              </div>
              <span className={`w-fit rounded border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${evaluation ? statusBadgeClass(evaluation.status) : "border-slate-700 bg-slate-800 text-slate-300"}`}>
                {evaluation ? statusLabel(evaluation.status) : "—"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aluno</p>
              <p className="mt-1 text-slate-100">{selectedFlight ? studentLabel(selectedFlight) : evaluation?.student?.nickname || evaluation?.student?.fullName || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avião</p>
              <p className="mt-1 text-slate-100">{selectedFlight?.aircraft_ident || "Aeronave não informada"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zulu</p>
              <p className="mt-1 text-slate-100">{startTime || "--:--"}Z-{cutoffTime || "--:--"}Z</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data</p>
              <p className="mt-1 text-slate-100">{flightDate || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rota</p>
              <p className="mt-1 text-slate-100">{evaluation?.requestSnapshot.route || payload.originIcao || "-"}</p>
            </div>
          </div>

          <MetarChecklist checks={evaluation?.metarChecks || []} />
          <CheckList evaluation={evaluation} />

          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
            {evaluation?.flags.length
              ? "Como há pendências, este checklist ficará aguardando aprovação do SGSO ou coordenador. Eles recebem a solicitação e decidem pelo WhatsApp ou pelo painel administrativo."
              : "Sem pendências: ao enviar, o checklist solo é aprovado automaticamente e SGSO/coordenador recebem ciência."}
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <button type="button" onClick={() => setStep(2)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">Voltar</button>
            <div className="flex gap-3">
              <button type="button" onClick={() => void evaluate()} disabled={loading} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                {loading ? "Validando..." : "Revalidar"}
              </button>
              <button type="button" onClick={() => void submit()} disabled={loading || !evaluation} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                Enviar checklist
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
