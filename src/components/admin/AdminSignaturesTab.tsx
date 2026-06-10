import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getSavedFlight,
} from "../../lib/flightsDb";
import {
  listAllFlightsForAdminSignatures,
  signFlight,
  type PendingAdminSignatureRow,
} from "../../lib/flightSignaturesDb";
import { listProfileSummariesByUserIds, type PilotProfileSummary } from "../../lib/rbac";
import { decodeFlightRecord, type FlightRecordMeta } from "../../lib/flightRecordCodec";

type FilterType = "pending" | "signed" | "all";

const DEADLINE_BADGE: Record<PendingAdminSignatureRow["deadlineStatus"], { label: string; cls: string }> = {
  ok: { label: "Dentro do prazo", cls: "bg-emerald-900/40 text-emerald-400 border-emerald-600/40" },
  warning: { label: "Vence em breve", cls: "bg-amber-900/40 text-amber-400 border-amber-600/40" },
  overdue: { label: "Vencido", cls: "bg-red-900/40 text-red-400 border-red-600/40" },
  unknown: { label: "Sem data", cls: "bg-slate-800 text-slate-400 border-slate-600/40" },
};

function daysElapsedLabel(instructorSignedAt: string | null): string {
  if (!instructorSignedAt) return "—";
  const ms = Date.now() - new Date(instructorSignedAt).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "Hoje";
  if (days === 1) return "1 dia atrás";
  return `${days} dias atrás`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">{title}</p>
      <div className="rounded-xl border border-slate-700/60 bg-slate-950/30 p-3">{children}</div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">{children}</div>;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <p className="text-slate-400">
      {label}: <span className="text-slate-200">{value || "—"}</span>
    </p>
  );
}

