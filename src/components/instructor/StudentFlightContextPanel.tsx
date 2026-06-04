import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  buildFlightDisplayInfo,
  formatMinutes,
  getDateBase,
  getFlightDateTimeMs,
  isCompletedFlight,
  isFutureFlight,
  type FlightDisplayInfo,
} from "../../lib/flightDisplay";
import { decodeFlightRecord, type FlightRecordMeta } from "../../lib/flightRecordCodec";
import { getStudentCreditStatement } from "../../lib/creditsDb";
import { getSavedFlight, listStudentFlightHistory, type SavedFlightListItem } from "../../lib/flightsDb";
import { loadFullFlightListDisplayInfos } from "../../lib/flightListDisplayCache";
import { BUCKET_ID, storage } from "../../lib/appwrite";
import { getProfile, type PilotProfile } from "../../lib/rbac";
import { listStudentTrainingTracks } from "../../lib/trainingTracksDb";
import { formatNumber } from "../../lib/weightBalance";
import type { StudentCreditStatement } from "../../types/credits";
import { StudentObservationsSection } from "../admin/StudentObservationsSection";
import { CreditStatementView } from "../CreditStatementView";
import { TelemetriaTab } from "../TelemetriaTab";
import { VideosTab } from "../VideosTab";
import { FlightReviewClubBadge, hasActiveFlightReviewClubTrack } from "../FlightReviewClubBadge";
import { Tabs } from "../ui/Tabs";

type HistoryDetailTab = "ficha" | "telemetria" | "videos";

const HISTORY_DETAIL_TABS: Array<{ id: HistoryDetailTab; label: string; icon: ReactNode }> = [
  {
    id: "ficha",
    label: "Ficha",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M5.75 2A1.75 1.75 0 004 3.75v12.5C4 17.216 4.784 18 5.75 18h8.5A1.75 1.75 0 0016 16.25V6.5L11.5 2H5.75zm5 1.75L14.25 7h-2.5a1 1 0 01-1-1V3.75zM7 10h6v1.5H7V10zm0 3h6v1.5H7V13z" />
      </svg>
    ),
  },
  {
    id: "telemetria",
    label: "Telemetria",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3.5 3.75A.75.75 0 014.25 3h11.5a.75.75 0 010 1.5H5v10.75a.75.75 0 01-1.5 0V3.75z" />
        <path d="M7 13.5a1 1 0 100 2 1 1 0 000-2zm4-4a1 1 0 100 2 1 1 0 000-2zm4-3.5a1 1 0 100 2 1 1 0 000-2zM7.53 13.03l3-3 1.06 1.06-3 3-1.06-1.06zm4.04-2.6l2.9-3.38 1.14.98-2.9 3.38-1.14-.98z" />
      </svg>
    ),
  },
  {
    id: "videos",
    label: "Vídeos",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4.75 4A1.75 1.75 0 003 5.75v8.5C3 15.216 3.784 16 4.75 16h7.5A1.75 1.75 0 0014 14.25v-8.5A1.75 1.75 0 0012.25 4h-7.5zM15 7.25l2.47-1.65A1 1 0 0119 6.43v7.14a1 1 0 01-1.53.83L15 12.75v-5.5z" />
      </svg>
    ),
  },
];

function field(label: string, value: string | number | null | undefined) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/35 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-200">{value || "—"}</p>
    </div>
  );
}

