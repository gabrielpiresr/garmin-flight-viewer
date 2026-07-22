import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  createGhostFlight,
  deleteGhostFlight,
  finalizeGhostFlightMerge,
  listAdminFlightReports,
  listGhostMergeCandidates,
  searchFlightPickerUsers,
  updateGhostFlight,
} from "../../lib/adminUsersDb";
import { DEFAULT_SCHOOL_ID } from "../../lib/appwrite";
import { listAircrafts } from "../../lib/aircraftDb";
import { decodeFlightRecord, type FlightRecordMeta } from "../../lib/flightRecordCodec";
import { getSavedFlight } from "../../lib/flightsDb";
import { localTimeToUtcHhMm } from "../../lib/flightLogbookTimes";
import { listFlightVideoFlags } from "../../lib/flightVideosDb";
import { importAllInstructorFlightsFromSaga, type SagaImportProgress } from "../../lib/sagaImportDb";
import type { Aircraft } from "../../types/admin";
import type { AdminFlightReportRow } from "../../types/adminFlightReports";
import type { AdminUserSummary } from "../../types/adminUsers";
import { FlightDetailView } from "../FlightDetailView";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";
import {
  AdminReportFilterBar,
  periodForPreset,
  type AdminReportFilterState,
  type MultiFilterKey,
} from "./AdminReportFilterBar";
import { TelemetryBulkImportPanel } from "./TelemetryBulkImportPanel";

type GhostMode = "exclude" | "include" | "only";
type CompletionMode = "pending" | "include-complete" | "only-complete";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function fmtNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
    : "â€”";
}

function parseDurationToMinutes(value: string | null | undefined): number {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const decimal = Number(raw.replace(",", "."));
  return Number.isFinite(decimal) && decimal > 0 ? Math.round(decimal * 60) : 0;
}