function MarkdownField({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-0.5 text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="whitespace-pre-wrap break-words text-xs text-slate-300 [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

function SignBadge({ label, signed }: { label: string; signed: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        signed ? "bg-emerald-900/40 text-emerald-400" : "bg-slate-800 text-slate-500"
      }`}
    >
      {signed ? "✓ " : "– "}
      {label}
    </span>
  );
}

export function AdminSignaturesTab() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterType>("pending");
  const [items, setItems] = useState<PendingAdminSignatureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, PilotProfileSummary>>({});

  // Detail modal state
  const [detailRow, setDetailRow] = useState<PendingAdminSignatureRow | null>(null);
  const [detailMeta, setDetailMeta] = useState<FlightRecordMeta | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Signing state
  const [signingRow, setSigningRow] = useState<PendingAdminSignatureRow | null>(null);
  const [signingConfirmed, setSigningConfirmed] = useState(false);
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [signingSuccess, setSigningSuccess] = useState<string | null>(null);
  const [signingPassword, setSigningPassword] = useState("");

  const loadItems = useCallback(
    async (cursor?: string | null) => {
      if (!user) return;
      if (!cursor) setLoading(true);
      else setLoadingMore(true);
      const res = await listAllFlightsForAdminSignatures({
        actorRole: user.role,
        filter,
        limit: 50,
        cursor: cursor ?? null,
      });
      if (!cursor) setLoading(false);
      else setLoadingMore(false);
      if (res.error || !res.data) return;
      if (!cursor) {
        setItems(res.data);
      } else {
        setItems((prev) => [...prev, ...res.data!]);
      }
      setNextCursor(res.nextCursor);

      // Load profiles
      const userIds = res.data.flatMap((r) => [r.student_user_id, r.instructor_user_id].filter(Boolean) as string[]);
      if (userIds.length > 0) {
        const profiles = await listProfileSummariesByUserIds(userIds);
        setProfileMap((prev) => ({ ...prev, ...profiles }));
      }
    },
    [user, filter],
  );

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  function openSignModal(row: PendingAdminSignatureRow) {
    setSigningRow(row);
    setSigningConfirmed(false);
    setSigningError(null);
    setSigningSuccess(null);
    setSigningPassword("");
  }

  function closeSignModal() {
    setSigningRow(null);
    setSigningConfirmed(false);
    setSigningError(null);
    setSigningPassword("");
  }

  async function openDetailModal(row: PendingAdminSignatureRow) {
    setDetailRow(row);
    setDetailMeta(null);
    setDetailError(null);
    setDetailLoading(true);
    const res = await getSavedFlight(row.id);
    setDetailLoading(false);
    if (res.error || !res.data) {
      setDetailError(res.error?.message ?? "Voo não encontrado.");
      return;
    }
    const { meta } = decodeFlightRecord(res.data.csv_text);
    setDetailMeta(meta);
  }

  function closeDetailModal() {
    setDetailRow(null);
    setDetailMeta(null);
    setDetailError(null);
  }

  async function handleSign() {
    if (!user || !signingRow || !signingConfirmed) return;
    if (!signingPassword) {
      setSigningError("Informe sua senha para assinar.");
      return;
    }
    setSigningInProgress(true);
    setSigningError(null);
    const passwordForSigning = signingPassword;
    setSigningPassword("");

    const flightRes = await getSavedFlight(signingRow.id);
    if (flightRes.error || !flightRes.data) {
      setSigningError(flightRes.error?.message ?? "Voo não encontrado.");
      setSigningInProgress(false);
      return;
    }

    const res = await signFlight({
      flightId: signingRow.id,
      actorUserId: user.id,
      actorRole: user.role,
      signerRole: "admin_operator",
      csvText: flightRes.data.csv_text,
      password: passwordForSigning,
    });

    setSigningInProgress(false);
    if (res.error) {
      setSigningError(res.error.message);
      return;
    }

    setSigningSuccess("Voo assinado com sucesso!");
    setItems((prev) =>
      filter === "pending"
        ? prev.filter((i) => i.id !== signingRow.id)
        : prev.map((i) =>
            i.id === signingRow.id ? { ...i, admin_operator_signed: true, deadlineStatus: i.deadlineStatus } : i,
          ),
    );
    setTimeout(() => {
      closeSignModal();
      setSigningSuccess(null);
    }, 1500);
  }

  const pendingCount = items.filter((i) => !i.admin_operator_signed).length;
  const warnCount = items.filter((i) => !i.admin_operator_signed && i.deadlineStatus === "warning").length;
  const overdueCount = items.filter((i) => !i.admin_operator_signed && i.deadlineStatus === "overdue").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="mt-0.5 text-sm text-slate-400">
          Fichas de voo assinadas pelo instrutor aguardando assinatura do operador (prazo: 15 dias)
        </p>
      </div>

      {/* Stats */}
      {filter !== "signed" && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Pendentes</p>
            <p className="mt-1 text-2xl font-bold text-slate-100">{pendingCount}</p>
          </div>
          <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500">Vencendo</p>
            <p className="mt-1 text-2xl font-bold text-amber-400">{warnCount}</p>
          </div>
          <div className="rounded-xl border border-red-700/30 bg-red-950/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-red-500">Vencidos</p>
            <p className="mt-1 text-2xl font-bold text-red-400">{overdueCount}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {(["pending", "all", "signed"] as FilterType[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              filter === f
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {f === "pending" ? "Pendentes" : f === "signed" ? "Assinados" : "Todos"}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-800/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/30 py-16 text-center">
          <p className="text-sm text-slate-400">
            {filter === "pending" ? "Nenhum voo pendente de assinatura." : "Nenhum voo encontrado."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/60">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-700/60 bg-slate-900/60">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Data</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Aeronave</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Aluno</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Instrutor assinou</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Prazo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((row) => {
                const student = row.student_user_id ? profileMap[row.student_user_id] : null;
                const { label: deadlineLabel, cls: deadlineCls } = DEADLINE_BADGE[row.deadlineStatus];
                const dateStr = row.flight_date
                  ? new Date(row.flight_date).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                  : "—";
                return (
                  <tr key={row.id} className="bg-slate-950/40 hover:bg-slate-900/60 transition-colors">
                    <td className="px-4 py-3 text-slate-300">{dateStr}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{row.aircraft_ident ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {student?.fullName || row.student_user_id?.slice(0, 8) || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{daysElapsedLabel(row.instructor_signed_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold ${deadlineCls}`}>
                        {deadlineLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <SignBadge label="Aluno" signed={row.student_signed} />
                        <SignBadge label="Instrutor" signed={row.instructor_signed} />
                        <SignBadge label="Operador" signed={row.admin_operator_signed} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openDetailModal(row)}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
                        >
                          Detalhes
                        </button>
                        {row.admin_operator_signed ? (
                          <span className="text-xs text-emerald-500">✓ Assinado</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openSignModal(row)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition"
                          >
                            Assinar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadItems(nextCursor)}
            disabled={loadingMore}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 disabled:opacity-60"
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      )}

      {/* Detail modal */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/85 px-4 py-6 sm:items-center">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-700/60 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Ficha do voo</p>
                <h3 className="text-base font-semibold text-slate-100">
                  {detailRow.flight_date
                    ? new Date(detailRow.flight_date).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                    : "—"}
                  {detailRow.aircraft_ident ? ` — ${detailRow.aircraft_ident}` : ""}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDetailModal}
                className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>

            {/* Scrollable body */}
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {detailLoading && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/60" />
                  ))}
                </div>
              )}

              {detailError && (
                <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-sm text-red-400">
                  {detailError}
                </p>
              )}

              {detailMeta && (
                <>
                  {/* Cabeçalho */}
                  <Section title="Cabeçalho">
                    <Grid2>
                      <Field label="Data" value={detailMeta.header.date} />
                      <Field label="Aeronave" value={detailMeta.header.aircraft} />
                      <Field label="Aluno" value={detailMeta.header.studentName ?? detailMeta.header.studentLabel} />
                      <Field label="ANAC aluno" value={detailMeta.header.studentAnac} />
                      <Field label="Instrutor" value={detailMeta.header.instructorName} />
                      <Field label="ANAC instrutor" value={detailMeta.header.instructorAnac} />
                      {detailMeta.header.startTime ? <Field label="Início" value={detailMeta.header.startTime} /> : null}
                      {detailMeta.header.flightNature ? <Field label="Natureza" value={detailMeta.header.flightNature} /> : null}
                      {detailMeta.header.flightSeqNumber != null ? (
                        <Field label="Nº sequencial" value={String(detailMeta.header.flightSeqNumber)} />
                      ) : null}
                      {detailMeta.header.isNight ? <Field label="Noturno" value="Sim" /> : null}
                    </Grid2>
                  </Section>

                  {/* Assinaturas */}
                  <Section title="Assinaturas">
                    <div className="flex flex-wrap gap-2">
                      <SignBadge label="Aluno" signed={detailRow.student_signed} />
                      <SignBadge label="Instrutor" signed={detailRow.instructor_signed} />
                      <SignBadge label="Operador" signed={detailRow.admin_operator_signed} />
                    </div>
                    {detailRow.instructor_signed_at ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Instrutor assinou em:{" "}
                        <span className="text-slate-300">
                          {new Date(detailRow.instructor_signed_at).toLocaleString("pt-BR")}
                        </span>
                      </p>
                    ) : null}
                  </Section>

                  {/* Pré-voo */}
                  <Section title="Pré-voo">
                    <MarkdownField label="Objetivo" value={detailMeta.preFlight.objectiveMd} />
                    <MarkdownField label="Briefing" value={detailMeta.preFlight.briefingMd} />
                    {detailMeta.preFlight.instructorSuggestionMd ? (
                      <MarkdownField label="Sugestão do instrutor" value={detailMeta.preFlight.instructorSuggestionMd} />
                    ) : null}
                    {detailMeta.preFlight.studentSuggestionMd ? (
                      <MarkdownField label="Sugestão do aluno" value={detailMeta.preFlight.studentSuggestionMd} />
                    ) : null}
                  </Section>

                  {/* Percursos */}
                  {detailMeta.legs.length > 0 && (
                    <Section title="Percursos">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] text-xs">
                          <thead>
                            <tr className="border-b border-slate-700/60 text-[10px] uppercase tracking-wider text-slate-500">
                              <th className="py-1.5 pr-3 text-left font-semibold">Dep.</th>
                              <th className="py-1.5 pr-3 text-left font-semibold">Arr.</th>
                              <th className="py-1.5 pr-3 text-left font-semibold">Pousos</th>
                              <th className="py-1.5 pr-3 text-left font-semibold">Tempo voo</th>
                              <th className="py-1.5 pr-3 text-left font-semibold">Tempo nav.</th>
                              <th className="py-1.5 pr-3 text-left font-semibold">Noturno</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {detailMeta.legs.map((leg) => (
                              <tr key={leg.id} className="text-slate-300">
                                <td className="py-1.5 pr-3">{leg.dep || "—"}</td>
                                <td className="py-1.5 pr-3">{leg.arr || "—"}</td>
                                <td className="py-1.5 pr-3">{leg.landings}</td>
                                <td className="py-1.5 pr-3">{leg.flightTime || "—"}</td>
                                <td className="py-1.5 pr-3">{leg.navTime || "—"}</td>
                                <td className="py-1.5 pr-3">{leg.nightTime || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Section>
                  )}

                  {/* Exercícios */}
                  {detailMeta.exercises && detailMeta.exercises.length > 0 && (
                    <Section title="Critérios avaliados">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[320px] text-xs">
                          <thead>
                            <tr className="border-b border-slate-700/60 text-[10px] uppercase tracking-wider text-slate-500">
                              <th className="py-1.5 pr-3 text-left font-semibold">Critério</th>
                              <th className="py-1.5 pr-3 text-left font-semibold">Nota</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {detailMeta.exercises
                              .slice()
                              .sort((a, b) => a.order - b.order)
                              .map((ex) => (
                                <tr key={ex.exerciseId} className="text-slate-300">
                                  <td className="py-1.5 pr-3">{ex.title || ex.exerciseId}</td>
                                  <td className="py-1.5 pr-3">{ex.grade ?? "—"}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </Section>
                  )}

                  {/* Peso e balanceamento */}
                  {detailMeta.weightBalance && (
                    <Section title="Peso e balanceamento">
                      <Grid2>
                        <Field label="Aeronave" value={detailMeta.weightBalance.aircraft.registration} />
                        {detailMeta.weightBalance.inputs.occupantsWeightKg != null ? (
                          <Field label="Ocupantes (kg)" value={String(detailMeta.weightBalance.inputs.occupantsWeightKg)} />
                        ) : null}
                        {detailMeta.weightBalance.inputs.baggageWeightKg != null ? (
                          <Field label="Bagagem (kg)" value={String(detailMeta.weightBalance.inputs.baggageWeightKg)} />
                        ) : null}
                        {detailMeta.weightBalance.inputs.rampFuel.value != null ? (
                          <Field
                            label="Combustível rampa"
                            value={`${detailMeta.weightBalance.inputs.rampFuel.value} ${detailMeta.weightBalance.inputs.rampFuel.unit}`}
                          />
                        ) : null}
                        <Field
                          label="Dentro da envelope"
                          value={detailMeta.weightBalance.results.isWithinLimits ? "Sim" : "Não"}
                        />
                      </Grid2>
                    </Section>
                  )}

                  {/* Diário técnico */}
                  {detailMeta.technicalLog && (
                    <Section title="Diário técnico (ANAC Res. 457)">
                      <MarkdownField label="Ocorrências" value={detailMeta.technicalLog.occurrences} />
                      <MarkdownField label="Discrepâncias" value={detailMeta.technicalLog.discrepancies} />
                      <Field
                        label="Detectado por"
                        value={detailMeta.header.instructorName || detailMeta.header.instructorAnac || "Instrutor"}
                      />
                      <MarkdownField label="Ações corretivas" value={detailMeta.technicalLog.correctiveActions} />
                    </Section>
                  )}

                  {/* Análise de risco */}
                  <Section title="Análise de risco">
                    <MarkdownField label="Comentários" value={detailMeta.risk.commentsMd} />
                    <MarkdownField label="Perigos identificados" value={detailMeta.risk.dangerMd} />
                    <MarkdownField label="Análise de risco" value={detailMeta.risk.riskMd} />
                    <MarkdownField label="Gerenciamento" value={detailMeta.risk.managementMd} />
                    <MarkdownField label="Opinião do instrutor" value={detailMeta.risk.instructorOpinionMd} />
                  </Section>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sign modal */}
      {signingRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-8 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100">Confirmar assinatura como operador</h3>

            {signingSuccess ? (
              <div className="mt-4 rounded-lg border border-emerald-600/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-400">
                {signingSuccess}
              </div>
            ) : (
              <>
                <div className="mt-3 space-y-1 rounded-lg border border-slate-700/60 bg-slate-950/40 p-3 text-sm">
                  <p className="text-slate-300">
                    <span className="text-slate-500">Voo:</span>{" "}
                    {signingRow.flight_date
                      ? new Date(signingRow.flight_date).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                      : "—"}
                    {signingRow.aircraft_ident ? ` — ${signingRow.aircraft_ident}` : ""}
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-500">Aluno:</span>{" "}
                    {signingRow.student_user_id
                      ? (profileMap[signingRow.student_user_id]?.fullName ?? signingRow.student_user_id.slice(0, 8))
                      : "—"}
                  </p>
                  <p className="text-slate-300">
                    <span className="text-slate-500">Prazo:</span>{" "}
                    <span className={`font-medium ${
                      signingRow.deadlineStatus === "overdue" ? "text-red-400" :
                      signingRow.deadlineStatus === "warning" ? "text-amber-400" : "text-emerald-400"
                    }`}>
                      {DEADLINE_BADGE[signingRow.deadlineStatus].label}
                    </span>
                  </p>
                </div>

                <p className="mt-3 text-sm text-slate-400">
                  Ao assinar, você atesta como operador que revisou a ficha deste voo.
                  Esta ação é registrada com seu usuário, data/hora e será associada ao conteúdo atual da ficha.
                </p>

                <label className="mt-4 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={signingConfirmed}
                    onChange={(e) => setSigningConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 accent-emerald-500"
                  />
                  <span className="text-sm text-slate-300">Confirmo que revisei a ficha deste voo</span>
                </label>

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
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                    {signingError}
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeSignModal}
                    disabled={signingInProgress}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSign()}
                    disabled={!signingConfirmed || signingInProgress || !signingPassword}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition"
                  >
                    {signingInProgress ? "Assinando..." : "Confirmar assinatura"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