function parseBrDate(value: string): Date | null {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExpiredDate(value: string): boolean {
  const date = parseBrDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function formatDate(item: SavedFlightListItem, info?: FlightDisplayInfo): string {
  const date = getDateBase(item, info);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function MarkdownPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/35 p-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-slate-300">{value || "—"}</p>
    </div>
  );
}

function ReadOnlyFicha({ meta }: { meta: FlightRecordMeta | null }) {
  if (!meta) {
    return <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-3 text-sm text-amber-200">Ficha sem metadados estruturados.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {field("Data", meta.header.date)}
        {field("Horário", meta.header.startTime)}
        {field("Aeronave", meta.header.aircraft)}
        {field("Aluno", meta.header.studentName || meta.header.studentLabel)}
      </div>

      <section className="grid gap-3 lg:grid-cols-2">
        <MarkdownPreview label="Objetivo da lição" value={meta.preFlight.objectiveMd} />
        <MarkdownPreview label="Sugestão do INVA" value={meta.preFlight.instructorSuggestionMd ?? ""} />
        <MarkdownPreview label="Sugestão do aluno" value={meta.preFlight.studentSuggestionMd ?? ""} />
        <MarkdownPreview label="Briefing" value={meta.preFlight.briefingMd} />
      </section>

      <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Pernas</p>
        <div className="space-y-2">
          {meta.legs.map((leg, idx) => (
            <div key={leg.id || idx} className="grid gap-2 rounded-lg border border-slate-700/60 bg-slate-950/35 p-3 text-xs text-slate-400 md:grid-cols-6">
              <p>Data: <span className="text-slate-300">{leg.date || "—"}</span></p>
              <p>Função: <span className="text-slate-300">{leg.role || "—"}</span></p>
              <p>DEP: <span className="text-slate-300">{leg.dep || "—"}</span></p>
              <p>ARR: <span className="text-slate-300">{leg.arr || "—"}</span></p>
              <p>Pousos: <span className="text-slate-300">{leg.landings || 0}</span></p>
              <p>Tempo: <span className="text-slate-300">{leg.flightTime || "—"}</span></p>
            </div>
          ))}
        </div>
      </section>

      {meta.weightBalance ? (
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Peso e balanceamento</p>
            <span className={`rounded-full border px-2 py-1 text-[11px] ${
              meta.weightBalance.results.isWithinLimits
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}>
              {meta.weightBalance.results.isWithinLimits ? "Dentro do envelope" : "Verificar envelope"}
            </span>
          </div>
          <div className="mb-3 grid gap-2 text-xs md:grid-cols-4">
            {field("Peso ocupantes", `${formatNumber(meta.weightBalance.inputs.occupantsWeightKg)} kg`)}
            {field("Peso bagagem", `${formatNumber(meta.weightBalance.inputs.baggageWeightKg)} kg`)}
            {field("Combustível inicial", `${formatNumber(meta.weightBalance.inputs.rampFuel.weightKg)} kg`)}
            {field("Fator combustível", `${formatNumber(meta.weightBalance.aircraft.fuelDensityKgPerL, 3)} kg/L`)}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700/70">
            <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Ponto</th>
                  <th className="px-3 py-2">Peso</th>
                  <th className="px-3 py-2">Momento</th>
                  <th className="px-3 py-2">Braço</th>
                  <th className="px-3 py-2">Envelope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {meta.weightBalance.results.points.map((point) => (
                  <tr key={point.id}>
                    <td className="px-3 py-2 text-slate-100">{point.label}</td>
                    <td className="px-3 py-2 text-slate-300">{formatNumber(point.weightKg)} kg</td>
                    <td className="px-3 py-2 text-slate-300">{formatNumber(point.momentKgMm)} kg.mm</td>
                    <td className="px-3 py-2 text-slate-300">{formatNumber(point.armMm)} mm</td>
                    <td className="px-3 py-2 text-slate-300">
                      {point.inEnvelope ? "OK" : point.inEnvelope === false ? "Fora" : "Incompleto"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-2">
        <MarkdownPreview label="Comentários" value={meta.risk.commentsMd} />
        <MarkdownPreview label="Perigos" value={meta.risk.dangerMd} />
        <MarkdownPreview label="Riscos" value={meta.risk.riskMd} />
        <MarkdownPreview label="Gerenciamento" value={meta.risk.managementMd} />
        <div className="lg:col-span-2">
          <MarkdownPreview label="Parecer do instrutor" value={meta.risk.instructorOpinionMd} />
        </div>
      </section>
    </div>
  );
}

function HistoryDetail({
  flightId,
  item,
  info,
  initialTab,
  onBack,
}: {
  flightId: string;
  item?: SavedFlightListItem;
  info?: FlightDisplayInfo;
  initialTab: HistoryDetailTab;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<HistoryDetailTab>(initialTab);
  const [meta, setMeta] = useState<FlightRecordMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [flightId, initialTab]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void getSavedFlight(flightId).then(({ data, error: loadError }) => {
      if (loadError || !data) {
        setError(loadError?.message ?? "Voo não encontrado.");
        setMeta(null);
      } else {
        setMeta(decodeFlightRecord(data.csv_text).meta);
      }
      setLoading(false);
    });
  }, [flightId]);

  return (
    <section className="space-y-3 rounded-2xl border border-sky-500/20 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Detalhe separado</p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">Voo selecionado</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="rounded border border-slate-700 bg-slate-950/40 px-2 py-1">
              {item ? formatDate(item, info) : "—"}
            </span>
            <span className="rounded border border-slate-700 bg-slate-950/40 px-2 py-1">
              {info?.aircraft ?? item?.aircraft_ident ?? "—"}
            </span>
            <span className="rounded border border-slate-700 bg-slate-950/40 px-2 py-1">
              {info?.instructorName || "Instrutor não informado"}
            </span>
          </div>
        </div>
        <button type="button" onClick={onBack} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          Fechar detalhe
        </button>
      </div>

      {item ? (
        <div className="grid gap-2 text-xs md:grid-cols-4">
          {field("Horário", info?.startTime || item.start_time)}
          {field("Pousos", info?.landings ?? 0)}
          {field("Tempo de voo", info?.totalFlight || (item.duration_sec ? formatMinutes(item.duration_sec / 60) : "—"))}
          {field("Trecho", info?.fromTo)}
        </div>
      ) : null}

      <Tabs items={HISTORY_DETAIL_TABS} value={tab} onChange={setTab} ariaLabel="Detalhe do histórico do aluno" accent="sky" />
      {loading ? (
        <p className="py-8 text-sm text-slate-500">Carregando ficha...</p>
      ) : error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-3 text-sm text-red-300">{error}</p>
      ) : tab === "telemetria" ? (
        <TelemetriaTab flightId={flightId} />
      ) : tab === "videos" ? (
        <VideosTab flightId={flightId} />
      ) : (
        <ReadOnlyFicha meta={meta} />
      )}
    </section>
  );
}

export function StudentFlightContextPanel({
  studentUserId,
  currentFlightId,
}: {
  studentUserId: string;
  currentFlightId?: string;
}) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PilotProfile | null>(null);
  const [history, setHistory] = useState<SavedFlightListItem[]>([]);
  const [historyInfoById, setHistoryInfoById] = useState<Record<string, FlightDisplayInfo>>({});
  const [creditStatement, setCreditStatement] = useState<StudentCreditStatement | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedHistoryTab, setSelectedHistoryTab] = useState<HistoryDetailTab>("ficha");
  const [isFlightReviewClubMember, setIsFlightReviewClubMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setCreditError(null);
    setHistoryInfoById({});
    setSelectedHistoryId(null);
    const [profileRes, historyRes, creditsRes, tracksRes] = await Promise.all([
      getProfile(studentUserId),
      listStudentFlightHistory({ actorUserId: user.id, actorRole: user.role, studentUserId }),
      getStudentCreditStatement({ viewer: { userId: user.id, role: user.role }, studentUserId })
        .then((data) => ({ data, error: null }))
        .catch((loadError) => ({ data: null, error: loadError as Error })),
      listStudentTrainingTracks(studentUserId),
    ]);
    setIsFlightReviewClubMember(hasActiveFlightReviewClubTrack(tracksRes.data));
    if (profileRes.error || historyRes.error) {
      setError(profileRes.error?.message ?? historyRes.error?.message ?? "Falha ao carregar aluno.");
      setProfile(null);
      setHistory([]);
    } else {
      setProfile(profileRes.data);
      setHistory(historyRes.data ?? []);
    }
    if (creditsRes.error) {
      setCreditStatement(null);
      setCreditError(creditsRes.error.message);
    } else {
      setCreditStatement(creditsRes.data);
    }
    setLoading(false);
  }, [studentUserId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const missing = history.filter((item) => item.id !== currentFlightId && !historyInfoById[item.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const infoById = await loadFullFlightListDisplayInfos(missing.slice(0, 30), { concurrency: 4 });
      if (!cancelled) {
        setHistoryInfoById((prev) => ({ ...prev, ...infoById }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentFlightId, history, historyInfoById]);

  const photoUrl = useMemo(() => {
    if (!profile?.anacPhotoFileId || !storage || !BUCKET_ID) return "";
    return storage.getFileView(BUCKET_ID, profile.anacPhotoFileId).toString();
  }, [profile?.anacPhotoFileId]);

  const contextFlights = useMemo(
    () =>
      history
        .filter((item) => item.id !== currentFlightId)
        .sort((a, b) => getDateBase(b, historyInfoById[b.id]).getTime() - getDateBase(a, historyInfoById[a.id]).getTime()),
    [currentFlightId, history, historyInfoById],
  );
  const completedFlights = useMemo(
    () => contextFlights.filter((item) => isCompletedFlight(item, historyInfoById[item.id])),
    [contextFlights, historyInfoById],
  );
  const futureFlights = useMemo(
    () =>
      contextFlights
        .filter((item) => isFutureFlight(item, historyInfoById[item.id]))
        .sort((a, b) => getFlightDateTimeMs(a, historyInfoById[a.id]) - getFlightDateTimeMs(b, historyInfoById[b.id])),
    [contextFlights, historyInfoById],
  );
  const totalMinutes = useMemo(
    () =>
      completedFlights.reduce((acc, item) => {
        const info = historyInfoById[item.id];
        if (info?.totalFlightMinutes) return acc + info.totalFlightMinutes;
        return acc + (typeof item.duration_sec === "number" ? Math.round(item.duration_sec / 60) : 0);
      }, 0),
    [completedFlights, historyInfoById],
  );
  const aircrafts = useMemo(
    () =>
      Array.from(
        new Set(
          contextFlights
            .map((item) => historyInfoById[item.id]?.aircraft ?? item.aircraft_ident)
            .filter((value): value is string => Boolean(value && value !== "—")),
        ),
      ),
    [contextFlights, historyInfoById],
  );

  const selectedHistoryItem = selectedHistoryId
    ? contextFlights.find((item) => item.id === selectedHistoryId) ?? null
    : null;

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        Carregando dados do aluno...
      </div>
    );
  }

  if (error) {
    return <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-3 text-sm text-red-300">{error}</p>;
  }

  if (!profile) {
    return <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-3 text-sm text-amber-200">Perfil do aluno não encontrado.</p>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="h-32 w-24 overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950/60">
            {photoUrl ? (
              <img src={photoUrl} alt="Foto do aluno ANAC" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-slate-500">Foto ANAC</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Aluno do voo</p>
            <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-lg font-semibold text-white">
              <span className="break-words [overflow-wrap:anywhere]">{profile.fullName || profile.email}</span>
              {isFlightReviewClubMember ? <FlightReviewClubBadge /> : null}
            </h3>
            <p className="mt-1 text-sm text-slate-500">Ficha consolidada do aluno, independente do voo aberto.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              {field("Voos no histórico", contextFlights.length)}
              {field("Horas registradas", formatMinutes(totalMinutes))}
              {field("Último voo realizado", completedFlights[0] ? formatDate(completedFlights[0], historyInfoById[completedFlights[0].id]) : "—")}
              {field("Próximo voo", futureFlights[0] ? formatDate(futureFlights[0], historyInfoById[futureFlights[0].id]) : "—")}
              {field("Aeronaves", aircrafts.length > 0 ? aircrafts.join(", ") : "—")}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {field("Nome completo", profile.fullName)}
        {field("E-mail", profile.email)}
        {field("Telefone", profile.phone)}
        {field("Código ANAC", profile.anacCode)}
        {field("CPF", profile.cpf)}
        {field("Nascimento", profile.birthDate)}
        {field("Peso (kg)", profile.weightKg)}
        {field("Altura (cm)", profile.heightCm)}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Habilitações</h3>
          {profile.anacRatings.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Nenhuma habilitação importada.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-slate-300">
              {profile.anacRatings.map((item, idx) => (
                <li key={`${item.habilitacao}-${idx}`} className="flex items-center justify-between gap-2">
                  <span>{item.habilitacao}</span>
                  <span className={isExpiredDate(item.validade) ? "text-xs text-red-400" : "text-xs text-slate-400"}>
                    {item.validade || "—"}{isExpiredDate(item.validade) ? " · vencida" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Licenças</h3>
          {profile.anacLicenses.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Nenhuma licença importada.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm text-slate-300">
              {profile.anacLicenses.map((item, idx) => (
                <li key={`${item.licenca}-${idx}`} className="flex items-center justify-between gap-2">
                  <span>{item.licenca}</span>
                  <span className="text-xs text-slate-400">{item.expedicao || "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200">CMA</h3>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <p><span className="text-slate-400">Classe:</span> {profile.anacMedical.classe || "—"}</p>
            <p>
              <span className="text-slate-400">Validade:</span>{" "}
              <span className={isExpiredDate(profile.anacMedical.validade) ? "text-red-400" : ""}>
                {profile.anacMedical.validade || "—"}{isExpiredDate(profile.anacMedical.validade) ? " · vencida" : ""}
              </span>
            </p>
            <p><span className="text-slate-400">Órgão:</span> {profile.anacMedical.orgao_expedidor || "—"}</p>
          </div>
        </div>
      </section>

      {(user?.role === "admin" || user?.role === "instrutor") ? (
        <StudentObservationsSection
          studentUserId={studentUserId}
          currentUser={{ id: user.id, name: user.name || user.email, role: user.role }}
        />
      ) : null}

      {creditStatement ? (
        <CreditStatementView
          statement={creditStatement}
          title="Créditos do aluno"
          description="Extrato financeiro-operacional do aluno para consulta do INVA."
          compact
        />
      ) : creditError ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-3 text-sm text-amber-200">
          Não foi possível carregar os créditos do aluno: {creditError}
        </p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Fichas e telemetria do aluno</p>
            <p className="text-xs text-slate-600">Mostrando todos os voos vinculados ao aluno, exceto o voo atual.</p>
          </div>
          {contextFlights.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum outro voo encontrado para este aluno.</p>
          ) : (
            <div className="space-y-3">
              {contextFlights.slice(0, 30).map((item) => {
                const info = historyInfoById[item.id] ?? buildFlightDisplayInfo(item, null);
                const future = isFutureFlight(item, info);
                const selected = selectedHistoryId === item.id;
                const totalLabel = info.totalFlight !== "00:00"
                  ? info.totalFlight
                  : item.duration_sec
                    ? formatMinutes(item.duration_sec / 60)
                    : "sem horas";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedHistoryId(item.id);
                      setSelectedHistoryTab("ficha");
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selected
                        ? "border-sky-500/60 bg-sky-500/10"
                        : "border-slate-700/60 bg-slate-950/30 hover:border-sky-700/60 hover:bg-slate-900/70"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {future ? (
                            <span className="rounded border border-violet-600/40 bg-violet-900/30 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200">
                              Futuro
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
                          <p>Data: <span className="text-slate-300">{formatDate(item, info)}</span></p>
                          <p>Aeronave: <span className="text-slate-300">{info.aircraft}</span></p>
                          <p>Instrutor: <span className="text-slate-300">{info.instructorName || "—"}</span></p>
                          <p>Pousos: <span className="text-slate-300">{info.landings ?? 0}</span></p>
                          <p>Tempo: <span className="text-slate-300">{totalLabel}</span></p>
                          <p>Trecho: <span className="text-slate-300">{info.fromTo}</span></p>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-medium text-sky-400">
                      {selected ? "Carregado no detalhe" : "Clique para abrir este voo"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedHistoryId ? (
          <HistoryDetail
            flightId={selectedHistoryId}
            item={selectedHistoryItem ?? undefined}
            info={selectedHistoryId ? historyInfoById[selectedHistoryId] : undefined}
            initialTab={selectedHistoryTab}
            onBack={() => setSelectedHistoryId(null)}
          />
        ) : (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/20 p-6 text-center">
            <div>
              <p className="text-sm font-medium text-slate-300">Selecione um voo</p>
              <p className="mt-1 text-xs text-slate-600">O detalhe abre separado da lista para não misturar os conteúdos.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