function fmtMinutes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "â€”";
  const minutes = Math.round(value);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h${String(rest).padStart(2, "0")}` : `${rest} min`;
}

function firstNonEmpty(values: Array<string | null | undefined>): string {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) ?? "";
}

function summaryFromMeta(row: AdminFlightReportRow, meta: FlightRecordMeta | null) {
  const legs = meta?.legs ?? [];
  const landings = legs.length
    ? legs.reduce((acc, leg) => acc + Math.max(0, Math.round(leg.landings || 0)), 0)
    : row.landings;
  const flightMinutesFromLegs = legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0);
  const fallbackFlightMinutes = row.hours > 0
    ? Math.round(row.hours * 60)
    : typeof row.durationSec === "number" && row.durationSec > 0
      ? Math.round(row.durationSec / 60)
      : null;
  const flightMinutes = flightMinutesFromLegs > 0 ? flightMinutesFromLegs : fallbackFlightMinutes;
  const engineStartLocal = firstNonEmpty([
    ...legs.map((leg) => leg.engineStart),
    meta?.header.departureTimeUtc,
    meta?.header.startTime,
    row.startTime,
  ]);
  const engineCutLocal = firstNonEmpty([
    ...[...legs].reverse().map((leg) => leg.engineCut),
    meta?.header.engineCutoffTimeUtc,
  ]);
  const flightDate = meta?.header.date || row.flightDate || "";
  const toZulu = (local: string) => local ? localTimeToUtcHhMm(flightDate, local) : "â€”";

  return {
    landings,
    flightMinutes,
    engineStartLocal: engineStartLocal || "â€”",
    engineStartZulu: toZulu(engineStartLocal),
    engineCutLocal: engineCutLocal || "â€”",
    engineCutZulu: toZulu(engineCutLocal),
  };
}

function hasTelemetry(row: AdminFlightReportRow): boolean {
  const summaryPresent = row.telemetry?.telemetryPresent === true;
  const docPresent = row.telemetryPresentOnDoc === true;
  return summaryPresent || docPresent;
}

function needsFlightReviewAttention(row: AdminFlightReportRow, videoOk: boolean): boolean {
  return !hasTelemetry(row) || !videoOk;
}

function resolveInitialSubTab(telemetryOk: boolean, videoOk: boolean): "telemetria" | "videos" | "flight-review" {
  if (!telemetryOk) return "telemetria";
  if (!videoOk) return "videos";
  return "flight-review";
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-xs font-semibold ${ok ? "text-emerald-400" : "text-red-400"}`}>
      {label}
    </span>
  );
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-[140px] rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-100">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function FlightReviewFlightModal({
  row,
  telemetryOk,
  videoOk,
  onClose,
  onSaved,
}: {
  row: AdminFlightReportRow;
  telemetryOk: boolean;
  videoOk: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialSubTab = resolveInitialSubTab(telemetryOk, videoOk);
  const [flightMeta, setFlightMeta] = useState<FlightRecordMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const summary = useMemo(() => summaryFromMeta(row, flightMeta), [flightMeta, row]);

  useEffect(() => {
    let cancelled = false;
    setMetaLoading(true);
    void getSavedFlight(row.id)
      .then(({ data }) => {
        if (!cancelled) setFlightMeta(data ? decodeFlightRecord(data.csv_text).meta : null);
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100">Completar Flight Review</h3>
            <p className="mt-1 text-xs text-slate-500">
              {fmtDate(row.flightDate)} {row.startTime || "—"} · {row.studentName} · {row.instructorName || "Sem INVA"} ·{" "}
              {row.aircraftIdent ?? "—"} · {row.route || "—"}
            </p>
            </div>
            <div className="flex gap-2">
            <button
              type="button"
              onClick={onSaved}
              className="rounded-lg border border-emerald-600/50 px-3 py-1.5 text-sm text-emerald-300 transition hover:bg-emerald-500/10"
            >
              Atualizar lista
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Fechar
            </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryMetric label="Pousos" value={metaLoading ? "..." : fmtNumber(summary.landings)} detail="Importado da ficha" />
            <SummaryMetric label="Tempo de voo" value={metaLoading ? "..." : fmtMinutes(summary.flightMinutes)} detail="Soma das pernas" />
            <SummaryMetric
              label="Acionamento local"
              value={metaLoading ? "..." : summary.engineStartLocal}
              detail={`Zulu ${metaLoading ? "..." : summary.engineStartZulu}`}
            />
            <SummaryMetric
              label="Corte local"
              value={metaLoading ? "..." : summary.engineCutLocal}
              detail={`Zulu ${metaLoading ? "..." : summary.engineCutZulu}`}
            />
            <div className="min-w-[140px] rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pendências</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge ok={telemetryOk} label="Telemetria" />
                <StatusBadge ok={videoOk} label="Vídeo" />
              </div>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <FlightDetailView
            flightId={row.id}
            onBack={onClose}
            backLabel="Fechar"
            showStudentTab={false}
            initialSubTab={initialSubTab}
            allowedSubTabs={["ficha", "telemetria", "flight-review", "videos", "fotos"]}
          />
        </div>
      </div>
    </div>
  );
}

function adminUserLabel(user: AdminUserSummary): string {
  return user.profile.fullName || user.name || user.email || user.userId;
}

function GhostUserPicker({
  label,
  value,
  selectedLabel,
  query,
  options,
  loading,
  placeholder,
  onQueryChange,
  onSelect,
}: {
  label: string;
  value: string;
  selectedLabel: string;
  query: string;
  options: AdminUserSummary[];
  loading: boolean;
  placeholder: string;
  onQueryChange: (value: string) => void;
  onSelect: (user: AdminUserSummary) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label} *
      <div className="relative mt-1">
        <input
          type="search"
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case text-slate-100 outline-none focus:border-sky-500"
        />
        <p className={`mt-1 text-[11px] normal-case ${value ? "text-emerald-400" : "text-slate-600"}`}>
          {value ? `Selecionado: ${selectedLabel}` : "Digite pelo menos 2 letras para buscar por nome, e-mail ou ANAC."}
        </p>
        {open ? (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 py-1 shadow-xl">
            {loading ? (
              <div className="px-3 py-2 text-xs normal-case text-slate-500">Buscando...</div>
            ) : options.length ? (
              options.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelect(user);
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm normal-case text-slate-200 hover:bg-slate-800"
                >
                  <span className="block font-medium">{adminUserLabel(user)}</span>
                  {user.email ? <span className="block text-xs text-slate-500">{user.email}</span> : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs normal-case text-slate-500">Nenhum usuario encontrado.</div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function GhostFlightCreateModal({
  flight,
  onClose,
  onSaved,
}: {
  flight?: AdminFlightReportRow | null;
  onClose: () => void;
  onSaved: (flight: AdminFlightReportRow) => void;
}) {
  const { showToast } = useToast();
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [students, setStudents] = useState<AdminUserSummary[]>([]);
  const [instructors, setInstructors] = useState<AdminUserSummary[]>([]);
  const [aircraftLoading, setAircraftLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [instructorsLoading, setInstructorsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState(flight?.studentName || "");
  const [instructorSearch, setInstructorSearch] = useState(flight?.instructorName || "");
  const [studentLabel, setStudentLabel] = useState(flight?.studentName || "");
  const [instructorLabel, setInstructorLabel] = useState(flight?.instructorName || "");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    flightDate: flight?.flightDate || new Date().toISOString().slice(0, 10),
    startTime: flight?.startTime || "",
    aircraftIdent: flight?.aircraftIdent || "",
    instructorUserId: flight?.instructorUserId || "",
    studentUserId: flight?.studentUserId || "",
    observation: flight?.ghostObservation || "",
  });

  useEffect(() => {
    let cancelled = false;
    setAircraftLoading(true);
    void listAircrafts(DEFAULT_SCHOOL_ID)
      .then((aircraftRows) => {
        if (cancelled) return;
        const activeAircrafts = aircraftRows.filter((aircraft) => aircraft.type === "aviao" && aircraft.active);
        setAircrafts(activeAircrafts);
        setForm((current) => ({
          ...current,
          aircraftIdent: current.aircraftIdent || activeAircrafts[0]?.registration || "",
        }));
      })
      .catch((err) => {
        showToast({ variant: "error", message: err instanceof Error ? err.message : "Falha ao carregar aeronaves." });
      })
      .finally(() => {
        if (!cancelled) setAircraftLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    const search = studentSearch.trim();
    if (search.length < 2) {
      setStudents([]);
      setStudentsLoading(false);
      return () => {
        cancelled = true;
      };
    }
    const handle = window.setTimeout(() => {
      setStudentsLoading(true);
      void searchFlightPickerUsers({ role: "aluno", search, limit: 12 })
        .then((users) => {
          if (!cancelled) setStudents(users);
        })
        .catch((err) => {
          if (!cancelled) {
            setStudents([]);
            showToast({ variant: "error", message: err instanceof Error ? err.message : "Falha ao buscar alunos." });
          }
        })
        .finally(() => {
          if (!cancelled) setStudentsLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [studentSearch, showToast]);

  useEffect(() => {
    let cancelled = false;
    const search = instructorSearch.trim();
    if (search.length < 2) {
      setInstructors([]);
      setInstructorsLoading(false);
      return () => {
        cancelled = true;
      };
    }
    const handle = window.setTimeout(() => {
      setInstructorsLoading(true);
      void searchFlightPickerUsers({ role: "instrutor", search, limit: 12 })
        .then((users) => {
          if (!cancelled) setInstructors(users);
        })
        .catch((err) => {
          if (!cancelled) {
            setInstructors([]);
            showToast({ variant: "error", message: err instanceof Error ? err.message : "Falha ao buscar instrutores." });
          }
        })
        .finally(() => {
          if (!cancelled) setInstructorsLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [instructorSearch, showToast]);

  const submit = async () => {
    if (!form.flightDate || !form.aircraftIdent || !form.instructorUserId || !form.studentUserId) {
      showToast({ variant: "error", message: "Informe data, aeronave, instrutor e aluno." });
      return;
    }
    setSaving(true);
    try {
      const savedFlight = flight?.id
        ? await updateGhostFlight({ flightId: flight.id, ...form })
        : await createGhostFlight(form);
      showToast({ variant: "success", message: flight?.id ? "Voo temporário atualizado." : "Voo temporário criado." });
      onSaved(savedFlight);
    } catch (err) {
      showToast({ variant: "error", message: err instanceof Error ? err.message : "Falha ao salvar voo temporário." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{flight?.id ? "Editar temporário" : "Criar temporário"}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {flight?.id ? "Atualize os dados do voo temporário." : "Cria um voo temporário para receber telemetria e vídeo antes da ficha SAGA."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">Fechar</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Data *
            <input
              type="date"
              value={form.flightDate}
              onChange={(e) => setForm((current) => ({ ...current, flightDate: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hora
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((current) => ({ ...current, startTime: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aeronave *
            <select
              value={form.aircraftIdent}
              onChange={(e) => setForm((current) => ({ ...current, aircraftIdent: e.target.value }))}
              disabled={aircraftLoading}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 disabled:opacity-60"
            >
              {aircraftLoading ? <option value="">Carregando aeronaves...</option> : null}
              {!aircraftLoading && !aircrafts.length ? <option value="">Nenhuma aeronave ativa</option> : null}
              {aircrafts.map((aircraft) => (
                <option key={aircraft.id} value={aircraft.registration}>
                  {[aircraft.registration, aircraft.nickname].filter(Boolean).join(" - ")}
                </option>
              ))}
            </select>
          </label>
          <GhostUserPicker
            label="Instrutor"
            value={form.instructorUserId}
            selectedLabel={instructorLabel}
            query={instructorSearch}
            options={instructors}
            loading={instructorsLoading}
            placeholder="Buscar instrutor"
            onQueryChange={(value) => {
              setInstructorSearch(value);
              setInstructorLabel("");
              setForm((current) => ({ ...current, instructorUserId: "" }));
            }}
            onSelect={(user) => {
              const label = adminUserLabel(user);
              setInstructorSearch(label);
              setInstructorLabel(label);
              setForm((current) => ({ ...current, instructorUserId: user.userId }));
            }}
          />
          <div className="sm:col-span-2">
            <GhostUserPicker
              label="Aluno"
              value={form.studentUserId}
              selectedLabel={studentLabel}
              query={studentSearch}
              options={students}
              loading={studentsLoading}
              placeholder="Buscar aluno"
              onQueryChange={(value) => {
                setStudentSearch(value);
                setStudentLabel("");
                setForm((current) => ({ ...current, studentUserId: "" }));
              }}
              onSelect={(user) => {
                const label = adminUserLabel(user);
                setStudentSearch(label);
                setStudentLabel(label);
                setForm((current) => ({ ...current, studentUserId: user.userId }));
              }}
            />
          </div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
            Observacao
            <textarea
              rows={3}
              value={form.observation}
              onChange={(e) => setForm((current) => ({ ...current, observation: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="Ex: aguardando ficha SAGA do instrutor"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60">
            Cancelar
          </button>
          <button type="button" onClick={() => void submit()} disabled={aircraftLoading || saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
            {saving ? "Salvando..." : flight?.id ? "Salvar" : "Criar temporário"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GhostFlightMergeModal({
  row,
  onClose,
  onMerged,
}: {
  row: AdminFlightReportRow;
  onClose: () => void;
  onMerged: () => void;
}) {
  const { showToast } = useToast();
  const [candidates, setCandidates] = useState<AdminFlightReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergingId, setMergingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listGhostMergeCandidates(row.id)
      .then((items) => {
        if (!cancelled) setCandidates(items);
      })
      .catch((err) => {
        showToast({ variant: "error", message: err instanceof Error ? err.message : "Falha ao buscar voos reais." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.id, showToast]);

  const merge = async (candidate: AdminFlightReportRow) => {
    setMergingId(candidate.id);
    try {
      await finalizeGhostFlightMerge({ ghostFlightId: row.id, realFlightId: candidate.id });
      showToast({ variant: "success", message: "Voo temporario apontado para o voo real." });
      onMerged();
    } catch (err) {
      showToast({ variant: "error", message: err instanceof Error ? err.message : "Falha ao apontar voo." });
    } finally {
      setMergingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="border-b border-slate-800 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-100">Apontar para voo real</h3>
              <p className="mt-1 text-xs text-slate-500">
                {fmtDate(row.flightDate)} {row.startTime || "-"} · {row.studentName} · {row.aircraftIdent || "-"}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">Fechar</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : candidates.length ? (
            <div className="space-y-2">
              {candidates.map((candidate) => {
                const blocked = Boolean(candidate.mergeBlockedReason);
                return (
                  <div key={candidate.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-100">
                        {fmtDate(candidate.flightDate)} {candidate.startTime || "-"} · {candidate.studentName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {candidate.instructorName || "Sem INVA"} · {candidate.aircraftIdent || "-"} · {candidate.route || "sem rota"}
                      </p>
                      {blocked ? <p className="mt-1 text-xs text-amber-300">{candidate.mergeBlockedReason}</p> : null}
                    </div>
                    <button
                      type="button"
                      disabled={blocked || Boolean(mergingId)}
                      onClick={() => void merge(candidate)}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500"
                    >
                      {mergingId === candidate.id ? "Apontando..." : "Usar este voo"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
              Nenhum voo real compatível encontrado. Sincronize os voos com o SAGA e tente novamente.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function NoTelemetryTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const initialPeriod = useMemo(() => periodForPreset("last3"), []);
  const [rows, setRows] = useState<AdminFlightReportRow[]>([]);
  const [videoFlags, setVideoFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [openFilter, setOpenFilter] = useState<MultiFilterKey | null>(null);
  const [selectedRow, setSelectedRow] = useState<AdminFlightReportRow | null>(null);
  const [ghostMode, setGhostMode] = useState<GhostMode>("exclude");
  const [completionMode, setCompletionMode] = useState<CompletionMode>("pending");
  const [createGhostOpen, setCreateGhostOpen] = useState(false);
  const [editGhostRow, setEditGhostRow] = useState<AdminFlightReportRow | null>(null);
  const [mergeGhostRow, setMergeGhostRow] = useState<AdminFlightReportRow | null>(null);
  const [deletingGhostId, setDeletingGhostId] = useState<string | null>(null);
  const [openGhostMenuId, setOpenGhostMenuId] = useState<string | null>(null);
  const [sagaImporting, setSagaImporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SagaImportProgress | null>(null);
  const [syncOverlayVisible, setSyncOverlayVisible] = useState(false);
  const [filterState, setFilterState] = useState<AdminReportFilterState>({
    periodPreset: "last3",
    fromDate: initialPeriod.fromDate,
    toDate: initialPeriod.toDate,
    instructors: [],
    students: [],
    aircrafts: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [realPage, ghostPage] = await Promise.all([
        listAdminFlightReports({
          fromDate: filterState.fromDate,
          toDate: filterState.toDate,
          status: "Realizado",
          ghostMode: "exclude",
          limit: 200,
        }),
        listAdminFlightReports({
          status: "Realizado",
          ghostMode: "only",
          limit: 200,
        }),
      ]);
      const byId = new Map<string, AdminFlightReportRow>();
      for (const row of [...ghostPage.flights, ...realPage.flights]) byId.set(row.id, row);
      const flights = Array.from(byId.values());
      setRows(flights);
      const flags = await listFlightVideoFlags(flights.map((row) => row.id));
      setVideoFlags(flags);
    } catch (err) {
      showToast({
        variant: "error",
        message: err instanceof Error ? err.message : "Falha ao carregar voos.",
      });
    } finally {
      setLoading(false);
    }
  }, [filterState.fromDate, filterState.toDate, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewFlights = useMemo(
    () =>
      rows.filter((row) => {
        if (row.status !== "Realizado") return false;
        if (ghostMode === "exclude" && row.isGhostFlight) return false;
        if (ghostMode === "only" && !row.isGhostFlight) return false;
        if (row.isGhostFlight) return true;
        const videoOk = Boolean(videoFlags[row.id]);
        const complete = hasTelemetry(row) && videoOk;
        if (completionMode === "include-complete") return true;
        if (completionMode === "only-complete") return complete;
        return needsFlightReviewAttention(row, videoOk);
      }),
    [completionMode, ghostMode, rows, videoFlags],
  );

  const options = useMemo(() => {
    const instructors = new Set<string>();
    const students = new Set<string>();
    const aircrafts = new Set<string>();
    for (const row of reviewFlights) {
      if (row.instructorName) instructors.add(row.instructorName);
      if (row.studentName) students.add(row.studentName);
      if (row.aircraftIdent) aircrafts.add(row.aircraftIdent);
    }
    return {
      instructors: Array.from(instructors).sort((a, b) => a.localeCompare(b, "pt-BR")),
      students: Array.from(students).sort((a, b) => a.localeCompare(b, "pt-BR")),
      aircrafts: Array.from(aircrafts).sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  }, [reviewFlights]);

  const filtered = useMemo(() => {
    return reviewFlights.filter((row) => {
      if (row.isGhostFlight && ghostMode === "only") return true;
      const date = row.flightDate || row.createdAt.slice(0, 10);
      if (filterState.fromDate && date < filterState.fromDate) return false;
      if (filterState.toDate && date > filterState.toDate) return false;
      if (filterState.instructors.length && !filterState.instructors.includes(row.instructorName)) return false;
      if (filterState.students.length && !filterState.students.includes(row.studentName)) return false;
      if (filterState.aircrafts.length && !filterState.aircrafts.includes(row.aircraftIdent ?? "")) return false;
      return true;
    });
  }, [filterState, reviewFlights]);

  const handleSagaSync = async () => {
    if (sagaImporting) return;
    setSagaImporting(true);
    setSyncOverlayVisible(true);
    setSyncProgress(null);
    try {
      const summary = await importAllInstructorFlightsFromSaga({
        onProgress: (progress) => setSyncProgress(progress),
      });
      const novos = (summary.flightsCreated ?? 0) + (summary.flightsUpdated ?? 0);
      const removidos = summary.flightsDeleted ?? 0;
      const deletedIds = (summary.deletedFlights ?? []).map((item) => item.flightId).filter(Boolean);
      showToast({
        message: [
          novos > 0
            ? `${summary.flightsCreated} voo(s) novo(s) e ${summary.flightsUpdated} atualizado(s) importados do SAGA.`
            : "Nenhum voo novo encontrado no SAGA.",
          removidos > 0 ? `${removidos} voo(s) removido(s) localmente por terem sido apagados no SAGA.` : "",
          summary.staleCleanup?.failed
            ? `Falha ao remover ${summary.staleCleanup.failed} voo(s). Abra o console para detalhes.`
            : "",
          deletedIds.length ? `IDs removidos: ${deletedIds.join(", ")}` : "",
        ].filter(Boolean).join(" "),
        variant: novos > 0 || removidos > 0 ? "success" : "info",
      });
      await load();
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

  const selectedTelemetryOk = selectedRow ? hasTelemetry(selectedRow) : false;
  const selectedVideoOk = selectedRow ? Boolean(videoFlags[selectedRow.id]) : false;
  const isAdmin = user?.role === "admin";

  const handleDeleteGhost = async (row: AdminFlightReportRow) => {
    if (!row.isGhostFlight || deletingGhostId) return;
    const confirmed = window.confirm(`Excluir o voo temporário de ${row.studentName || "aluno"} em ${fmtDate(row.flightDate)}?`);
    if (!confirmed) return;
    setDeletingGhostId(row.id);
    try {
      await deleteGhostFlight(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      setVideoFlags((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      showToast({ variant: "success", message: "Voo temporário excluído." });
    } catch (err) {
      showToast({ variant: "error", message: err instanceof Error ? err.message : "Falha ao excluir voo temporário." });
    } finally {
      setDeletingGhostId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/35 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Temporários</span>
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
            {([
              ["exclude", "Ocultar temporários"],
              ["include", "Todos"],
              ["only", "Só temporários"],
            ] as Array<[GhostMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setGhostMode(mode)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  ghostMode === mode ? "bg-sky-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
            <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
            {([
              ["pending", "Pendentes"],
              ["include-complete", "Todos"],
              ["only-complete", "Só completos"],
            ] as Array<[CompletionMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCompletionMode(mode)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  completionMode === mode ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-400">
            <span className="font-semibold text-amber-300">{filtered.length}</span> voo(s) no filtro
          </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setCreateGhostOpen(true)}
              className="rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-800/40"
            >
              Criar temporário
            </button>
          ) : null}
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
                Sincronizando...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sincronizar voos
              </>
            )}
          </button>
        </div>
      </div>

        <div className="mt-3 border-t border-slate-800 pt-3">
          <AdminReportFilterBar
            state={filterState}
            options={options}
            openFilter={openFilter}
            onOpenFilter={setOpenFilter}
            onChange={(patch) => setFilterState((current) => ({ ...current, ...patch }))}
          />
        </div>
      </div>

      <TelemetryBulkImportPanel
        flights={filtered}
        aircraftOptions={options.aircrafts}
        onImported={() => void load()}
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Data</th>
                <th className="px-3 py-2.5 font-medium">Horário</th>
                <th className="px-3 py-2.5 font-medium">Aluno</th>
                <th className="px-3 py-2.5 font-medium">Instrutor</th>
                <th className="px-3 py-2.5 font-medium">Avião</th>
                <th className="px-3 py-2.5 font-medium">Rota</th>
                <th className="px-3 py-2.5 font-medium">Telemetria</th>
                <th className="px-3 py-2.5 font-medium">Vídeo</th>
                <th className="px-3 py-2.5 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((row) => {
                const telemetryOk = hasTelemetry(row);
                const videoOk = videoFlags[row.id] ?? false;
                return (
                  <tr key={row.id} className="text-slate-200 hover:bg-slate-800/30">
                    <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(row.flightDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{row.startTime || "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{row.studentName}</span>
                        {row.isGhostFlight ? (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                            Temporário
                          </span>
                        ) : null}
                      </div>
                      {row.isGhostFlight && row.ghostObservation ? (
                        <p className="mt-0.5 max-w-xs truncate text-[11px] text-slate-500" title={row.ghostObservation}>
                          {row.ghostObservation}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">{row.instructorName || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{row.aircraftIdent || "—"}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-400" title={row.route}>
                      {row.route || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge ok={telemetryOk} label="Telemetria" />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge ok={videoOk} label="Vídeo" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRow(row)}
                          className="rounded-lg border border-sky-600/50 bg-sky-600/10 px-3 py-1 text-xs font-medium text-sky-200 hover:bg-sky-600/20"
                        >
                          Adicionar
                        </button>
                        {row.isGhostFlight && isAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setMergeGhostRow(row)}
                              className="rounded-lg border border-emerald-600/50 bg-emerald-600/10 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-600/20"
                            >
                              Apontar
                            </button>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setOpenGhostMenuId((current) => (current === row.id ? null : row.id))}
                                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800"
                                aria-label="Mais ações"
                              >
                                ...
                              </button>
                              {openGhostMenuId === row.id ? (
                                <div className="absolute right-0 z-20 mt-1 w-32 rounded-lg border border-slate-700 bg-slate-950 py-1 text-left shadow-xl">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenGhostMenuId(null);
                                      setEditGhostRow(row);
                                    }}
                                    className="block w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenGhostMenuId(null);
                                      void handleDeleteGhost(row);
                                    }}
                                    disabled={deletingGhostId === row.id}
                                    className="block w-full px-3 py-2 text-left text-xs text-red-200 hover:bg-red-950/50 disabled:opacity-60"
                                  >
                                    {deletingGhostId === row.id ? "Excluindo..." : "Excluir"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              Nenhum voo encontrado para os filtros atuais.
            </p>
          ) : null}
        </div>
      )}

      {selectedRow ? (
        <FlightReviewFlightModal
          row={selectedRow}
          telemetryOk={selectedTelemetryOk}
          videoOk={selectedVideoOk}
          onClose={() => setSelectedRow(null)}
          onSaved={() => void load()}
        />
      ) : null}

      {createGhostOpen ? (
        <GhostFlightCreateModal
          onClose={() => setCreateGhostOpen(false)}
          onSaved={(flight) => {
            setCreateGhostOpen(false);
            setGhostMode("only");
            setRows((current) => [flight, ...current.filter((row) => row.id !== flight.id)]);
            setVideoFlags((current) => ({ ...current, [flight.id]: false }));
            setSelectedRow(flight);
          }}
        />
      ) : null}

      {editGhostRow ? (
        <GhostFlightCreateModal
          flight={editGhostRow}
          onClose={() => setEditGhostRow(null)}
          onSaved={(flight) => {
            setEditGhostRow(null);
            setRows((current) => current.map((row) => (row.id === flight.id ? { ...row, ...flight } : row)));
          }}
        />
      ) : null}

      {mergeGhostRow ? (
        <GhostFlightMergeModal
          row={mergeGhostRow}
          onClose={() => setMergeGhostRow(null)}
          onMerged={() => {
            setMergeGhostRow(null);
            void load();
          }}
        />
      ) : null}

      {syncOverlayVisible ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <svg className="h-5 w-5 shrink-0 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <h3 className="text-base font-semibold text-slate-100">Sincronizando voos com SAGA</h3>
            </div>
            <p className="mb-4 text-sm text-slate-300">
              {syncProgress?.message || "Conectando ao SAGA..."}
            </p>
            {syncProgress && syncProgress.total > 0 ? (
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
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
