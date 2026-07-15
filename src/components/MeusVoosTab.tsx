import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { ADMIN_USERS_FUNCTION_ID, SCHOOL_ID } from "../lib/appwrite";
import {
  importSelfCreditsFromSaga,
  importSelfFlightsFromSaga,
  reloadSagaFlightFromSource,
  type SagaImportProgress,
} from "../lib/sagaImportDb";
import { useToast } from "./ui/ToastProvider";
import { listAircrafts } from "../lib/aircraftDb";
import {
  formatMinutes,
  getDateBase,
  getFlightDateTimeMs,
  shortName,
  type FlightDisplayInfo,
} from "../lib/flightDisplay";
import { isFlightEvaluationEligible, isScheduledFlightStatus } from "../lib/flightEvaluationEligibility";
import {
  deleteSavedFlight,
  getSavedFlight,
  listSavedFlights,
  updateStudentFlightSuggestion,
  type SavedFlightListItem,
} from "../lib/flightsDb";
import {
  listSignaturesForFlight,
  signFlight,
  type FlightSignaturesForFlight,
  type SignerRole,
} from "../lib/flightSignaturesDb";
import { exportFlightFichaPdf } from "../lib/flightFichaPdf";
import { decodeFlightRecord } from "../lib/flightRecordCodec";
import { createFlightPublicShare } from "../lib/publicFlightReviewShare";
import {
  buildBasicFlightListDisplayInfo,
  invalidateFlightListDisplayCache,
  loadFlightVideoFlags,
  loadFullFlightListDisplayInfos,
  loadLightFlightListDisplayInfos,
  type FlightListDisplayInfo,
} from "../lib/flightListDisplayCache";
import {
  cancelScheduleFlight,
  getPublicSchedule,
  rescheduleScheduleFlight,
  type PublicScheduleAircraft,
  type PublicScheduleFlight,
} from "../lib/scheduleBookingDb";
import { getSchoolRules } from "../lib/schoolRulesDb";
import { listEvaluationsByStudent } from "../lib/flightEvaluationsDb";
import { listProfileNicknamesByUserIds } from "../lib/rbac";
import { navigateToTab } from "../lib/routedTabs";
import { getAircraftBadgeColorClass } from "../lib/aircraftColors";
import type { FlightScheduleRules } from "../types/schoolRules";
import {
  DEFAULT_FLIGHT_EVALUATION_RULES,
  type FlightEvaluation,
  type FlightEvaluationRules,
} from "../types/flightEvaluation";
import { CancellationModal, FlightDetailModal } from "./StudentScheduleTab";
import { FlightsAgendaBoard } from "./FlightsAgendaBoard";
import { FlightDetailView, type FlightDetailSubTab } from "./FlightDetailView";
import {
  FlightEvaluationDoneBadge,
  FlightEvaluationModal,
  FlightEvaluationPendingBadge,
} from "./FlightEvaluationModal";
import { FlightShareStickersModal } from "./FlightShareStickersModal";
import { NovoVooFlow } from "./NovoVooFlow";
import type { NovoVooStepId } from "./NovoVooFlow";
import { Skeleton } from "./ui/Skeleton";

type View = "list" | "detail" | "create";

type FlightCardInfo = FlightListDisplayInfo;
type DetailOpenOptions = { initialStepId?: NovoVooStepId; hideStepMenu?: boolean; initialSubTab?: FlightDetailSubTab };

function groupFlights(
  items: SavedFlightListItem[],
  infoById: Record<string, FlightCardInfo>,
  direction: "asc" | "desc" = "desc",
): { label: string; flights: SavedFlightListItem[] }[] {
  const ordered = [...items].sort((a, b) => {
    const diff = getFlightDateTimeMs(a, infoById[a.id]) - getFlightDateTimeMs(b, infoById[b.id]);
    return direction === "asc" ? diff : -diff;
  });
  return ordered.length ? [{ label: "", flights: ordered }] : [];
}


function formatDecimalHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  return (minutes / 60).toFixed(1) + "h";
}

function FlightStatusBadge({ status }: { status: SavedFlightListItem["flight_status"] }) {
  const cls =
    status === "Realizado"
      ? "bg-emerald-900/40 text-emerald-300"
      : status === "Cancelado"
        ? "bg-red-950/40 text-red-300"
        : "bg-sky-900/40 text-sky-300";
  return <span className={`rounded px-2 py-1 text-[11px] font-semibold ${cls}`}>{status}</span>;
}

function FutureWeightBalanceCta({ ok, onClick }: { ok: boolean; onClick: () => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      {ok ? <span className="rounded bg-emerald-900/40 px-2 py-1 text-[11px] font-semibold text-emerald-400">OK</span> : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
      >
        {ok ? "Editar" : "Enviar P&B"}
      </button>
    </div>
  );
}

function FutureStudentSuggestionStatus({ suggestion }: { suggestion?: string }) {
  const text = suggestion?.trim();
  if (!text) {
    return <span className="rounded bg-amber-900/40 px-2 py-1 text-[11px] font-semibold text-amber-400">Pendente</span>;
  }
  return <span className="text-xs text-emerald-400">OK - {text}</span>;
}

function missionLabel(info?: FlightCardInfo): string {
  const raw = info?.trainingMissionName ?? "";
  return raw.trim() || "—";
}

// ─── Voos futuros vindos da escala do SAGA (modo "escala somente no SAGA") ────
// Exibição temporária e sob demanda: nada disso é salvo no sistema.

function sagaUpcomingRange(): { from: string; to: string } {
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  // Mês atual + 2 meses (último dia do segundo mês seguinte)
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 0, 12);
  return { from, to: end.toISOString().slice(0, 10) };
}

