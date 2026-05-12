import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { SCHOOL_ID } from "../lib/appwrite";
import { listAircrafts } from "../lib/aircraftDb";
import { decodeFlightRecord, encodeFlightRecord, type FlightRecordMeta } from "../lib/flightRecordCodec";
import { getSavedFlight, insertFlight, updateFlight } from "../lib/flightsDb";
import { renderMarkdownBlocks } from "../lib/markdown";
import { getProfile, listAssignableStudents, type PilotProfile, type StudentOption } from "../lib/rbac";
import type { Aircraft } from "../types/admin";
import { VideosTab } from "./VideosTab";
import { useToast } from "./ui/ToastProvider";

const DEFAULT_BRIEFING =
  "Tipo de voo: DC - Aluno deverá estudar as manobras a serem realizadas, repassando verbalmente os procedimentos, antes de iniciar o voo. O voo deverá ser realizado na área de manobras ou área adequada de acordo com o INVA, que também verificará planos de contingência.";
const DEFAULT_DANGER = "Sem perigos a serem reportados.";
const DEFAULT_RISK = "Sem riscos a serem reportados.";
const DEFAULT_RISK_MANAGEMENT = "Não houveram quaisquer riscos na instrução prática.";
const DEFAULT_APPROVED_TEXT = "Aluno e Voo foram considerados dentro dos padrões na instrução prática.";

const BOARD_ROLE_OPTIONS = [
  "Instrutor Voo",
  "Piloto em Comando",
  "Piloto em Instrução",
  "Instrutor de voo em solo",
  "Co-piloto Single Pilot",
  "Co-piloto Single Pilot com co-piloto, por questão regulamentar",
  "Co-piloto Dual Pilot",
] as const;

type LegDraft = {
  id: string;
  date: string;
  role: string;
  dep: string;
  arr: string;
  landings: number;
  flightTime: string;
  navTime: string;
  ifrTime: string;
  nightTime: string;
  serviceTime: string;
  distance: string;
};

type Props = {
  initialFlightId?: string;
  embedded?: boolean;
  onCancel?: () => void;
  onPublished?: (id: string) => void;
};

const STEPS = [
  { id: "dados", label: "Dados do voo" },
  { id: "pre-voo", label: "Pre voo" },
  { id: "pernas", label: "Pernas" },
  { id: "risco", label: "Risco e parecer" },
  { id: "anexos", label: "Anexos finais" },
] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyLeg(): LegDraft {
  return {
    id: crypto.randomUUID(),
    date: todayIso(),
    role: BOARD_ROLE_OPTIONS[0],
    dep: "",
    arr: "",
    landings: 0,
    flightTime: "",
    navTime: "",
    ifrTime: "",
    nightTime: "",
    serviceTime: "",
    distance: "",
  };
}

function parseDurationToMinutes(value: string): number {
  const raw = value.trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) {
    const h = Number(hhmm[1] ?? "0");
    const m = Number(hhmm[2] ?? "0");
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
    return 0;
  }
  const decimal = Number(raw.replace(",", "."));
  if (Number.isFinite(decimal) && decimal > 0) return Math.round(decimal * 60);
  return 0;
}