function sagaFlightStartMs(flight: PublicScheduleFlight): number {
  const ms = new Date(`${flight.flightDate}T${flight.startTime || "00:00"}:00`).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function SagaUpcomingSkeleton({ variant }: { variant: "cards" | "list" }) {
  if (variant === "list") {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/30">
        <ul className="divide-y divide-slate-800/80">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="ml-auto h-4 w-20" />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex w-8 shrink-0 flex-col items-center gap-1">
              <Skeleton className="h-5 w-6" />
              <Skeleton className="h-2.5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-3 w-full" />
                ))}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SagaUpcomingList({
  flights,
  onOpen,
  variant = "cards",
  loading = false,
}: {
  flights: PublicScheduleFlight[];
  onOpen?: (flight: PublicScheduleFlight) => void;
  variant?: "cards" | "list";
  loading?: boolean;
}) {
  if (loading && flights.length === 0) {
    return <SagaUpcomingSkeleton variant={variant} />;
  }
  if (flights.length === 0) {
    return <p className="rounded-xl border border-slate-700/60 bg-slate-900/30 px-4 py-6 text-center text-sm text-slate-500">Nenhum voo futuro.</p>;
  }
  if (variant === "list") {
    // Mesmo visual da tabela de voos antigos (FlightTableSection)
    return (
      <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/30">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="bg-slate-950/40 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                {["Data", "Aeronave", "Apresentação", "Acionamento", "Corte", "Encerramento", "Duração", "Instrutor", "Status"].map((label) => (
                  <th key={label} className="px-3 py-2 font-semibold whitespace-nowrap">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {flights.map((flight) => (
                <tr
                  key={flight.id}
                  onClick={onOpen ? () => onOpen(flight) : undefined}
                  className={`text-slate-300 transition ${onOpen ? "cursor-pointer hover:bg-slate-800/30" : ""}`}
                >
                  <td className="px-3 py-2 text-slate-200 whitespace-nowrap">
                    {new Date(`${flight.flightDate}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`rounded border px-1.5 py-0.5 ${getAircraftBadgeColorClass(flight.aircraftIdent)}`}>{flight.aircraftIdent || "—"}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{flight.presentationTime || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{flight.startTime || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{flight.cutoffTime ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{flight.endTime ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold text-emerald-400 whitespace-nowrap">{formatMinutes(flight.durationMinutes)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{shortName(flight.instructorName ?? "") || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><FlightStatusBadge status={flight.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {flights.map((flight) => {
          const d = new Date(`${flight.flightDate}T12:00:00`);
          const day = d.getDate();
          const mon = d.toLocaleString("pt-BR", { month: "short" }).replace(".", "");
          return (
            <li
              key={flight.id}
              onClick={onOpen ? () => onOpen(flight) : undefined}
              className={`rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 ${onOpen ? "cursor-pointer transition hover:border-slate-600" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex w-8 shrink-0 flex-col items-center text-center">
                  <span className="text-lg font-bold leading-none text-slate-100">{day}</span>
                  <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{mon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${getAircraftBadgeColorClass(flight.aircraftIdent)}`}>
                      {flight.aircraftIdent || "—"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {flight.startTime || "—"}{flight.cutoffTime ? ` – ${flight.cutoffTime}` : ""}
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">· {formatMinutes(flight.durationMinutes)} de voo</span>
                    {flight.instructorName ? (
                      <span className="text-xs text-slate-500">· {shortName(flight.instructorName)}</span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-500 sm:grid-cols-4">
                    <span>Apresentação: <strong className="text-slate-300">{flight.presentationTime || "—"}</strong></span>
                    <span>Acionamento: <strong className="text-slate-300">{flight.startTime || "—"}</strong></span>
                    <span>Corte: <strong className="text-slate-300">{flight.cutoffTime ?? "—"}</strong></span>
                    <span>Encerramento: <strong className="text-slate-300">{flight.endTime ?? "—"}</strong></span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SectionTitle({ title, tone }: { title: string; tone: "future" | "past" | "default" }) {
  const color =
    tone === "future"
      ? "text-sky-300"
      : tone === "past"
        ? "text-violet-300"
        : "text-slate-400";
  return <p className={`text-xs font-semibold uppercase tracking-widest ${color}`}>{title}</p>;
}

function writeFichaWindowStatus(printWindow: Window, title: string, message: string) {
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        body { margin: 0; background: #020617; color: #e2e8f0; font-family: Arial, sans-serif; }
        main { min-height: 100vh; display: grid; place-items: center; padding: 24px; text-align: center; }
        h1 { margin: 0 0 8px; font-size: 20px; }
        p { margin: 0; color: #94a3b8; }
      </style>
    </head>
    <body>
      <main>
        <div>
          <h1>${title}</h1>
          <p>${message}</p>
        </div>
      </main>
    </body>
  </html>`);
  printWindow.document.close();
}

type DisplayMode = "cards" | "calendar" | "table";
const FLIGHT_PAGE_SIZE = 50;
const FULL_INFO_PRELOAD_LIMIT = 24;

function defaultDisplayMode(): DisplayMode {
  if (typeof window === "undefined") return "table";
  return window.matchMedia("(min-width: 768px)").matches ? "table" : "cards";
}

function displayModeStorageKey(userId?: string): string {
  return `gfv:meus-voos:aluno:${userId ?? "anon"}:displayMode`;
}

function readStoredDisplayMode(userId?: string): DisplayMode {
  if (typeof window === "undefined") return defaultDisplayMode();
  const stored = window.localStorage.getItem(displayModeStorageKey(userId));
  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  if (!isDesktop && stored === "table") return "cards";
  return stored === "cards" || stored === "calendar" || stored === "table" ? stored : defaultDisplayMode();
}

function applyProfileNicknamesToInfos(
  infos: Record<string, FlightCardInfo>,
  items: SavedFlightListItem[],
  nicknames: Record<string, string>,
): Record<string, FlightCardInfo> {
  const next = { ...infos };
  for (const item of items) {
    const info = next[item.id];
    if (!info) continue;
    const studentNick = (item.student_user_id && nicknames[item.student_user_id]?.trim()) || "";
    const instructorNick = (item.instructor_user_id && nicknames[item.instructor_user_id]?.trim()) || "";
    if (!studentNick && !instructorNick) continue;
    next[item.id] = {
      ...info,
      ...(studentNick ? { studentName: studentNick } : {}),
      ...(instructorNick ? { instructorName: instructorNick } : {}),
    };
  }
  return next;
}

function withPreferredNicknames(
  flights: PublicScheduleFlight[],
  nicknames: Record<string, string>,
): PublicScheduleFlight[] {
  return flights.map((flight) => {
    const instructorNick = (flight.instructorUserId && nicknames[flight.instructorUserId]?.trim()) || "";
    const studentNick = (flight.studentUserId && nicknames[flight.studentUserId]?.trim()) || "";
    if (!instructorNick && !studentNick) return flight;
    return {
      ...flight,
      ...(instructorNick ? { instructorName: instructorNick } : {}),
      ...(studentNick ? { studentName: studentNick } : {}),
    };
  });
}

function selectFullInfoPreloadItems(
  items: SavedFlightListItem[],
  infoById: Record<string, FlightDisplayInfo>,
): SavedFlightListItem[] {
  return [...items]
    .sort((a, b) => {
      const aFuture = isScheduledFlightStatus(a, infoById[a.id]);
      const bFuture = isScheduledFlightStatus(b, infoById[b.id]);
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      const diff = getFlightDateTimeMs(a, infoById[a.id]) - getFlightDateTimeMs(b, infoById[b.id]);
      return aFuture ? diff : -diff;
    })
    .slice(0, FULL_INFO_PRELOAD_LIMIT);
}

function DisplayModeIcon({ mode }: { mode: DisplayMode }) {
  if (mode === "calendar") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M5.75 3A1.75 1.75 0 004 4.75v10.5C4 16.216 4.784 17 5.75 17h8.5A1.75 1.75 0 0016 15.25V4.75A1.75 1.75 0 0014.25 3h-8.5zM5.5 7h9v8.25a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25V7z" />
      </svg>
    );
  }
  if (mode === "table") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 5.75A1.75 1.75 0 014.75 4h10.5A1.75 1.75 0 0117 5.75v8.5A1.75 1.75 0 0115.25 16H4.75A1.75 1.75 0 013 14.25v-8.5zM4.5 8h11V5.75a.25.25 0 00-.25-.25H4.75a.25.25 0 00-.25.25V8zm0 1.5v4.75c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V9.5h-11z" />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M4.75 3A1.75 1.75 0 003 4.75v2.5C3 8.216 3.784 9 4.75 9h2.5A1.75 1.75 0 009 7.25v-2.5A1.75 1.75 0 007.25 3h-2.5zm8 0A1.75 1.75 0 0011 4.75v2.5C11 8.216 11.784 9 12.75 9h2.5A1.75 1.75 0 0017 7.25v-2.5A1.75 1.75 0 0015.25 3h-2.5zm-8 8A1.75 1.75 0 003 12.75v2.5C3 16.216 3.784 17 4.75 17h2.5A1.75 1.75 0 009 15.25v-2.5A1.75 1.75 0 007.25 11h-2.5zm8 0A1.75 1.75 0 0011 12.75v2.5c0 .966.784 1.75 1.75 1.75h2.5A1.75 1.75 0 0017 15.25v-2.5A1.75 1.75 0 0015.25 11h-2.5z" />
    </svg>
  );
}

function ShareFlightButton({
  onClick,
  className = "",
  iconOnly = false,
}: {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Compartilhar"
      aria-label="Compartilhar"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 ${iconOnly ? "p-2" : "px-3 py-2"} text-xs font-semibold text-pink-400 transition hover:border-pink-400/60 hover:bg-pink-500/20 ${className}`}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M13.5 5.5a2.5 2.5 0 10-2.45-3.01L7.2 4.42a2.5 2.5 0 100 3.16l3.85 1.93a2.5 2.5 0 10.67-1.34L7.87 6.24a2.57 2.57 0 000-.48l3.85-1.93c.45.99 1.45 1.67 2.78 1.67z" />
      </svg>
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="3.25" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.3" cy="6.8" r="1.1" fill="currentColor" />
      </svg>
      {iconOnly ? null : "Compartilhar"}
    </button>
  );
}

type FlightActionItem = {
  label: string;
  tone?: "default" | "sky" | "amber" | "emerald" | "red";
  disabled?: boolean;
  onSelect: () => void;
};

function OpenFlightChevron() {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700/60 bg-slate-950/30 text-slate-400 transition group-hover:border-sky-500/50 group-hover:text-sky-300" aria-hidden="true">
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M7.22 4.47a.75.75 0 011.06 0l5 5a.75.75 0 010 1.06l-5 5a.75.75 0 11-1.06-1.06L11.69 10 7.22 5.53a.75.75 0 010-1.06z" clipRule="evenodd" />
      </svg>
    </span>
  );
}

function MoreActionsButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Mais opcoes"
      aria-expanded={open}
      onClick={onClick}
      className={`rounded-lg border p-1.5 transition ${open ? "border-sky-500/50 bg-sky-500/10 text-sky-300" : "border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
      </svg>
    </button>
  );
}

function FlightActionsPopover({
  actions,
  onClose,
}: {
  actions: FlightActionItem[];
  onClose: () => void;
}) {
  if (actions.length === 0) return null;
  const toneClass: Record<NonNullable<FlightActionItem["tone"]>, string> = {
    default: "text-slate-200 hover:bg-slate-800",
    sky: "text-sky-300 hover:bg-sky-500/10",
    amber: "text-amber-300 hover:bg-amber-500/10",
    emerald: "text-emerald-300 hover:bg-emerald-500/10",
    red: "text-red-300 hover:bg-red-500/10",
  };
  return (
    <>
      <div
        className="fixed inset-0 z-30"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      />
      <div className="absolute right-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl shadow-slate-950/40">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={action.disabled}
            onClick={(event) => {
              event.stopPropagation();
              if (action.disabled) return;
              onClose();
              action.onSelect();
            }}
            className={`block w-full px-3 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${toneClass[action.tone ?? "default"]}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}

export function MeusVoosTab() {
  const { user, configured } = useAuth();
  const { canTab } = usePermissions();
  const { showToast } = useToast();
  const [view, setView] = useState<View>("list");
  const [selectedFlightId, setSelectedFlightId] = useState<string | undefined>(undefined);
  const [detailOpenOptions, setDetailOpenOptions] = useState<DetailOpenOptions>({});
  const [items, setItems] = useState<SavedFlightListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalFlights, setTotalFlights] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [infoById, setInfoById] = useState<Record<string, FlightCardInfo>>({});
  const [aircraftOptions, setAircraftOptions] = useState<string[]>([]);
  const [instructorFilter, setInstructorFilter] = useState("");
  const [aircraftFilter, setAircraftFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => readStoredDisplayMode(user?.id));
  const [studentSuggestionFlightId, setStudentSuggestionFlightId] = useState<string | null>(null);
  const [shareFlightId, setShareFlightId] = useState<string | null>(null);
  const [publicLinkFlightId, setPublicLinkFlightId] = useState<string | null>(null);
  const [cardMenuFlightId, setCardMenuFlightId] = useState<string | null>(null);
  const [exportingFichaId, setExportingFichaId] = useState<string | null>(null);
  const [signaturesByFlightId, setSignaturesByFlightId] = useState<Record<string, FlightSignaturesForFlight>>({});
  const [signingFlightId, setSigningFlightId] = useState<string | null>(null);
  const [signingRole, setSigningRole] = useState<SignerRole | null>(null);
  const [signingPassword, setSigningPassword] = useState("");
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [studentSuggestionDraft, setStudentSuggestionDraft] = useState("");
  const [studentSuggestionSaving, setStudentSuggestionSaving] = useState(false);
  const [studentSuggestionError, setStudentSuggestionError] = useState<string | null>(null);
  const [flightEvaluationEnabled, setFlightEvaluationEnabled] = useState(false);
  const [flightEvaluationRules, setFlightEvaluationRules] = useState<FlightEvaluationRules>(DEFAULT_FLIGHT_EVALUATION_RULES);
  const [evaluationsByFlightId, setEvaluationsByFlightId] = useState<Record<string, FlightEvaluation>>({});
  const [evaluationFlightId, setEvaluationFlightId] = useState<string | null>(null);
  const [sagaImporting, setSagaImporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SagaImportProgress | null>(null);
  const [syncOverlayVisible, setSyncOverlayVisible] = useState(false);
  const [reloadingSagaFlightId, setReloadingSagaFlightId] = useState<string | null>(null);
  const canManageFlights = user?.role === "instrutor" || user?.role === "admin";
  const isStudentView = user?.role === "aluno";
  const showSagaSync = !!ADMIN_USERS_FUNCTION_ID && !!user;
  const [sagaOnlySchedule, setSagaOnlySchedule] = useState(false);
  const [sagaUpcoming, setSagaUpcoming] = useState<PublicScheduleFlight[]>([]);
  const [sagaUpcomingLoading, setSagaUpcomingLoading] = useState(true);
  const [sagaAircrafts, setSagaAircrafts] = useState<PublicScheduleAircraft[]>([]);
  const [scheduleTabEnabled, setScheduleTabEnabled] = useState(false);
  const [scheduleRules, setScheduleRules] = useState<FlightScheduleRules | null>(null);
  const [sagaDetailFlight, setSagaDetailFlight] = useState<PublicScheduleFlight | null>(null);
  const [sagaCancelFlight, setSagaCancelFlight] = useState<PublicScheduleFlight | null>(null);

  // Modo "escala somente no SAGA": busca on-demand a escala do mês atual + 2 meses
  // e exibe os voos futuros do aluno na seção "Voos futuros". Nada é salvo no sistema.
  useEffect(() => {
    if (!user || !isStudentView) {
      setSagaUpcomingLoading(false);
      return;
    }
    let cancelled = false;
    setSagaUpcomingLoading(true);
    void getSchoolRules()
      .then(async (rules) => {
        if (cancelled) return;
        // Aba Escala visível p/ o aluno (regra da escola E permissão da role) — controla
        // o modal reaproveitado da Escala e o botão "Agendar novo voo".
        setScheduleTabEnabled(rules.studentTabs.schedule === true && canTab("schedule"));
        setFlightEvaluationEnabled(rules.flightEvaluation.enabled);
        setFlightEvaluationRules(rules.flightEvaluation);
        if (rules.flightEvaluation.enabled && user.id) {
          void listEvaluationsByStudent(user.id)
            .then((map) => {
              if (cancelled) return;
              const next: Record<string, FlightEvaluation> = {};
              map.forEach((evaluation, flightId) => {
                next[flightId] = evaluation;
              });
              setEvaluationsByFlightId(next);
            })
            .catch(() => {
              if (!cancelled) setEvaluationsByFlightId({});
            });
        } else {
          setEvaluationsByFlightId({});
        }
        if (!rules.schedule.sagaOnlySchedule) return;
        setSagaOnlySchedule(true);
        setScheduleRules(rules.schedule);
        const { from, to } = sagaUpcomingRange();
        const data = await getPublicSchedule(from, to);
        if (cancelled) return;
        setSagaAircrafts(data.aircrafts);
        const minStartMs = Date.now() + 60 * 60 * 1000;
        const upcoming = data.flights
          .filter((flight) => flight.isOwn && flight.status !== "Cancelado" && sagaFlightStartMs(flight) >= minStartMs)
          .sort((a, b) => sagaFlightStartMs(b) - sagaFlightStartMs(a));
        const nicknameIds = Array.from(
          new Set(upcoming.flatMap((flight) => [flight.instructorUserId, flight.studentUserId].filter(Boolean) as string[])),
        );
        const nicknames = nicknameIds.length ? await listProfileNicknamesByUserIds(nicknameIds) : {};
        if (cancelled) return;
        setSagaUpcoming(withPreferredNicknames(upcoming, nicknames));
      })
      .catch(() => {
        if (!cancelled) setSagaUpcoming([]);
      })
      .finally(() => {
        if (!cancelled) setSagaUpcomingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isStudentView, refreshKey, canTab]);

  // Cancelamento a partir do modal da Escala reaproveitado nos voos futuros
  const executeSagaCancel = async (flight: PublicScheduleFlight, reason: string) => {
    await cancelScheduleFlight(flight.id, { reason });
    showToast({ variant: "success", message: "Voo cancelado." });
    setSagaCancelFlight(null);
    setSagaDetailFlight(null);
    setRefreshKey((k) => k + 1);
  };

  const SAGA_AGENDA_PREFIX = "sagaup_";

  // Voos futuros do SAGA plotados na visão de agenda (itens sintéticos, nada persiste)
  const sagaAgendaItems = useMemo<SavedFlightListItem[]>(() => {
    if (!sagaOnlySchedule || !isStudentView) return [];
    return sagaUpcoming.map((flight) => {
      const blockMinutes = Math.max(
        30,
        timeToMin(flight.endTime ?? flight.cutoffTime ?? flight.startTime) - timeToMin(flight.presentationTime || flight.startTime),
      );
      return {
        id: `${SAGA_AGENDA_PREFIX}${flight.id}`,
        source_filename: "saga-upcoming",
        created_at: `${flight.flightDate}T12:00:00`,
        aircraft_ident: flight.aircraftIdent,
        duration_sec: blockMinutes * 60,
        flight_date: flight.flightDate,
        start_time: flight.presentationTime || flight.startTime,
        student_user_id: flight.studentUserId ?? null,
        instructor_user_id: flight.instructorUserId ?? null,
        training_track_id: null,
        training_stage_id: null,
        training_mission_id: null,
        training_snapshot_json: null,
        from_to: null,
        landings: null,
        block_time_minutes: null,
        total_flight_minutes: null,
        total_miles: null,
        telemetry_present: null,
        instructor_suggestion_md: null,
        student_suggestion_md: null,
        instructor_suggestion_present: null,
        student_suggestion_present: null,
        weight_balance_complete: null,
        is_night: null,
        training_mission_ids_json: null,
        schedule_week_start: null,
        schedule_demand_id: null,
        flight_seq_number: null,
        instructor_signed: null,
        student_signed: null,
        admin_operator_signed: null,
        instructor_signed_at: null,
        flight_status: flight.status,
      } satisfies SavedFlightListItem;
    });
  }, [sagaOnlySchedule, isStudentView, sagaUpcoming]);

  const sagaAgendaInfoById = useMemo(() => {
    const map: Record<string, FlightCardInfo> = {};
    for (const flight of sagaUpcoming) {
      map[`${SAGA_AGENDA_PREFIX}${flight.id}`] = {
        ...buildBasicFlightListDisplayInfo(sagaAgendaItems.find((item) => item.id === `${SAGA_AGENDA_PREFIX}${flight.id}`)!),
        flightDateIso: flight.flightDate,
        startTime: flight.presentationTime || flight.startTime,
        endTime: flight.endTime ?? flight.cutoffTime ?? "",
        instructorName: flight.instructorName ?? "",
        aircraft: flight.aircraftIdent,
        videoOk: false,
      };
    }
    return map;
  }, [sagaUpcoming, sagaAgendaItems]);

  function timeToMin(value: string | null | undefined): number {
    const [h, m] = String(value || "0:0").split(":").map(Number);
    return (Number.isFinite(h) ? h! : 0) * 60 + (Number.isFinite(m) ? m! : 0);
  }

  const openSagaAgendaFlight = (id: string): boolean => {
    if (!id.startsWith(SAGA_AGENDA_PREFIX)) return false;
    const flight = sagaUpcoming.find((row) => `${SAGA_AGENDA_PREFIX}${row.id}` === id);
    if (flight && scheduleTabEnabled) setSagaDetailFlight(flight);
    return true;
  };

  const handleSagaSync = async () => {
    if (sagaImporting) return;
    setSagaImporting(true);
    setSyncOverlayVisible(true);
    setSyncProgress(null);
    try {
      if (isStudentView) {
        setSyncProgress({
          runId: "self-credit-sync",
          status: "running",
          stage: "credits",
          message: "Atualizando créditos no SAGA antes dos voos...",
          current: 0,
          total: 0,
          logs: [],
        });
        await importSelfCreditsFromSaga();
      }
      const summary = await importSelfFlightsFromSaga({
        onProgress: (p) => setSyncProgress(p),
      });
      const novos = summary.flightsCreated ?? 0;
      const removidos = summary.flightsDeleted ?? 0;
      const deletedIds = (summary.deletedFlights ?? []).map((item) => item.flightId).filter(Boolean);
      if (summary.staleCleanup) {
        console.log("[SAGA sync][MeusVoos] cleanup", summary.staleCleanup);
      }
      showToast({
        message: [
          novos > 0 ? `${novos} voo(s) novo(s) importado(s) do SAGA.` : "Nenhum voo novo encontrado no SAGA.",
          removidos > 0 ? `${removidos} voo(s) removido(s) localmente por terem sido apagados no SAGA.` : "",
          summary.staleCleanup?.failed
            ? `Falha ao remover ${summary.staleCleanup.failed} voo(s). Abra o console para detalhes.`
            : "",
          deletedIds.length ? `IDs removidos: ${deletedIds.join(", ")}` : "",
        ].filter(Boolean).join(" "),
        variant: novos > 0 || removidos > 0 ? "success" : "info",
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      showToast({ message: (e as Error).message, variant: "error" });
    } finally {
      setSagaImporting(false);
      window.setTimeout(() => {
        setSyncProgress(null);
        setSyncOverlayVisible(false);
      }, 250);
    }
  };

  const handleReloadSagaFlight = async (flight: SavedFlightListItem) => {
    if (reloadingSagaFlightId) return;
    setReloadingSagaFlightId(flight.id);
    try {
      const result = await reloadSagaFlightFromSource({
        flightId: flight.id,
        sagaFlightId: flight.saga_flight_id ?? undefined,
      });
      showToast({
        variant: result.refreshed ? "success" : "info",
        message: result.message || "Dados do voo recarregados do SAGA.",
      });
      invalidateFlightListDisplayCache([flight.id]);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      showToast({ message: (e as Error).message, variant: "error" });
    } finally {
      setReloadingSagaFlightId(null);
    }
  };

  const refresh = useCallback(async () => {
    if (!user || !configured) {
      setItems([]);
      return;
    }
    setLoading(true);
    setErr(null);
    const { data, error, nextCursor: cursor, total } = await listSavedFlights(
      { userId: user.id, role: user.role },
      { limit: FLIGHT_PAGE_SIZE },
    );
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setItems(data ?? []);
    setNextCursor(cursor);
    setTotalFlights(total);
  }, [user, configured]);

  const loadMore = useCallback(async () => {
    if (!user || !configured || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErr(null);
    const { data, error, nextCursor: cursor, total } = await listSavedFlights(
      { userId: user.id, role: user.role },
      { limit: FLIGHT_PAGE_SIZE, cursor: nextCursor },
    );
    setLoadingMore(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setItems((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      for (const item of data ?? []) byId.set(item.id, item);
      return Array.from(byId.values());
    });
    setNextCursor(cursor);
    setTotalFlights(total);
  }, [configured, loadingMore, nextCursor, user]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    setDisplayMode(readStoredDisplayMode(user?.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    window.localStorage.setItem(displayModeStorageKey(user.id), displayMode);
  }, [displayMode, user?.id]);

  useEffect(() => {
    const schoolId = SCHOOL_ID ?? "escola_principal";
    void listAircrafts(schoolId)
      .then((res) => setAircraftOptions(res.filter((a) => a.active).map((a) => a.registration)))
      .catch(() => setAircraftOptions([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) {
      setInfoById({});
      return;
    }

    setInfoById((prev) => {
      const next: Record<string, FlightCardInfo> = {};
      for (const item of items) {
        next[item.id] = prev[item.id] ?? {
          ...buildBasicFlightListDisplayInfo(item),
          videoOk: false,
        };
      }
      return next;
    });

    void (async () => {
      const lightInfos = await loadLightFlightListDisplayInfos(items);
      if (cancelled) return;
      const nicknameIds = Array.from(
        new Set(items.flatMap((item) => [item.student_user_id, item.instructor_user_id].filter(Boolean) as string[])),
      );
      const nicknames = nicknameIds.length ? await listProfileNicknamesByUserIds(nicknameIds) : {};
      if (cancelled) return;
      setInfoById((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.id] = {
            ...(lightInfos[item.id] ?? buildBasicFlightListDisplayInfo(item)),
            videoOk: prev[item.id]?.videoOk ?? false,
          };
        }
        return applyProfileNicknamesToInfos(next, items, nicknames);
      });

      const preloadItems = selectFullInfoPreloadItems(items, lightInfos);
      const [fullInfos, videoFlags] = await Promise.all([
        loadFullFlightListDisplayInfos(preloadItems),
        loadFlightVideoFlags(items),
      ]);
      if (cancelled) return;
      setInfoById((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.id] = {
            ...(fullInfos[item.id] ?? lightInfos[item.id] ?? buildBasicFlightListDisplayInfo(item)),
            videoOk: videoFlags[item.id] ?? prev[item.id]?.videoOk ?? false,
          };
        }
        return applyProfileNicknamesToInfos(next, items, nicknames);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    if (items.length === 0) return;
    const pastIds = items
      .filter((item) => !isScheduledFlightStatus(item, infoById[item.id]))
      .map((item) => item.id);
    if (pastIds.length === 0) return;
    void (async () => {
      const results = await Promise.all(pastIds.map((id) => listSignaturesForFlight(id)));
      setSignaturesByFlightId((prev) => {
        const next = { ...prev };
        pastIds.forEach((id, i) => {
          if (results[i]?.data) next[id] = results[i].data!;
        });
        return next;
      });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const handleSign = async () => {
    if (!user || !signingFlightId || !signingRole) return;
    if (!signingPassword) {
      setSigningError("Informe sua senha para assinar.");
      return;
    }
    setSigningInProgress(true);
    setSigningError(null);
    const passwordForSigning = signingPassword;
    setSigningPassword("");
    const flightRes = await getSavedFlight(signingFlightId);
    if (flightRes.error || !flightRes.data) {
      setSigningError(flightRes.error?.message ?? "Voo não encontrado.");
      setSigningInProgress(false);
      return;
    }
    const res = await signFlight({
      flightId: signingFlightId,
      actorUserId: user.id,
      actorRole: user.role,
      signerRole: signingRole,
      csvText: flightRes.data.csv_text,
      password: passwordForSigning,
    });
    setSigningInProgress(false);
    if (res.error) {
      setSigningError(res.error.message);
      return;
    }
    if (res.data) {
      setSignaturesByFlightId((prev) => ({
        ...prev,
        [signingFlightId]: {
          ...(prev[signingFlightId] ?? { student: null, instructor: null, admin_operator: null }),
          [signingRole === "admin_operator" ? "admin_operator" : signingRole]: res.data,
        },
      }));
    }
    setRefreshKey((k) => k + 1);
    setSigningFlightId(null);
    setSigningRole(null);
    setSigningPassword("");
  };

  const filteredItems = useMemo(() => {
    const inf = instructorFilter.trim().toLowerCase();
    const af = aircraftFilter.trim().toLowerCase();
    return items.filter((item) => {
      const info = infoById[item.id];
      if (inf && !(info?.instructorName ?? "").toLowerCase().includes(inf)) return false;
      if (af && !(info?.aircraft ?? "").toLowerCase().includes(af)) return false;
      const iso = info?.flightDateIso ?? (item.created_at ?? "").slice(0, 10);
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo && iso > dateTo) return false;
      return true;
    });
  }, [items, infoById, instructorFilter, aircraftFilter, dateFrom, dateTo]);

  const groups = useMemo(() => groupFlights(filteredItems, infoById), [filteredItems, infoById]);
  const futureGroups = useMemo(() => {
    const future = filteredItems.filter((item) => isScheduledFlightStatus(item, infoById[item.id]));
    return groupFlights(future, infoById, "desc");
  }, [filteredItems, infoById]);
  const pastGroups = useMemo(() => {
    const past = filteredItems.filter((item) => !isScheduledFlightStatus(item, infoById[item.id]));
    return groupFlights(past, infoById, "desc");
  }, [filteredItems, infoById]);
  // "Voos de trial": ranking cronológico (0-based) dos voos reais do aluno.
  // Os primeiros N voos ficam liberados sem membership do Club (mesma semântica
  // da Jornada, mas contando voos em ordem de data em vez de missões).
  const trialFlightIndexById = useMemo(() => {
    const map: Record<string, number> = {};
    if (!isStudentView) return map;
    const realFlights = items.filter((item) => !isScheduledFlightStatus(item, infoById[item.id]));
    realFlights
      .slice()
      .sort((a, b) => getFlightDateTimeMs(a, infoById[a.id]) - getFlightDateTimeMs(b, infoById[b.id]))
      .forEach((item, index) => {
        map[item.id] = index;
      });
    return map;
  }, [isStudentView, items, infoById]);
  const consolidatedSummary = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        const info = infoById[item.id];
        return {
          flights: acc.flights + 1,
          minutes: acc.minutes + (info?.totalFlightMinutes ?? (item.duration_sec ? Math.round(item.duration_sec / 60) : 0)),
          landings: acc.landings + (info?.landings ?? 0),
        };
      },
      { flights: 0, minutes: 0, landings: 0 },
    );
  }, [filteredItems, infoById]);
  const dataLoading = loading && items.length === 0;

  const openFlight = (id: string, options: DetailOpenOptions = {}) => {
    setSelectedFlightId(id);
    setDetailOpenOptions(options);
    setView("detail");
  };

  const openFutureWeightBalance = (id: string) => {
    openFlight(id, { initialStepId: "peso-balanceamento", hideStepMenu: true });
  };

  const openFlightVideo = (id: string) => {
    openFlight(id, { initialSubTab: "videos" });
  };

  const openFlightTelemetry = (id: string) => {
    openFlight(id, { initialSubTab: "telemetria" });
  };

  const generatePublicLink = async (id: string) => {
    setPublicLinkFlightId(id);
    try {
      const url = await createFlightPublicShare(id);
      await navigator.clipboard?.writeText(url);
      showToast({ variant: "success", message: "Link publico gerado e copiado." });
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Nao foi possivel gerar o link publico." });
    } finally {
      setPublicLinkFlightId(null);
    }
  };

  const exportFicha = async (id: string) => {
    setErr(null);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setErr("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
      return;
    }
    writeFichaWindowStatus(printWindow, "Preparando ficha", "Carregando dados do voo...");
    setExportingFichaId(id);
    const { data, error } = await getSavedFlight(id);
    setExportingFichaId(null);

    if (error || !data) {
      const message = error?.message ?? "Voo não encontrado.";
      setErr(message);
      writeFichaWindowStatus(printWindow, "Falha ao gerar ficha", message);
      return;
    }

    const decoded = decodeFlightRecord(data.csv_text);
    if (!decoded.meta) {
      const message = "Ficha do voo sem metadados estruturados para exportar.";
      setErr(message);
      writeFichaWindowStatus(printWindow, "Falha ao gerar ficha", message);
      return;
    }

    const result = exportFlightFichaPdf({
      meta: decoded.meta,
      telemetryCsv: decoded.telemetryCsv,
      telemetryFileName: data.source_filename,
    }, { targetWindow: printWindow });
    if (!result.ok) setErr(result.error ?? "Não foi possível exportar o PDF.");
  };

  const openStudentSuggestionModal = (id: string) => {
    const info = infoById[id];
    setStudentSuggestionFlightId(id);
    setStudentSuggestionDraft(info?.studentSuggestionMd ?? "");
    setStudentSuggestionError(null);
  };

  const openFlightEvaluationModal = (id: string) => {
    setEvaluationFlightId(id);
  };

  const closeStudentSuggestionModal = () => {
    if (studentSuggestionSaving) return;
    setStudentSuggestionFlightId(null);
    setStudentSuggestionDraft("");
    setStudentSuggestionError(null);
  };

  const saveStudentSuggestion = async () => {
    if (!user || !studentSuggestionFlightId) return;
    setStudentSuggestionSaving(true);
    setStudentSuggestionError(null);
    const { error } = await updateStudentFlightSuggestion(studentSuggestionFlightId, {
      actorUserId: user.id,
      suggestionMd: studentSuggestionDraft,
    });
    setStudentSuggestionSaving(false);
    if (error) {
      setStudentSuggestionError(error.message);
      return;
    }
    invalidateFlightListDisplayCache([studentSuggestionFlightId]);
    setInfoById((prev) => {
      const current = prev[studentSuggestionFlightId];
      if (!current) return prev;
      return {
        ...prev,
        [studentSuggestionFlightId]: {
          ...current,
          studentSuggestionMd: studentSuggestionDraft.trim(),
        },
      };
    });
    setRefreshKey((k) => k + 1);
    closeStudentSuggestionModal();
  };

  const backToList = () => {
    setView("list");
    setSelectedFlightId(undefined);
    setDetailOpenOptions({});
  };

  const handleDelete = async (id: string) => {
    const item = items.find((i) => i.id === id);
    const isSagaImported = Boolean(item?.saga_flight_id);
    if (item?.instructor_signed && !isSagaImported) {
      setErr("Não é possível apagar um voo assinado pelo instrutor.");
      return;
    }
    if (!confirm("Apagar este voo da nuvem?")) return;
    const { error } = await deleteSavedFlight(id);
    if (error) {
      setErr(error.message);
    } else {
      invalidateFlightListDisplayCache([id]);
      setRefreshKey((k) => k + 1);
    }
  };

  const handleCreated = (id: string) => {
    invalidateFlightListDisplayCache([id]);
    setRefreshKey((k) => k + 1);
    setSelectedFlightId(id);
    setDetailOpenOptions({});
    setView("detail");
  };

  const studentSuggestionFlight = studentSuggestionFlightId
    ? items.find((item) => item.id === studentSuggestionFlightId) ?? null
    : null;
  const studentSuggestionInfo = studentSuggestionFlightId ? infoById[studentSuggestionFlightId] : undefined;
  const evaluationFlight = evaluationFlightId
    ? items.find((item) => item.id === evaluationFlightId) ?? null
    : null;
  const evaluationInfo = evaluationFlightId ? infoById[evaluationFlightId] : undefined;

  if (view === "create") {
    return (
      <NovoVooFlow
        onCancel={() => {
          setView("list");
          setRefreshKey((k) => k + 1);
        }}
        onPublished={handleCreated}
      />
    );
  }

  if (view === "detail") {
    return (
      <FlightDetailView
        flightId={selectedFlightId}
        onBack={backToList}
        initialSubTab={detailOpenOptions.initialSubTab}
        fichaInitialStepId={detailOpenOptions.initialStepId}
        hideFichaStepMenu={detailOpenOptions.hideStepMenu}
        trialFlightIndex={selectedFlightId ? trialFlightIndexById[selectedFlightId] : undefined}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div
        className={`flex flex-col items-stretch gap-4 sm:flex-row sm:items-center ${
          canManageFlights ? "justify-between" : "sm:justify-end"
        }`}
      >
        {canManageFlights ? (
          <h2 className="text-lg font-semibold text-slate-100">Voos dos alunos</h2>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            title="Filtros"
            aria-label="Mostrar filtros"
            aria-expanded={filtersOpen}
            className={`relative rounded-lg border p-2 transition md:hidden ${
              filtersOpen
                ? "border-sky-500/60 bg-sky-500/10 text-sky-300"
                : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
            </svg>
            {instructorFilter || aircraftFilter || dateFrom || dateTo ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-400" />
            ) : null}
          </button>
          <div className="flex rounded-lg border border-slate-700 bg-slate-900/60 p-1">
            {([
              ["cards", "Card"],
              ["calendar", "Agenda"],
              ["table", "Lista"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDisplayMode(mode)}
                className={`items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === "table" ? "hidden md:inline-flex" : "inline-flex"} ${
                  displayMode === mode
                    ? "bg-sky-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <DisplayModeIcon mode={mode} />
                {label}
              </button>
            ))}
          </div>
          {showSagaSync && (
            <button
              type="button"
              onClick={() => void handleSagaSync()}
              disabled={sagaImporting}
              className="flex items-center gap-2 rounded-lg border border-sky-700/50 bg-sky-900/30 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-800/40 disabled:opacity-50"
            >
              {sagaImporting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sincronizando…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v-2a8 8 0 018-8 8 8 0 017.32 4.74" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 12v2a8 8 0 01-8 8 8 8 0 01-7.32-4.74" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 4v4h-4M4 20v-4h4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Sincronizar
                </>
              )}
            </button>
          )}
          {isStudentView && scheduleTabEnabled && (
            <button
              type="button"
              onClick={() => navigateToTab("/aluno/escala")}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-600/60 bg-sky-900/30 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-800/40 sm:w-auto"
            >
              + Agendar novo voo
            </button>
          )}
          {canManageFlights && (
            <button
              type="button"
              onClick={() => setView("create")}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 sm:w-auto"
            >
              + Novo voo
            </button>
          )}
        </div>
      </div>

      {canManageFlights ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {dataLoading ? (
            <>
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
            </>
          ) : (
            <>
              <SummaryCard label="Voos" value={String(consolidatedSummary.flights)} />
              <SummaryCard label="Horas" value={formatMinutes(consolidatedSummary.minutes)} />
              <SummaryCard label="Pousos" value={String(consolidatedSummary.landings)} />
            </>
          )}
        </div>
      ) : null}

      <div className={`rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 ${filtersOpen ? "" : "hidden md:block"}`}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Filtros avançados</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            type="text"
            value={instructorFilter}
            onChange={(e) => setInstructorFilter(e.target.value)}
            placeholder="Nome do instrutor"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
          <select
            value={aircraftFilter}
            onChange={(e) => setAircraftFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="">Todos os aviões</option>
            {aircraftOptions.map((reg) => (
              <option key={reg} value={reg}>{reg}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      {err && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
          {err}
        </p>
      )}

      {dataLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, gi) => (
            <div key={gi}>
              <Skeleton className="mb-3 h-3 w-28" />
              <ul className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
                    <div className="flex items-start gap-4">
                      <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                        <Skeleton className="h-6 w-8" />
                        <Skeleton className="h-2.5 w-6" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <Skeleton className="h-5 w-16 rounded" />
                          <Skeleton className="h-5 w-12 rounded" />
                        </div>
                        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-3">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <Skeleton key={j} className="h-3 w-full" />
                          ))}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 && !(sagaOnlySchedule && isStudentView && sagaUpcoming.length > 0) ? (
        <div className="space-y-6">
          {sagaOnlySchedule && isStudentView ? (
            <div className="space-y-2">
              <SectionTitle title="Voos futuros" tone="future" />
              <SagaUpcomingList flights={sagaUpcoming} loading={sagaUpcomingLoading} />
            </div>
          ) : null}
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-2xl">✈</div>
            <p className="text-sm font-medium text-slate-400">Nenhum voo encontrado com os filtros atuais.</p>
          </div>
        </div>
      ) : displayMode === "calendar" ? (
        <div className="space-y-4">
          <FlightsAgendaBoard
            items={[...filteredItems, ...sagaAgendaItems]}
            infoById={{ ...infoById, ...sagaAgendaInfoById }}
            onOpen={(id) => {
              if (openSagaAgendaFlight(id)) return;
              openFlight(id);
            }}
          />
          <FlightListPagingActions
            hasMore={Boolean(nextCursor)}
            loadingMore={loadingMore}
            loaded={items.length}
            total={totalFlights}
            onLoadMore={() => void loadMore()}
            onRefresh={() => void refresh()}
          />
        </div>
      ) : displayMode === "table" ? (
        <div className="space-y-6">
          {sagaOnlySchedule && isStudentView ? (
            <div className="space-y-2">
              <SectionTitle title="Voos futuros" tone="future" />
              <SagaUpcomingList
                flights={sagaUpcoming}
                variant="list"
                loading={sagaUpcomingLoading}
                onOpen={scheduleTabEnabled ? setSagaDetailFlight : undefined}
              />
            </div>
          ) : (
            <FlightTableSection
              title="Voos futuros"
              groups={futureGroups}
              infoById={infoById}
              emptyLabel="Nenhum voo futuro."
              onOpen={(id) => {
                openFlight(id);
              }}
              onPublicLink={(id) => void generatePublicLink(id)}
              publicLinkFlightId={publicLinkFlightId}
              onOpenVideo={openFlightVideo}
              onOpenTelemetry={openFlightTelemetry}
              onDelete={canManageFlights ? (id) => void handleDelete(id) : undefined}
              onReloadSaga={(flight) => void handleReloadSagaFlight(flight)}
              reloadingSagaFlightId={reloadingSagaFlightId}
              showStudentPending={isStudentView}
              hideStudentColumn={isStudentView}
              onStudentSuggestion={isStudentView ? openStudentSuggestionModal : undefined}
              onStudentWeightBalance={isStudentView ? openFutureWeightBalance : undefined}
            />
          )}
          <FlightTableSection
            title="Voos antigos"
            groups={pastGroups}
            infoById={infoById}
            hideStudentColumn={isStudentView}
            emptyLabel="Nenhum voo antigo."
            onOpen={openFlight}
            onShare={(id) => setShareFlightId(id)}
            onPublicLink={(id) => void generatePublicLink(id)}
            publicLinkFlightId={publicLinkFlightId}
            onExportFicha={(id) => void exportFicha(id)}
            exportingFichaId={exportingFichaId}
            onOpenVideo={openFlightVideo}
            onOpenTelemetry={openFlightTelemetry}
            onDelete={canManageFlights ? (id) => void handleDelete(id) : undefined}
            onReloadSaga={(flight) => void handleReloadSagaFlight(flight)}
            reloadingSagaFlightId={reloadingSagaFlightId}
            evaluationEnabled={isStudentView && flightEvaluationEnabled}
            evaluationsByFlightId={evaluationsByFlightId}
            onEvaluate={isStudentView && flightEvaluationEnabled ? openFlightEvaluationModal : undefined}
          />
          <FlightListPagingActions
            hasMore={Boolean(nextCursor)}
            loadingMore={loadingMore}
            loaded={items.length}
            total={totalFlights}
            onLoadMore={() => void loadMore()}
            onRefresh={() => void refresh()}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {isStudentView ? <SectionTitle title="Voos futuros" tone="future" /> : null}
          {sagaOnlySchedule && isStudentView ? (
            <SagaUpcomingList
              flights={sagaUpcoming}
              loading={sagaUpcomingLoading}
              onOpen={scheduleTabEnabled ? setSagaDetailFlight : undefined}
            />
          ) : null}
          {(isStudentView ? futureGroups : groups).map((group) => (
            <div key={group.label || "all"}>
              {group.label ? (
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{group.label}</p>
              ) : null}
              <ul className="space-y-2">
                {group.flights.map((f) => {
                  const info = infoById[f.id];
                  const d = getDateBase(f, info);
                  const day = d.getDate();
                  const mon = d.toLocaleString("pt-BR", { month: "short" }).replace(".", "");
                  const isPastFlight = !isScheduledFlightStatus(f, info);
                  if (isStudentView) {
                    const futureActions: FlightActionItem[] = [
                      {
                        label: info?.weightBalanceFilled ? "Ver peso e balanceamento" : "Preencher peso e balanceamento",
                        tone: "sky",
                        onSelect: () => openFutureWeightBalance(f.id),
                      },
                      ...(!info?.studentSuggestionMd
                        ? [{ label: "Enviar sugestao do aluno", tone: "sky" as const, onSelect: () => openStudentSuggestionModal(f.id) }]
                        : []),
                      {
                        label: publicLinkFlightId === f.id ? "Gerando link..." : "Gerar link publico",
                        tone: "sky",
                        disabled: publicLinkFlightId === f.id,
                        onSelect: () => void generatePublicLink(f.id),
                      },
                    ];
                    return (
                      <li
                        key={f.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openFlight(f.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openFlight(f.id);
                          }
                        }}
                        className="group relative cursor-pointer rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 transition hover:border-sky-500/50 hover:bg-slate-900/70 focus:outline-none focus-visible:border-sky-500/70"
                      >
                        <div className="absolute right-3 top-3 flex items-center gap-1">
                          <div className="relative">
                            <MoreActionsButton
                              open={cardMenuFlightId === f.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                setCardMenuFlightId((current) => (current === f.id ? null : f.id));
                              }}
                            />
                            {cardMenuFlightId === f.id ? (
                              <FlightActionsPopover actions={futureActions} onClose={() => setCardMenuFlightId(null)} />
                            ) : null}
                          </div>
                          <OpenFlightChevron />
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="flex w-8 shrink-0 flex-col items-center text-center">
                            <span className="text-lg font-bold leading-none text-slate-100">{day}</span>
                            <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{mon}</span>
                          </div>
                          <div className="min-w-0 flex-1 pr-20 sm:pr-24">
                            {!info ? (
                              <div className="grid grid-cols-2 gap-1.5">
                                {Array.from({ length: 4 }).map((_, j) => (
                                  <Skeleton key={j} className="h-3 w-full" />
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${getAircraftBadgeColorClass(info.aircraft ?? f.aircraft_ident ?? "")}`}>
                                  {info.aircraft ?? f.aircraft_ident ?? "—"}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {info.startTime || "—"}{info.endTime ? ` – ${info.endTime}` : ""}
                                </span>
                                <span className="text-xs text-slate-500">· {shortName(info.instructorName) || "—"}</span>
                              </div>
                            )}
                            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                              <div className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-950/25 p-2.5">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sugestão do INVA</p>
                                <p className="line-clamp-3 whitespace-pre-wrap break-words text-slate-300 [overflow-wrap:anywhere]">{info?.instructorSuggestionMd || "Sem sugestão registrada."}</p>
                              </div>
                              <div className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-950/25 p-2.5">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Peso e Balanceamento</p>
                                <FutureWeightBalanceCta
                                  ok={Boolean(info?.weightBalanceFilled)}
                                  onClick={() => openFutureWeightBalance(f.id)}
                                />
                              </div>
                              <div className="min-w-0 rounded-lg border border-slate-700/60 bg-slate-950/25 p-2.5">
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sugestão do aluno</p>
                                {info?.studentSuggestionMd ? (
                                  <FutureStudentSuggestionStatus suggestion={info.studentSuggestionMd} />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openStudentSuggestionModal(f.id);
                                    }}
                                    className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
                                  >
                                    Enviar sugestão
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={f.id}
                      className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 transition hover:border-slate-600"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex w-8 shrink-0 flex-col items-center text-center">
                          <span className="text-lg font-bold leading-none text-slate-100">{day}</span>
                          <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{mon}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${getAircraftBadgeColorClass(info?.aircraft ?? f.aircraft_ident ?? "")}`}>
                                {info?.aircraft ?? f.aircraft_ident ?? "—"}
                              </span>
                              <span className="text-xs text-slate-500">{info?.startTime || "—"}</span>
                              {info?.totalFlight ? <span className="text-xs text-slate-500">· {info.totalFlight}</span> : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <FlightStatusBadge status={f.flight_status} />
                              {isPastFlight ? (
                                <div className="flex items-center gap-1">
                                  <span className={`h-2 w-2 rounded-full ${info?.telemetryOk ? "bg-emerald-400" : "bg-slate-600"}`} title={info?.telemetryOk ? "Telemetria ok" : "Sem telemetria"} />
                                  <span className={`h-2 w-2 rounded-full ${info?.videoOk ? "bg-emerald-400" : "bg-slate-600"}`} title={info?.videoOk ? "Vídeo ok" : "Sem vídeo"} />
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {!info ? (
                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                              {Array.from({ length: 4 }).map((_, j) => (
                                <Skeleton key={j} className="h-3 w-full" />
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-500">
                              <p className="truncate">Aluno: <span className="text-slate-300">{shortName(info.studentName)}</span></p>
                              <p className="truncate">Instrutor: <span className="text-slate-300">{shortName(info.instructorName)}</span></p>
                              {info.fromTo ? <p className="col-span-2 truncate">Rota: <span className="text-slate-300">{info.fromTo}</span></p> : null}
                              {info.landings != null ? <p>Pousos: <span className="text-slate-300">{info.landings}</span></p> : null}
                              {info.totalFlight ? <p>Duração: <span className="text-slate-300">{info.totalFlight}</span></p> : null}
                              {info.instructorAnac ? <p className="truncate">ANAC INVA: <span className="text-slate-300">{info.instructorAnac}</span></p> : null}
                            </div>
                          )}
                        </div>
                      </div>
                      {(isPastFlight || canManageFlights) && (
                        <div className="mt-3 border-t border-slate-800/50 pt-2.5">
                          {isPastFlight ? (
                            <div className="mb-2 flex flex-wrap items-center gap-1.5">
                              <FlightSignatureBadges sigs={signaturesByFlightId[f.id]} />
                              {user?.role === "instrutor" && f.instructor_user_id === user.id && !signaturesByFlightId[f.id]?.instructor ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSigningFlightId(f.id);
                                    setSigningRole("instructor");
                                    setSigningPassword("");
                                    setSigningError(null);
                                  }}
                                  className="rounded bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-violet-500"
                                >
                                  Assinar como INVA
                                </button>
                              ) : null}
                              {f.instructor_signed ? (
                                <span className="text-[10px] font-semibold text-amber-400">● Ficha bloqueada</span>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            {isPastFlight ? (
                              <>
                                <ShareFlightButton
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShareFlightId(f.id);
                                  }}
                                  iconOnly
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFlight(f.id);
                                  }}
                                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                                >
                                  Detalhes
                                </button>
                                {f.saga_flight_id ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleReloadSagaFlight(f);
                                    }}
                                    disabled={reloadingSagaFlightId === f.id}
                                    className="rounded-lg border border-amber-600/40 bg-amber-900/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/20 disabled:opacity-60"
                                  >
                                    {reloadingSagaFlightId === f.id ? "Recarregando..." : "Recarregar SAGA"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void exportFicha(f.id);
                                  }}
                                  disabled={exportingFichaId === f.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600/40 bg-sky-600/10 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-600/20"
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v7.19L6.53 7.22a.75.75 0 00-1.06 1.06l4 4a.75.75 0 001.06 0l4-4a.75.75 0 10-1.06-1.06l-2.72 2.72V2.75z" />
                                    <path d="M4.25 14.5a.75.75 0 000 1.5h11.5a.75.75 0 000-1.5H4.25z" />
                                  </svg>
                                  {exportingFichaId === f.id ? "Gerando..." : "Ficha"}
                                </button>
                              </>
                            ) : null}
                            {!isPastFlight ? (
                              <button
                                type="button"
                                onClick={() => openFlight(f.id)}
                                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                              >
                                Detalhes
                              </button>
                            ) : null}
                            {canManageFlights ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDelete(f.id);
                                }}
                                disabled={Boolean(f.instructor_signed && !f.saga_flight_id)}
                                className="ml-auto text-xs text-red-400/80 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Apagar
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {isStudentView ? (
            <section className="space-y-4">
              <div className="border-t border-slate-700/60 pt-4">
                <SectionTitle title="Voos antigos" tone="past" />
              </div>
              {pastGroups.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum voo antigo.</p>
              ) : (
                pastGroups.map((group) => (
                  <div key={`past-${group.label || "all"}`}>
                    {group.label ? <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{group.label}</p> : null}
                    <ul className="space-y-2">
                      {group.flights.map((f) => {
                        const info = infoById[f.id];
                        const d = getDateBase(f, info);
                        const day = d.getDate();
                        const mon = d.toLocaleString("pt-BR", { month: "short" }).replace(".", "");
                        const pastAircraft = info?.aircraft ?? f.aircraft_ident ?? "";
                        const pastStartTime = info?.startTime || null;
                        const pastTotal = info?.totalFlight || null;
                        return (
                          <li
                            key={f.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openFlight(f.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openFlight(f.id);
                              }
                            }}
                            className="group cursor-pointer rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 transition hover:border-sky-500/50 hover:bg-slate-900/70 focus:outline-none focus-visible:border-sky-500/70"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex w-8 shrink-0 flex-col items-center text-center">
                                <span className="text-lg font-bold leading-none text-slate-100">{day}</span>
                                <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-500">{mon}</span>
                              </div>
                              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${getAircraftBadgeColorClass(pastAircraft)}`}>
                                    {pastAircraft || "—"}
                                  </span>
                                  {pastStartTime ? <span className="text-xs text-slate-500">{pastStartTime}</span> : null}
                                  {isStudentView && flightEvaluationEnabled && isFlightEvaluationEligible(f, info) ? (
                                    evaluationsByFlightId[f.id] ? (
                                      <FlightEvaluationDoneBadge
                                        average={evaluationsByFlightId[f.id]?.average}
                                        onClick={() => openFlightEvaluationModal(f.id)}
                                      />
                                    ) : (
                                      <FlightEvaluationPendingBadge onClick={() => openFlightEvaluationModal(f.id)} />
                                    )
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                <div className="relative">
                                  <button
                                    type="button"
                                    aria-label="Mais ações"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCardMenuFlightId((cur) => (cur === f.id ? null : f.id));
                                    }}
                                    className="rounded-lg border border-slate-700/60 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                  >
                                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                      <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                                    </svg>
                                  </button>
                                  {cardMenuFlightId === f.id ? (
                                    <>
                                      <div
                                        className="fixed inset-0 z-30"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCardMenuFlightId(null);
                                        }}
                                      />
                                      <div className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
                                        {!signaturesByFlightId[f.id]?.student ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCardMenuFlightId(null);
                                              setSigningFlightId(f.id);
                                              setSigningRole("student");
                                              setSigningPassword("");
                                              setSigningError(null);
                                            }}
                                            className="block w-full px-3 py-2 text-left text-xs font-semibold text-emerald-400 hover:bg-slate-800"
                                          >
                                            Assinar como aluno
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setCardMenuFlightId(null);
                                            setShareFlightId(f.id);
                                          }}
                                          className="block w-full px-3 py-2 text-left text-xs font-semibold text-sky-400 hover:bg-slate-800"
                                        >
                                          Compartilhar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setCardMenuFlightId(null);
                                            void generatePublicLink(f.id);
                                          }}
                                          disabled={publicLinkFlightId === f.id}
                                          className="block w-full px-3 py-2 text-left text-xs font-semibold text-sky-400 hover:bg-slate-800 disabled:opacity-60"
                                        >
                                          {publicLinkFlightId === f.id ? "Gerando link..." : "Gerar link publico"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setCardMenuFlightId(null);
                                            void exportFicha(f.id);
                                          }}
                                          disabled={exportingFichaId === f.id}
                                          className="block w-full px-3 py-2 text-left text-xs font-semibold text-sky-400 hover:bg-slate-800 disabled:opacity-60"
                                        >
                                          {exportingFichaId === f.id ? "Gerando ficha..." : "Baixar ficha"}
                                        </button>
                                        {f.saga_flight_id ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCardMenuFlightId(null);
                                              void handleReloadSagaFlight(f);
                                            }}
                                            disabled={reloadingSagaFlightId === f.id}
                                            className="block w-full px-3 py-2 text-left text-xs font-semibold text-amber-300 hover:bg-slate-800 disabled:opacity-60"
                                          >
                                            {reloadingSagaFlightId === f.id ? "Recarregando..." : "Recarregar SAGA"}
                                          </button>
                                        ) : null}
                                      </div>
                                    </>
                                  ) : null}
                                </div>
                                <OpenFlightChevron />
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-500">
                              {info?.fromTo ? <p className="col-span-2 truncate">Rota: <span className="text-slate-300">{info.fromTo}</span></p> : null}
                              <p className="col-span-2 truncate">Missão: <span className="text-slate-300">{missionLabel(info)}</span></p>
                              {info?.landings != null ? <p>Pousos: <span className="text-slate-300">{info.landings}</span></p> : null}
                              {pastTotal ? <p>Duração: <span className="text-slate-300">{pastTotal}</span></p> : null}
                              {info?.instructorName ? <p className="col-span-2 truncate">Instrutor: <span className="text-slate-300">{shortName(info.instructorName, info.instructorName)}</span></p> : null}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800/50 pt-2.5 text-xs">
                              {info?.videoOk ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openFlightVideo(f.id);
                                  }}
                                  className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-semibold text-sky-300 hover:bg-sky-500/20"
                                >
                                  Ver video
                                </button>
                              ) : (
                                <span className="rounded-full border border-slate-700/60 px-2 py-1 text-slate-500">Video -</span>
                              )}
                              {info?.telemetryOk ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openFlightTelemetry(f.id);
                                  }}
                                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-300 hover:bg-emerald-500/20"
                                >
                                  Ver telemetria
                                </button>
                              ) : (
                                <span className="rounded-full border border-slate-700/60 px-2 py-1 text-slate-500">Telemetria -</span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </section>
          ) : null}
          <FlightListPagingActions
            hasMore={Boolean(nextCursor)}
            loadingMore={loadingMore}
            loaded={items.length}
            total={totalFlights}
            onLoadMore={() => void loadMore()}
            onRefresh={() => void refresh()}
          />
        </div>
      )}
      {syncOverlayVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <svg className="h-5 w-5 shrink-0 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <h3 className="text-base font-semibold text-slate-100">Sincronizando com SAGA</h3>
            </div>
            <p className="mb-4 text-sm text-slate-300">
              {syncProgress?.message || "Conectando ao SAGA..."}
            </p>
            {syncProgress && syncProgress.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{syncProgress.stage === "import" ? `${syncProgress.current} de ${syncProgress.total} voos` : syncProgress.stage}</span>
                  <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-1.5 rounded-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {signingFlightId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">Confirmar assinatura eletrônica</h3>
            <p className="mt-2 text-sm text-slate-400">
              {signingRole === "instructor"
                ? "Ao assinar como instrutor, a ficha do voo ficará bloqueada para edição."
                : "Ao assinar, você atesta que as informações deste voo estão corretas."}
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">Senha</span>
              <input
                type="password"
                autoComplete="current-password"
                value={signingPassword}
                onChange={(event) => setSigningPassword(event.target.value)}
                disabled={signingInProgress}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-60"
                placeholder="Confirme sua senha"
              />
            </label>
            {signingError && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                {signingError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSigningFlightId(null);
                  setSigningRole(null);
                  setSigningPassword("");
                  setSigningError(null);
                }}
                disabled={signingInProgress || !signingPassword}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSign()}
                disabled={signingInProgress}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition ${signingRole === "instructor" ? "bg-violet-600 hover:bg-violet-500" : "bg-emerald-600 hover:bg-emerald-500"}`}
              >
                {signingInProgress ? "Assinando..." : "Confirmar assinatura"}
              </button>
            </div>
          </div>
        </div>
      )}
      {shareFlightId ? (
        <FlightShareStickersModal flightId={shareFlightId} onClose={() => setShareFlightId(null)} />
      ) : null}
      {evaluationFlight && user ? (
        <FlightEvaluationModal
          open={Boolean(evaluationFlightId)}
          flight={evaluationFlight}
          info={evaluationInfo}
          rules={flightEvaluationRules}
          studentUserId={user.id}
          existing={evaluationsByFlightId[evaluationFlight.id] ?? null}
          onClose={() => setEvaluationFlightId(null)}
          onSubmitted={(evaluation) => {
            setEvaluationsByFlightId((prev) => ({ ...prev, [evaluation.flightId]: evaluation }));
          }}
        />
      ) : null}
      {/* Modal da Escala reaproveitado para voos futuros do SAGA */}
      {sagaDetailFlight && !sagaCancelFlight && (
        <FlightDetailModal
          flight={sagaDetailFlight}
          onClose={() => setSagaDetailFlight(null)}
          onCancel={() => setSagaCancelFlight(sagaDetailFlight)}
          editConfig={
            scheduleRules && scheduleRules.mode === "booking" && sagaDetailFlight.canCancel
              ? {
                  aircrafts: sagaAircrafts,
                  rules: scheduleRules,
                  onSubmit: async (changes) => {
                    await rescheduleScheduleFlight({ flightId: sagaDetailFlight.id, ...changes });
                    showToast({ variant: "success", message: "Voo alterado." });
                    setSagaDetailFlight(null);
                    setRefreshKey((k) => k + 1);
                  },
                }
              : undefined
          }
        />
      )}
      {sagaCancelFlight && scheduleRules && (
        <CancellationModal
          flight={sagaCancelFlight}
          rules={scheduleRules}
          onClose={() => setSagaCancelFlight(null)}
          onConfirm={(reason) => executeSagaCancel(sagaCancelFlight, reason)}
        />
      )}
      {studentSuggestionFlightId && studentSuggestionFlight && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-6 sm:items-center">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Voo futuro</p>
                <h3 className="text-lg font-semibold text-slate-100">Sugestão do aluno</h3>
              </div>
              <button
                type="button"
                onClick={closeStudentSuggestionModal}
                className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>

            <div className="mb-4 grid gap-x-4 gap-y-1 rounded-xl border border-slate-700/60 bg-slate-950/25 p-3 text-xs text-slate-400 sm:grid-cols-2 [&>p]:min-w-0 [&_span]:break-words [&_span]:[overflow-wrap:anywhere]">
              <p>Data: <span className="text-slate-300">{studentSuggestionInfo?.flightDateIso ? new Date(`${studentSuggestionInfo.flightDateIso}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</span></p>
              <p>Matrícula: <span className="text-slate-300">{studentSuggestionInfo?.aircraft ?? studentSuggestionFlight.aircraft_ident ?? "—"}</span></p>
              <p>Início: <span className="text-slate-300">{studentSuggestionInfo?.startTime || "—"}</span></p>
              <p>Fim: <span className="text-slate-300">{studentSuggestionInfo?.endTime || "—"}</span></p>
              <p className="sm:col-span-2">Instrutor: <span className="text-slate-300">{shortName(studentSuggestionInfo?.instructorName) || "—"}</span></p>
            </div>

            <div className="mb-4 rounded-xl border border-slate-700/60 bg-slate-950/25 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Sugestão do INVA</p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-300 [overflow-wrap:anywhere]">
                {studentSuggestionInfo?.instructorSuggestionMd || "Sem sugestão registrada."}
              </p>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                Sugestão do Aluno
              </span>
              <textarea
                value={studentSuggestionDraft}
                onChange={(e) => setStudentSuggestionDraft(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                placeholder="Escreva sua sugestão para este voo..."
              />
            </label>

            {studentSuggestionError && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                {studentSuggestionError}
              </p>
            )}

            <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
              <button
                type="button"
                onClick={closeStudentSuggestionModal}
                disabled={studentSuggestionSaving}
                className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveStudentSuggestion()}
                disabled={studentSuggestionSaving}
                className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60 sm:w-auto"
              >
                {studentSuggestionSaving ? "Salvando..." : "Salvar sugestão"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type SignatureBadgeDoc = NonNullable<FlightSignaturesForFlight[keyof FlightSignaturesForFlight]>;

function FlightSignBadge({
  label,
  signed,
  signature,
}: {
  label: string;
  signed: boolean;
  signature?: SignatureBadgeDoc | null;
}) {
  const dateStr = signature?.signed_at ? new Date(signature.signed_at).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;
  const details = signature
    ? [
        `Signatário: ${signature.signer_user_id}`,
        `Papel: ${signature.signer_role}`,
        `Horário UTC: ${signature.signed_at}`,
        `Payload: ${signature.payload_version ?? "-"}`,
        `Hash: ${signature.content_hash ?? "-"}`,
      ].join("\n")
    : undefined;
  return (
    <span
      title={details}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        signed ? "bg-emerald-900/40 text-emerald-400" : "bg-slate-800 text-slate-500"
      }`}
    >
      {signed ? "✓ " : "– "}
      {label}
      {signed && dateStr ? ` ${dateStr}` : ""}
    </span>
  );
}

function FlightSignatureBadges({ sigs, compact = false }: { sigs: FlightSignaturesForFlight | undefined; compact?: boolean }) {
  if (!sigs) {
    return <span className="text-[10px] text-slate-500">Carregando...</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        <FlightSignBadge label="Aluno" signed={Boolean(sigs.student)} signature={sigs.student} />
        <FlightSignBadge label="Instrutor" signed={Boolean(sigs.instructor)} signature={sigs.instructor} />
        <FlightSignBadge label="Operador" signed={Boolean(sigs.admin_operator)} signature={sigs.admin_operator} />
      </div>
      {compact ? null : ([sigs.student, sigs.instructor, sigs.admin_operator].filter(Boolean) as SignatureBadgeDoc[]).map((sig) => (
        <p key={sig.id} className="max-w-[18rem] truncate text-[10px] text-slate-500">
          {sig.signer_role}: {sig.payload_version ?? "-"} · {sig.signed_at} UTC · {sig.content_hash ?? "-"}
        </p>
      ))}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function SummaryCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-5 w-20" />
    </div>
  );
}

function FlightListPagingActions({
  hasMore,
  loadingMore,
  loaded,
  total,
  onLoadMore,
  onRefresh,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  loaded: number;
  total: number;
  onLoadMore: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {total > 0 ? (
        <span className="text-xs text-slate-600">
          {Math.min(loaded, total)} de {total} voos carregados
        </span>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
        >
          {loadingMore ? "Carregando..." : "Carregar mais"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRefresh}
        className="text-xs text-slate-500 underline-offset-4 hover:underline"
      >
        Atualizar lista
      </button>
    </div>
  );
}

function FlightTableSection({
  title,
  groups,
  infoById,
  emptyLabel,
  onOpen,
  onShare,
  onPublicLink,
  publicLinkFlightId,
  onExportFicha,
  exportingFichaId,
  onOpenVideo,
  onOpenTelemetry,
  onDelete,
  onReloadSaga,
  reloadingSagaFlightId,
  onStudentSuggestion,
  onStudentWeightBalance,
  showStudentPending = false,
  hideStudentColumn = false,
  evaluationEnabled = false,
  evaluationsByFlightId = {},
  onEvaluate,
}: {
  title: string;
  groups: { label: string; flights: SavedFlightListItem[] }[];
  infoById: Record<string, FlightCardInfo>;
  emptyLabel: string;
  onOpen: (id: string) => void;
  onShare?: (id: string) => void;
  onPublicLink?: (id: string) => void;
  publicLinkFlightId?: string | null;
  onExportFicha?: (id: string) => void;
  exportingFichaId?: string | null;
  onOpenVideo?: (id: string) => void;
  onOpenTelemetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReloadSaga?: (flight: SavedFlightListItem) => void;
  reloadingSagaFlightId?: string | null;
  onStudentSuggestion?: (id: string) => void;
  onStudentWeightBalance?: (id: string) => void;
  showStudentPending?: boolean;
  /** Visão do aluno: a coluna "Aluno" é redundante. */
  hideStudentColumn?: boolean;
  evaluationEnabled?: boolean;
  evaluationsByFlightId?: Record<string, FlightEvaluation>;
  onEvaluate?: (id: string) => void;
}) {
  const [openActionFlightId, setOpenActionFlightId] = useState<string | null>(null);
  const tableMinWidth = showStudentPending ? "min-w-[1060px]" : "min-w-[1120px]";
  const hasReloadableFlights = groups.some((group) => group.flights.some((flight) => Boolean(flight.saga_flight_id)));
  const showActionColumn = Boolean(onShare || onPublicLink || onExportFicha || onDelete || (onReloadSaga && hasReloadableFlights));
  const renderMediaLink = (available: boolean | undefined, label: string, onClick?: () => void) => {
    if (!available || !onClick) return <span className="text-slate-600">-</span>;
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className="text-xs font-semibold text-sky-300 underline-offset-4 hover:underline"
      >
        {label}
      </button>
    );
  };
  return (
    <section className="space-y-3">
      <SectionTitle title={title} tone={title.toLowerCase().includes("futuro") ? "future" : title.toLowerCase().includes("antigo") ? "past" : "default"} />
      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        groups.map((group) => (
          <div key={`${title}-${group.label}`} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/30">
            {group.label ? <div className="border-b border-slate-700/60 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              {group.label}
            </div> : null}
            <div className="overflow-x-auto">
              <table className={`${tableMinWidth} w-full text-left text-xs`}>
                <thead className="bg-slate-950/40 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Início</th>
                    {!hideStudentColumn ? <th className="px-3 py-2 font-semibold">Aluno</th> : null}
                    <th className="px-3 py-2 font-semibold">Instrutor</th>
                    <th className="px-3 py-2 font-semibold">Matrícula</th>
                    <th className="px-3 py-2 font-semibold">Missão</th>
                    {showStudentPending ? <th className="px-3 py-2 font-semibold">Fim</th> : null}
                    {!showStudentPending ? <th className="px-3 py-2 font-semibold">Rota</th> : null}
                    {!showStudentPending ? <th className="px-3 py-2 font-semibold">Duração</th> : null}
                    {!showStudentPending ? <th className="px-3 py-2 font-semibold">Pousos</th> : null}
                    {showStudentPending ? <th className="px-3 py-2 font-semibold">Sugestão INVA</th> : null}
                    {showStudentPending ? <th className="px-3 py-2 font-semibold">Peso e Balanceamento</th> : null}
                    {showStudentPending ? <th className="px-3 py-2 font-semibold">Sugestão aluno</th> : null}
                    <th className="px-3 py-2 font-semibold">Video</th>
                    <th className="px-3 py-2 font-semibold">Telemetria</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    {evaluationEnabled ? <th className="px-3 py-2 font-semibold">Avaliação</th> : null}
                    {showActionColumn ? <th className="px-3 py-2 font-semibold">Acoes</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {group.flights.map((item) => {
                    const info = infoById[item.id];
                    const d = getDateBase(item, info);
                    const dateLabel = info?.flightDateIso
                      ? new Date(`${info.flightDateIso}T12:00:00`).toLocaleDateString("pt-BR")
                      : d.toLocaleDateString("pt-BR");
                    const rowHasActions = Boolean(onShare || onPublicLink || onExportFicha || onDelete || (item.saga_flight_id && onReloadSaga));
                    const rowActions: FlightActionItem[] = [
                      ...(onShare ? [{ label: "Compartilhar", tone: "sky" as const, onSelect: () => onShare(item.id) }] : []),
                      ...(onPublicLink ? [{ label: publicLinkFlightId === item.id ? "Gerando link..." : "Gerar link publico", tone: "sky" as const, disabled: publicLinkFlightId === item.id, onSelect: () => onPublicLink(item.id) }] : []),
                      ...(onExportFicha ? [{ label: exportingFichaId === item.id ? "Gerando ficha..." : "Baixar ficha", tone: "sky" as const, disabled: exportingFichaId === item.id, onSelect: () => onExportFicha(item.id) }] : []),
                      ...(item.saga_flight_id && onReloadSaga ? [{ label: reloadingSagaFlightId === item.id ? "Recarregando SAGA..." : "Recarregar SAGA", tone: "amber" as const, disabled: reloadingSagaFlightId === item.id, onSelect: () => onReloadSaga(item) }] : []),
                      ...(onDelete ? [{ label: "Apagar voo", tone: "red" as const, onSelect: () => onDelete(item.id) }] : []),
                    ];
                    return (
                      <tr
                        key={item.id}
                        tabIndex={0}
                        onClick={() => onOpen(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onOpen(item.id);
                          }
                        }}
                        className="group cursor-pointer text-slate-300 transition odd:bg-slate-950/10 hover:bg-slate-800/30 focus:outline-none focus-visible:bg-slate-800/40"
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-200">
                          <span className="inline-flex items-center gap-2 text-slate-100">
                            {dateLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{info?.startTime || "—"}</td>
                        {!hideStudentColumn ? <td className="px-3 py-2">{shortName(info?.studentName)}</td> : null}
                        <td className="px-3 py-2">{shortName(info?.instructorName) || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded border px-1.5 py-0.5 ${getAircraftBadgeColorClass(info?.aircraft ?? item.aircraft_ident ?? "")}`}>
                            {info?.aircraft ?? item.aircraft_ident ?? "—"}
                          </span>
                        </td>
                        <td className="max-w-56 px-3 py-2">
                          <span className="line-clamp-2 break-words text-slate-300">{missionLabel(info)}</span>
                        </td>
                        {showStudentPending ? <td className="px-3 py-2">{info?.endTime || "—"}</td> : null}
                        {!showStudentPending ? <td className="px-3 py-2">{info?.fromTo ?? "—"}</td> : null}
                        {!showStudentPending ? <td className="px-3 py-2">{formatDecimalHours(info?.totalFlightMinutes)}</td> : null}
                        {!showStudentPending ? <td className="px-3 py-2">{info?.landings ?? 0}</td> : null}
                        {showStudentPending ? (
                          <td className="max-w-64 px-3 py-2">
                            <span className="line-clamp-2 text-slate-300">
                              {info?.instructorSuggestionMd || "Sem sugestão registrada."}
                            </span>
                          </td>
                        ) : null}
                        {showStudentPending ? (
                          <td className="px-3 py-2">
                            <FutureWeightBalanceCta
                              ok={Boolean(info?.weightBalanceFilled)}
                              onClick={() => onStudentWeightBalance?.(item.id)}
                            />
                          </td>
                        ) : null}
                        {showStudentPending ? (
                          <td className="px-3 py-2">
                            {info?.studentSuggestionMd ? (
                              <FutureStudentSuggestionStatus suggestion={info.studentSuggestionMd} />
                            ) : (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onStudentSuggestion?.(item.id);
                                }}
                                className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-500"
                              >
                                Enviar sugestão
                              </button>
                            )}
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap px-3 py-2">
                          {renderMediaLink(info?.videoOk, "Ver video", onOpenVideo ? () => onOpenVideo(item.id) : undefined)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {renderMediaLink(info?.telemetryOk, "Ver telemetria", onOpenTelemetry ? () => onOpenTelemetry(item.id) : undefined)}
                        </td>
                        <td className="px-3 py-2">
                          <FlightStatusBadge status={item.flight_status} />
                        </td>
                        {evaluationEnabled ? (
                          <td className="px-3 py-2">
                            {isFlightEvaluationEligible(item, info) ? (
                              evaluationsByFlightId[item.id] ? (
                                <FlightEvaluationDoneBadge
                                  average={evaluationsByFlightId[item.id]?.average}
                                  onClick={onEvaluate ? () => onEvaluate(item.id) : undefined}
                                />
                              ) : (
                                <FlightEvaluationPendingBadge onClick={() => onEvaluate?.(item.id)} />
                              )
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        ) : null}
                        {showActionColumn ? (
                          <td className="px-3 py-2">
                            {rowHasActions ? (
                              <div className="flex items-center gap-1">
                                <div className="relative inline-flex">
                                  <MoreActionsButton
                                    open={openActionFlightId === item.id}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenActionFlightId((current) => (current === item.id ? null : item.id));
                                    }}
                                  />
                                  {openActionFlightId === item.id ? (
                                    <FlightActionsPopover actions={rowActions} onClose={() => setOpenActionFlightId(null)} />
                                  ) : null}
                                </div>
                                <OpenFlightChevron />
                              </div>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