function formatMinutes(min: number): string {
  const safe = Math.max(0, Math.round(min));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function markdownToEditableHtml(markdown: string): string {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (/^\d+\.\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      html.push(`<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`);
      continue;
    }
    if (/^[-*]\s+/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      html.push(`<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
      continue;
    }
    if (!line.trim()) {
      html.push("<div><br></div>");
      i++;
      continue;
    }
    html.push(`<div>${escapeHtml(line)}</div>`);
    i++;
  }

  let joined = html.join("");
  joined = joined
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return joined || "<div><br></div>";
}

function htmlToMarkdownFromEditor(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return "";

  function parseInline(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "strong" || tag === "b") return `**${Array.from(node.childNodes).map(parseInline).join("")}**`;
    if (tag === "em" || tag === "i") return `*${Array.from(node.childNodes).map(parseInline).join("")}*`;
    if (tag === "br") return "\n";
    return Array.from(node.childNodes).map(parseInline).join("");
  }

  const out: string[] = [];
  for (const child of Array.from(root.childNodes)) {
    if (!(child instanceof HTMLElement)) {
      const text = parseInline(child).trim();
      if (text) out.push(text);
      continue;
    }
    const tag = child.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      const lis = Array.from(child.querySelectorAll(":scope > li"));
      lis.forEach((li, idx) => {
        const text = Array.from(li.childNodes).map(parseInline).join("").trim();
        out.push(tag === "ul" ? `- ${text}` : `${idx + 1}. ${text}`);
      });
      continue;
    }
    const text = Array.from(child.childNodes).map(parseInline).join("").trim();
    out.push(text);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function MarkdownField({
  label,
  value,
  onChange,
  required = false,
  minRows = 4,
  disabled = false,
  quickActionLabel,
  quickActionValue,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  minRows?: number;
  disabled?: boolean;
  quickActionLabel?: string;
  quickActionValue?: string;
}) {
  if (disabled) {
    return (
      <div className="space-y-2 rounded-xl border border-slate-700/70 bg-slate-900/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
          {required ? " *" : ""}
        </p>
        <div className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-2 text-sm">
          {renderMarkdownBlocks(value || "Sem conteúdo.")}
        </div>
      </div>
    );
  }

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const current = ref.current;
    if (!current) return;
    const nextHtml = markdownToEditableHtml(value);
    if (current.innerHTML !== nextHtml) current.innerHTML = nextHtml;
  }, [value]);

  const runCommand = (command: string) => {
    ref.current?.focus();
    document.execCommand(command, false);
    const html = ref.current?.innerHTML ?? "";
    onChange(htmlToMarkdownFromEditor(html));
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-700/70 bg-slate-900/30 p-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label}
          {required ? " *" : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => runCommand("bold")}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          Negrito
        </button>
        <button
          type="button"
          onClick={() => runCommand("italic")}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          Itálico
        </button>
        <button
          type="button"
          onClick={() => runCommand("insertUnorderedList")}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          Bullet
        </button>
        <button
          type="button"
          onClick={() => runCommand("insertOrderedList")}
          className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          Number
        </button>
        {quickActionLabel && quickActionValue ? (
          <button
            type="button"
            onClick={() => onChange(quickActionValue)}
            className="rounded border border-emerald-600/40 bg-emerald-600/20 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-600/30"
          >
            {quickActionLabel}
          </button>
        ) : null}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(htmlToMarkdownFromEditor(ref.current?.innerHTML ?? ""))}
        onKeyDown={(e) => {
          if (e.ctrlKey && (e.key === "b" || e.key === "B")) {
            e.preventDefault();
            runCommand("bold");
          }
          if (e.ctrlKey && (e.key === "i" || e.key === "I")) {
            e.preventDefault();
            runCommand("italic");
          }
        }}
        className="min-h-[7rem] rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
        style={{ whiteSpace: "pre-wrap", minHeight: `${Math.max(4, minRows) * 1.6}rem` }}
      />
    </div>
  );
}

export function NovoVooFlow({ initialFlightId, embedded = false, onCancel, onPublished }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentProfilesById, setStudentProfilesById] = useState<Record<string, { name: string; anac: string; email: string }>>({});
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PilotProfile | null>(null);
  const [instructorProfile, setInstructorProfile] = useState<PilotProfile | null>(null);
  const [loadedInstructorName, setLoadedInstructorName] = useState("");
  const [loadedInstructorAnac, setLoadedInstructorAnac] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [aircraftLoading, setAircraftLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(initialFlightId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [flightId, setFlightId] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  const [studentId, setStudentId] = useState("");
  const [studentLabel, setStudentLabel] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [flightDate, setFlightDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("");
  const [aircraft, setAircraft] = useState("");
  const [flightName, setFlightName] = useState("");

  const [objectiveMd, setObjectiveMd] = useState("");
  const [briefingMd, setBriefingMd] = useState(DEFAULT_BRIEFING);
  const [instructorSuggestionMd, setInstructorSuggestionMd] = useState("");
  const [studentSuggestionMd, setStudentSuggestionMd] = useState("");
  const [scheduleMeta, setScheduleMeta] = useState<FlightRecordMeta["schedule"]>(undefined);

  const [legs, setLegs] = useState<LegDraft[]>([emptyLeg()]);

  const [commentsMd, setCommentsMd] = useState("");
  const [dangerMd, setDangerMd] = useState(DEFAULT_DANGER);
  const [riskMd, setRiskMd] = useState(DEFAULT_RISK);
  const [managementMd, setManagementMd] = useState(DEFAULT_RISK_MANAGEMENT);
  const [instructorOpinionMd, setInstructorOpinionMd] = useState("");

  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [telemetryCsv, setTelemetryCsv] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);

  const isInstructorFlow = user?.role === "instrutor" || user?.role === "admin";
  const canEdit = isInstructorFlow;

  useEffect(() => {
    if (error) showToast({ variant: "error", message: error });
  }, [error, showToast]);

  useEffect(() => {
    if (savedMessage) showToast({ variant: "success", message: savedMessage });
  }, [savedMessage, showToast]);

  useEffect(() => {
    if (!user || !isInstructorFlow) return;
    setStudentsLoading(true);
    setError(null);
    void listAssignableStudents(user.id, user.role)
      .then(async (res) => {
        setStudents(res);
        const first = res[0];
        if (!initialFlightId) {
          setStudentId(first?.userId ?? "");
          setStudentLabel(first?.email ?? "");
        }
        const profileEntries = await Promise.all(
          res.map(async (student) => {
            const { data } = await getProfile(student.userId);
            return [
              student.userId,
              {
                name: data?.fullName?.trim() || student.email,
                anac: data?.anacCode?.trim() || "",
                email: student.email,
              },
            ] as const;
          }),
        );
        const mapped = Object.fromEntries(profileEntries);
        setStudentProfilesById(mapped);
        if (!initialFlightId && first?.userId && mapped[first.userId]?.name) {
          setStudentLabel(mapped[first.userId]!.name);
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setStudentsLoading(false));
  }, [initialFlightId, isInstructorFlow, user]);

  useEffect(() => {
    if (!user?.id) return;
    void getProfile(user.id).then(({ data }) => setInstructorProfile(data));
  }, [user?.id]);

  useEffect(() => {
    const schoolId = SCHOOL_ID ?? "escola_principal";
    setAircraftLoading(true);
    void listAircrafts(schoolId)
      .then((res) => setAircrafts(res.filter((a) => a.active)))
      .catch((e) => setError((e as Error).message))
      .finally(() => setAircraftLoading(false));
  }, []);

  useEffect(() => {
    if (!studentId) {
      setSelectedProfile(null);
      return;
    }
    void getProfile(studentId).then(({ data }) => setSelectedProfile(data));
  }, [studentId]);

  useEffect(() => {
    if (!initialFlightId) return;
    setLoadingExisting(true);
    void getSavedFlight(initialFlightId)
      .then(async ({ data, error: loadError }) => {
        if (loadError || !data) {
          setError(loadError?.message ?? "Não foi possível carregar a ficha.");
          return;
        }
        const instructorFromDb = data.instructor_user_id ? await getProfile(data.instructor_user_id) : null;
        const decoded = decodeFlightRecord(data.csv_text);
        const meta = decoded.meta;
        setFlightId(data.id);
        setFlightName(data.name ?? "");
        setCsvFileName(data.source_filename ?? null);
        setTelemetryCsv(decoded.telemetryCsv ?? "");

        if (!meta) {
          setStudentId(data.student_user_id ?? "");
          setStudentLabel("");
          setFlightDate((data.created_at ?? "").slice(0, 10) || todayIso());
          setStartTime("");
          setAircraft(data.aircraft_ident ?? "");
          setScheduleMeta(undefined);
          setLoadedInstructorName(instructorFromDb?.data?.fullName?.trim() || "");
          setLoadedInstructorAnac(instructorFromDb?.data?.anacCode?.trim() || "");
          return;
        }

        setStudentId(meta.header.studentUserId ?? data.student_user_id ?? "");
        setStudentLabel(meta.header.studentName ?? meta.header.studentLabel ?? "");
        setFlightDate(meta.header.date || (data.created_at ?? "").slice(0, 10) || todayIso());
        setStartTime(meta.header.startTime ?? "");
        setAircraft(meta.header.aircraft ?? data.aircraft_ident ?? "");
        setObjectiveMd(meta.preFlight.objectiveMd ?? "");
        setBriefingMd(meta.preFlight.briefingMd ?? DEFAULT_BRIEFING);
        setInstructorSuggestionMd(meta.preFlight.instructorSuggestionMd ?? "");
        setStudentSuggestionMd(meta.preFlight.studentSuggestionMd ?? "");
        setScheduleMeta(meta.schedule);
        setLegs(
          meta.legs?.length
            ? meta.legs.map((leg) => ({
                id: leg.id || crypto.randomUUID(),
                date: leg.date || todayIso(),
                role: leg.role || BOARD_ROLE_OPTIONS[0],
                dep: leg.dep || "",
                arr: leg.arr || "",
                landings: Number.isFinite(leg.landings) ? leg.landings : 0,
                flightTime: leg.flightTime || "",
                navTime: leg.navTime || "",
                ifrTime: leg.ifrTime || "",
                nightTime: leg.nightTime || "",
                serviceTime: leg.serviceTime || "",
                distance: leg.distance || "",
              }))
            : [emptyLeg()],
        );
        setCommentsMd(meta.risk.commentsMd ?? "");
        setDangerMd(meta.risk.dangerMd ?? DEFAULT_DANGER);
        setRiskMd(meta.risk.riskMd ?? DEFAULT_RISK);
        setManagementMd(meta.risk.managementMd ?? DEFAULT_RISK_MANAGEMENT);
        setInstructorOpinionMd(meta.risk.instructorOpinionMd ?? "");
        setLoadedInstructorName(
          meta.header.instructorName ||
            instructorFromDb?.data?.fullName?.trim() ||
            "",
        );
        setLoadedInstructorAnac(
          meta.header.instructorAnac ||
            instructorFromDb?.data?.anacCode?.trim() ||
            "",
        );
      })
      .finally(() => setLoadingExisting(false));
  }, [initialFlightId]);

  useEffect(() => {
    if (!flightName.trim()) {
      const name = [aircraft.trim(), flightDate].filter(Boolean).join(" - ");
      if (name) setFlightName(name);
    }
  }, [aircraft, flightDate, flightName]);

  const totals = useMemo(() => {
    const sum = (selector: (leg: LegDraft) => string) =>
      legs.reduce((acc, leg) => acc + parseDurationToMinutes(selector(leg)), 0);
    return {
      landings: legs.reduce((acc, leg) => acc + (Number.isFinite(leg.landings) ? leg.landings : 0), 0),
      flightMin: sum((leg) => leg.flightTime),
      navMin: sum((leg) => leg.navTime),
      ifrMin: sum((leg) => leg.ifrTime),
      nightMin: sum((leg) => leg.nightTime),
      serviceMin: sum((leg) => leg.serviceTime),
    };
  }, [legs]);

  const filteredStudents = useMemo(() => {
    const search = studentSearch.trim().toLowerCase();
    if (!search) return students;
    return students.filter((student) => {
      const profile = studentProfilesById[student.userId];
      const name = (profile?.name ?? "").toLowerCase();
      const anac = (profile?.anac ?? "").toLowerCase();
      return name.includes(search) || anac.includes(search);
    });
  }, [studentProfilesById, studentSearch, students]);

  const updateLeg = (id: string, patch: Partial<LegDraft>) => {
    setLegs((prev) => prev.map((leg) => (leg.id === id ? { ...leg, ...patch } : leg)));
  };

  const addLeg = () => setLegs((prev) => [...prev, emptyLeg()]);

  const removeLeg = (id: string) => {
    setLegs((prev) => (prev.length <= 1 ? prev : prev.filter((leg) => leg.id !== id)));
  };

  const readCsvFile = (file: File) => {
    if (!canEdit) return;
    setCsvLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setTelemetryCsv((e.target?.result as string) ?? "");
      setCsvFileName(file.name);
      setCsvLoading(false);
    };
    reader.onerror = () => {
      setCsvLoading(false);
      setError("Falha ao ler o CSV de telemetria.");
    };
    reader.readAsText(file);
  };

  const persist = async (status: "draft" | "submitted") => {
    if (!user) return;
    if (!canEdit) {
      setError("Somente instrutor/admin pode editar esta ficha.");
      return;
    }
    if (!studentId) {
      setError("Selecione um aluno para continuar.");
      return;
    }
    if (status === "submitted" && !instructorOpinionMd.trim()) {
      setError("PARECER DO INSTRUTOR é obrigatório para enviar.");
      return;
    }
    if (status === "submitted" && !startTime.trim()) {
      setError("Preencha o Horário de Início.");
      return;
    }
    const hasAnyLeg = legs.some((leg) =>
      leg.dep.trim() ||
      leg.arr.trim() ||
      leg.flightTime.trim() ||
      leg.navTime.trim() ||
      leg.ifrTime.trim() ||
      leg.nightTime.trim() ||
      leg.serviceTime.trim() ||
      leg.distance.trim() ||
      leg.landings > 0,
    );
    if (status === "submitted" && !hasAnyLeg) {
      setError("Adicione pelo menos uma perna de voo antes de enviar.");
      return;
    }

    setSaving(true);
    setError(null);
    setSavedMessage(null);

    const meta: FlightRecordMeta = {
      status,
      ...(scheduleMeta ? { schedule: scheduleMeta } : {}),
      header: {
        studentUserId: studentId,
        studentLabel,
        studentName: selectedProfile?.fullName?.trim() || studentLabel || "",
        studentAnac: selectedProfile?.anacCode?.trim() || "",
        instructorName: instructorProfile?.fullName?.trim() || user.email || "",
        instructorAnac: instructorProfile?.anacCode?.trim() || "",
        date: flightDate,
        startTime: startTime.trim(),
        aircraft: aircraft.trim(),
      },
      preFlight: {
        objectiveMd: objectiveMd.trim(),
        briefingMd: briefingMd.trim(),
        instructorSuggestionMd: instructorSuggestionMd.trim(),
        studentSuggestionMd: studentSuggestionMd.trim(),
      },
      legs: legs.map((leg) => ({
        id: leg.id,
        date: leg.date,
        role: leg.role,
        dep: leg.dep.trim(),
        arr: leg.arr.trim(),
        landings: Math.max(0, Math.round(leg.landings || 0)),
        flightTime: leg.flightTime.trim(),
        navTime: leg.navTime.trim(),
        ifrTime: leg.ifrTime.trim(),
        nightTime: leg.nightTime.trim(),
        serviceTime: leg.serviceTime.trim(),
        distance: leg.distance.trim(),
      })),
      risk: {
        commentsMd: commentsMd.trim(),
        dangerMd: dangerMd.trim(),
        riskMd: riskMd.trim(),
        managementMd: managementMd.trim(),
        instructorOpinionMd: instructorOpinionMd.trim(),
      },
    };

    const csvPayload = encodeFlightRecord({ meta, telemetryCsv });
    const payload = {
      actorUserId: user.id,
      actorRole: user.role,
      studentUserId: studentId,
      instructorUserId: user.id,
      name: flightName.trim() || `Voo ${flightDate}`,
      source_filename: csvFileName ?? "manual-entry.csv",
      csv_text: csvPayload,
      aircraft_ident: aircraft.trim() || null,
      duration_sec: totals.flightMin > 0 ? totals.flightMin * 60 : null,
    };

    if (flightId) {
      const { error: updateErr } = await updateFlight(flightId, payload);
      setSaving(false);
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      if (status === "submitted") onPublished?.(flightId);
      setSavedMessage(status === "draft" ? "Rascunho atualizado." : "Voo publicado com sucesso.");
      return;
    }

    const { id, error: insertErr } = await insertFlight(payload);
    setSaving(false);
    if (insertErr || !id) {
      setError(insertErr?.message ?? "Falha ao salvar voo.");
      return;
    }
    setFlightId(id);
    if (status === "submitted") onPublished?.(id);
    setSavedMessage(status === "draft" ? "Rascunho salvo." : "Voo publicado com sucesso.");
  };

  const goNext = () => setStepIdx((idx) => Math.min(STEPS.length - 1, idx + 1));
  const goPrev = () => setStepIdx((idx) => Math.max(0, idx - 1));

  const stepId = STEPS[stepIdx]?.id;
  const displayInstructorName = initialFlightId ? loadedInstructorName : (instructorProfile?.fullName?.trim() || user?.email || "");
  const displayInstructorAnac = initialFlightId ? loadedInstructorAnac : (instructorProfile?.anacCode?.trim() || "");

  if (loadingExisting) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        Carregando ficha...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{flightId ? "Ficha do voo" : "Novo voo"}</p>
            <h2 className="text-lg font-semibold text-slate-100">Fluxo de criação da ficha</h2>
          </div>
          <button
            type="button"
            onClick={() => onCancel?.()}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Voltar
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700/70 bg-slate-900/40 p-3 md:grid-cols-5">
        {STEPS.map((step, idx) => {
          const isActive = idx === stepIdx;
          const isPast = idx < stepIdx;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setStepIdx(idx)}
              className={`rounded-lg border px-2 py-2 text-left transition ${
                isActive
                  ? "border-sky-500 bg-sky-600/20 text-sky-200"
                  : isPast
                    ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-200"
                    : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide">Etapa {idx + 1}</p>
              <p className="text-xs font-medium">{step.label}</p>
            </button>
          );
        })}
      </div>

      {stepId === "dados" && (
        <section className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Dados do voo</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Aluno</span>
              {canEdit && (
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Pesquisar por nome ou CANAC"
                  className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              )}
              <select
                value={studentId}
                disabled={studentsLoading || !canEdit}
                onChange={(e) => {
                  const selected = students.find((student) => student.userId === e.target.value);
                  const profile = selected ? studentProfilesById[selected.userId] : undefined;
                  setStudentId(e.target.value);
                  setStudentLabel(profile?.name || selected?.email || "");
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                {filteredStudents.length === 0 ? (
                  <option value="">
                    {studentsLoading ? "Carregando alunos..." : "Nenhum aluno encontrado"}
                  </option>
                ) : (
                  filteredStudents.map((student) => {
                    const profile = studentProfilesById[student.userId];
                    const label = profile?.name || student.email;
                    const anac = profile?.anac ? ` - CANAC ${profile.anac}` : "";
                    return (
                      <option key={student.userId} value={student.userId}>
                        {label}{anac}
                      </option>
                    );
                  })
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Data</span>
              <input
                type="date"
                value={flightDate}
                onChange={(e) => setFlightDate(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-70"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Horário de Início</span>
              <input
                type="text"
                value={startTime}
                placeholder="HH:MM"
                onChange={(e) => setStartTime(normalizeTimeInput(e.target.value))}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-70"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Aeronave / Matrícula</span>
              <select
                value={aircraft}
                onChange={(e) => setAircraft(e.target.value)}
                disabled={!canEdit || aircraftLoading}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-70"
              >
                <option value="">{aircraftLoading ? "Carregando aeronaves..." : "Selecione"}</option>
                {aircrafts.map((ac) => (
                  <option key={ac.id} value={ac.registration}>
                    {ac.registration}{ac.nickname ? ` - ${ac.nickname}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Nome do voo</span>
              <input
                type="text"
                value={flightName}
                onChange={(e) => setFlightName(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-70"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-950/30 p-3 md:grid-cols-3">
            <InfoBlock label="Nome completo" value={selectedProfile?.fullName || "—"} />
            <InfoBlock label="Codigo ANAC" value={selectedProfile?.anacCode || "—"} />
            <InfoBlock label="Aluno (email)" value={studentLabel || "—"} />
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-950/30 p-3 md:grid-cols-2">
            <InfoBlock label="Instrutor (exibição)" value={displayInstructorName} />
            <InfoBlock label="CANAC instrutor (exibição)" value={displayInstructorAnac} />
          </div>
        </section>
      )}

      {stepId === "pre-voo" && (
        <section className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pre voo</p>
          <MarkdownField label="Objetivo da lição" value={objectiveMd} onChange={setObjectiveMd} disabled={!canEdit} />
          <MarkdownField
            label="Sugestão do INVA"
            value={instructorSuggestionMd}
            onChange={setInstructorSuggestionMd}
            disabled={!canEdit}
          />
          <MarkdownField
            label="Sugestão do Aluno"
            value={studentSuggestionMd}
            onChange={setStudentSuggestionMd}
            disabled={!canEdit}
          />
          <MarkdownField label="Nota do briefing" value={briefingMd} onChange={setBriefingMd} disabled={!canEdit} />
        </section>
      )}

      {stepId === "pernas" && (
        <section className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pernas</p>
            <button
              type="button"
              onClick={addLeg}
              disabled={!canEdit}
              className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              + Adicionar perna
            </button>
          </div>

          <div className="space-y-2">
            {legs.map((leg, idx) => (
              <div key={leg.id} className="space-y-2 rounded-lg border border-slate-700/70 bg-slate-950/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-300">Perna {idx + 1}</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const canReverse = leg.dep.trim() && leg.arr.trim() && leg.dep.trim().toUpperCase() !== leg.arr.trim().toUpperCase();
                        if (!canReverse) return;
                        setLegs((prev) => {
                          const base = prev.find((x) => x.id === leg.id);
                          if (!base) return prev;
                          const reversed: LegDraft = {
                            ...base,
                            id: crypto.randomUUID(),
                            dep: base.arr,
                            arr: base.dep,
                            landings: base.landings,
                            flightTime: "",
                            navTime: "",
                            ifrTime: "",
                            nightTime: "",
                            serviceTime: "",
                          };
                          return [...prev, reversed];
                        });
                      }}
                      className="text-xs text-emerald-300 hover:underline disabled:opacity-30"
                      disabled={!canEdit || !leg.dep.trim() || !leg.arr.trim() || leg.dep.trim().toUpperCase() === leg.arr.trim().toUpperCase()}
                    >
                      Adicionar perna contrária
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLeg(leg.id)}
                      className="text-xs text-red-300 hover:underline disabled:opacity-30"
                      disabled={legs.length <= 1 || !canEdit}
                    >
                      Remover
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <Input label="Data">
                    <input type="date" value={leg.date} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { date: e.target.value })} className={inputClass} />
                  </Input>
                  <Input label="Função">
                    <select value={leg.role} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { role: e.target.value })} className={inputClass}>
                      {BOARD_ROLE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </Input>
                  <Input label="DEP">
                    <input type="text" value={leg.dep} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { dep: e.target.value.toUpperCase() })} className={inputClass} />
                  </Input>
                  <Input label="ARR">
                    <input type="text" value={leg.arr} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { arr: e.target.value.toUpperCase() })} className={inputClass} />
                  </Input>
                  <Input label="Pousos">
                    <input type="number" min={0} value={leg.landings} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { landings: Number(e.target.value) || 0 })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de Voo">
                    <input type="text" placeholder="HH:MM" value={leg.flightTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { flightTime: normalizeTimeInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de Navegação">
                    <input type="text" placeholder="HH:MM" value={leg.navTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { navTime: normalizeTimeInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de IFR">
                    <input type="text" placeholder="HH:MM" value={leg.ifrTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { ifrTime: normalizeTimeInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de Noturno">
                    <input type="text" placeholder="HH:MM" value={leg.nightTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { nightTime: normalizeTimeInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Tempo de Serviço">
                    <input type="text" placeholder="HH:MM" value={leg.serviceTime} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { serviceTime: normalizeTimeInput(e.target.value) })} className={inputClass} />
                  </Input>
                  <Input label="Distância">
                    <input type="text" value={leg.distance} disabled={!canEdit} onChange={(e) => updateLeg(leg.id, { distance: e.target.value })} className={inputClass} />
                  </Input>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-700/70 bg-slate-950/40 p-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <TotalCard label="Pousos" value={String(totals.landings)} />
            <TotalCard label="Tempo de voo" value={formatMinutes(totals.flightMin)} />
            <TotalCard label="Navegação" value={formatMinutes(totals.navMin)} />
            <TotalCard label="IFR" value={formatMinutes(totals.ifrMin)} />
            <TotalCard label="Noturno" value={formatMinutes(totals.nightMin)} />
            <TotalCard label="Serviço" value={formatMinutes(totals.serviceMin)} />
          </div>
        </section>
      )}

      {stepId === "risco" && (
        <section className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Risco e parecer</p>
          <MarkdownField label="Comentários" value={commentsMd} onChange={setCommentsMd} minRows={3} disabled={!canEdit} />
          <MarkdownField label="DESCRIÇÃO DO PERIGO" value={dangerMd} onChange={setDangerMd} minRows={3} disabled={!canEdit} />
          <MarkdownField label="DESCRIÇÃO DO RISCO" value={riskMd} onChange={setRiskMd} minRows={3} disabled={!canEdit} />
          <MarkdownField
            label="DESCRIÇÃO DO GERENCIAMENTO DO RISCO"
            value={managementMd}
            onChange={setManagementMd}
            minRows={3}
            disabled={!canEdit}
          />
          <MarkdownField
            label="PARECER DO INSTRUTOR"
            value={instructorOpinionMd}
            onChange={setInstructorOpinionMd}
            required
            minRows={4}
            disabled={!canEdit}
            quickActionLabel="Aluno aprovado"
            quickActionValue={DEFAULT_APPROVED_TEXT}
          />
        </section>
      )}

      {stepId === "anexos" && (
        <section className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Anexos finais</p>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">CSV de telemetria</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              disabled={!canEdit}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readCsvFile(f);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-slate-200 disabled:opacity-70"
            />
          </label>
          {csvLoading ? <p className="text-xs text-slate-500">Lendo CSV...</p> : null}
          {csvFileName ? (
            <p className="text-xs text-emerald-300">
              CSV carregado: {csvFileName} ({telemetryCsv.length.toLocaleString("pt-BR")} chars)
            </p>
          ) : (
            <p className="text-xs text-slate-500">Nenhum CSV carregado.</p>
          )}

          {flightId ? (
            <div className="rounded-lg border border-slate-700/70 bg-slate-950/30 p-3">
              <p className="mb-2 text-xs font-medium text-slate-400">Vídeos do voo</p>
              <VideosTab flightId={flightId} />
            </div>
          ) : (
            <p className="rounded-lg border border-slate-700/70 bg-slate-950/30 px-3 py-2 text-xs text-slate-500">
              Salve um rascunho para habilitar upload de vídeos neste voo.
            </p>
          )}
        </section>
      )}

      <div className="sticky bottom-2 flex flex-col gap-3 rounded-xl border border-slate-700/70 bg-slate-900/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={goPrev}
          disabled={stepIdx === 0}
          className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40 sm:w-auto"
        >
          ← Anterior
        </button>
        {stepIdx < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="w-full rounded-lg border border-sky-600/40 bg-sky-600/10 px-4 py-2 text-sm text-sky-200 hover:bg-sky-600/20 sm:w-auto"
          >
            Próximo →
          </button>
        ) : null}
        <div className="flex w-full flex-col gap-3 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => void persist("draft")}
              disabled={saving}
              className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
            >
              {saving ? "💾 Salvando..." : "💾 Salvar rascunho"}
            </button>
            <button
              type="button"
              onClick={() => void persist("submitted")}
              disabled={saving}
              className="w-full rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60 sm:w-auto"
            >
              {saving ? "✈ Enviando..." : "✈ Enviar voo"}
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500";

function Input({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-700/70 bg-slate-900/50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-700/70 bg-slate-900/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}
