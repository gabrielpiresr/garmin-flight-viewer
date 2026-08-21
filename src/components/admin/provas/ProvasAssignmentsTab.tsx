import { useCallback, useEffect, useMemo, useState } from "react";
import { searchFlightPickerUsers } from "../../../lib/adminUsersDb";
import { listProvas } from "../../../lib/provasDb";
import {
  createProvaJourneyRequirement,
  deleteProvaJourneyRequirement,
  listProvaJourneyRequirements,
  updateProvaJourneyRequirement,
} from "../../../lib/provasJourneyDb";
import { getAdminProvaAttempt, listProvaAssignments, releaseProva } from "../../../lib/provasStudentDb";
import { listTrainingTracks } from "../../../lib/trainingTracksDb";
import type { AdminUserSummary } from "../../../types/adminUsers";
import type { ProvaAssignment, ProvaAttempt, ProvaBankCard, ProvaJourneyRequirement } from "../../../types/provas";
import type { StudentIdentity } from "../../../types/schedule";
import type { TrainingMission, TrainingStage, TrainingTrack } from "../../../types/trainingTrack";
import { Skeleton } from "../../ui/Skeleton";
import { useToast } from "../../ui/ToastProvider";
import { ProvaResultView } from "../../provas/ProvaResultView";
import { StudentSearchSelect } from "../StudentSearchSelect";

function statusLabel(status: ProvaAssignment["status"]) {
  if (status === "submitted") return "Realizada";
  if (status === "in_progress") return "Em andamento";
  if (status === "expired") return "Expirada";
  return "Aguardando";
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function hoursLabel(hours: number) {
  const safe = Math.max(1, Math.round(hours) || 1);
  return safe === 1 ? "1 hora após iniciar" : `${safe} horas após iniciar`;
}

function prazoLabel(row: ProvaAssignment) {
  if (row.status === "pending") return hoursLabel(row.timeLimitHours);
  if (row.status === "in_progress") return `Até ${formatWhen(row.expiresAt)}`;
  return formatWhen(row.expiresAt);
}

function toStudentIdentity(user: AdminUserSummary): StudentIdentity {
  return {
    userId: user.userId,
    label: user.name || user.email || user.userId,
    nickname: user.profile?.nickname || null,
    email: user.email || null,
    anacCode: user.profile?.anacCode || null,
    weightKg: null,
    heightCm: null,
  };
}

function flattenTrackMissions(track: TrainingTrack | null): Array<{ stage: TrainingStage; mission: TrainingMission; index: number }> {
  if (!track) return [];
  let index = 0;
  return track.stages.flatMap((stage) =>
    stage.missions.map((mission) => ({
      stage,
      mission,
      index: index++,
    })),
  );
}

function requirementInputFromRow(row: ProvaJourneyRequirement) {
  return {
    schoolId: row.schoolId,
    provaId: row.provaId,
    provaTitle: row.provaTitle,
    trackId: row.trackId,
    trackName: row.trackName,
    startMissionId: row.startMissionId,
    startMissionName: row.startMissionName,
    endMissionId: row.endMissionId,
    endMissionName: row.endMissionName,
    requiredToAdvance: row.requiredToAdvance,
    isActive: row.isActive,
  };
}

export function ProvasAssignmentsTab() {
  const { showToast } = useToast();
  const [provas, setProvas] = useState<ProvaBankCard[]>([]);
  const [assignments, setAssignments] = useState<ProvaAssignment[]>([]);
  const [journeyRequirements, setJourneyRequirements] = useState<ProvaJourneyRequirement[]>([]);
  const [tracks, setTracks] = useState<TrainingTrack[]>([]);
  const [students, setStudents] = useState<StudentIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [provaId, setProvaId] = useState("");
  const [journeyProvaId, setJourneyProvaId] = useState("");
  const [journeyTrackId, setJourneyTrackId] = useState("");
  const [startMissionId, setStartMissionId] = useState("");
  const [endMissionId, setEndMissionId] = useState("");
  const [requiredToAdvance, setRequiredToAdvance] = useState(true);
  const [journeySaving, setJourneySaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StudentIdentity[]>([]);
  const [releasing, setReleasing] = useState(false);
  const [review, setReview] = useState<{ attempt: ProvaAttempt; passingPercent: number } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);

  const published = useMemo(() => provas.filter((p) => p.status === "published"), [provas]);
  const selectedJourneyTrack = useMemo(
    () => tracks.find((track) => track.id === journeyTrackId) ?? null,
    [journeyTrackId, tracks],
  );
  const journeyMissionOptions = useMemo(() => flattenTrackMissions(selectedJourneyTrack), [selectedJourneyTrack]);
  const selectedIds = useMemo(() => new Set(selected.map((row) => row.userId)), [selected]);
  const availableStudents = useMemo(
    () => students.filter((student) => !selectedIds.has(student.userId)),
    [students, selectedIds],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bank, rows, links, trackList] = await Promise.all([
        listProvas(),
        listProvaAssignments(),
        listProvaJourneyRequirements({ includeInactive: true }),
        listTrainingTracks({ includeInactive: true }),
      ]);
      setProvas(bank.data);
      setAssignments(rows);
      setJourneyRequirements(links.data);
      setTracks(trackList.data);
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar as liberações." });
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!journeyProvaId && published[0]) setJourneyProvaId(published[0].id);
  }, [journeyProvaId, published]);

  useEffect(() => {
    if (!journeyTrackId && tracks[0]) setJourneyTrackId(tracks[0].id);
  }, [journeyTrackId, tracks]);

  useEffect(() => {
    if (journeyMissionOptions.length === 0) {
      if (startMissionId) setStartMissionId("");
      if (endMissionId) setEndMissionId("");
      return;
    }
    const hasStart = journeyMissionOptions.some((row) => row.mission.id === startMissionId);
    const hasEnd = journeyMissionOptions.some((row) => row.mission.id === endMissionId);
    if (!hasStart) setStartMissionId(journeyMissionOptions[0]?.mission.id ?? "");
    if (!hasEnd) setEndMissionId(journeyMissionOptions[journeyMissionOptions.length - 1]?.mission.id ?? "");
  }, [endMissionId, journeyMissionOptions, startMissionId]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setPickerLoading(true);
      void searchFlightPickerUsers({ role: "aluno", search: pickerQuery.trim(), limit: 20 })
        .then((users) => {
          if (!cancelled) setStudents(users.map(toStudentIdentity));
        })
        .catch(() => {
          if (!cancelled) setStudents([]);
        })
        .finally(() => {
          if (!cancelled) setPickerLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [pickerQuery]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments.filter((row) => {
      if (provaId && row.provaId !== provaId) return false;
      if (!q) return true;
      return `${row.studentName} ${row.provaTitle}`.toLowerCase().includes(q);
    });
  }, [assignments, provaId, search]);

  function addStudent(student: StudentIdentity) {
    setSelected((prev) => (prev.some((row) => row.userId === student.userId) ? prev : [...prev, student]));
    setPickerQuery("");
    setPickerKey((key) => key + 1);
  }

  function removeStudent(userId: string) {
    setSelected((prev) => prev.filter((row) => row.userId !== userId));
  }

  async function handleRelease() {
    if (!provaId) {
      showToast({ variant: "error", message: "Escolha uma prova publicada." });
      return;
    }
    if (!selected.length) {
      showToast({ variant: "error", message: "Escolha pelo menos um aluno." });
      return;
    }
    setReleasing(true);
    try {
      const count = await releaseProva(provaId, selected.map((row) => row.userId));
      showToast({
        variant: "success",
        message: count === 1 ? "1 liberação criada." : `${count} liberações criadas.`,
      });
      setSelected([]);
      setPickerKey((key) => key + 1);
      await load();
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao liberar." });
    }
    setReleasing(false);
  }

  async function handleCreateJourneyRequirement() {
    const prova = published.find((row) => row.id === journeyProvaId);
    const track = selectedJourneyTrack;
    const start = journeyMissionOptions.find((row) => row.mission.id === startMissionId);
    const end = journeyMissionOptions.find((row) => row.mission.id === endMissionId);
    if (!prova || !track || !start || !end) {
      showToast({ variant: "error", message: "Escolha uma prova, uma trilha e o período de missões." });
      return;
    }
    if (end.index < start.index) {
      showToast({ variant: "error", message: "A missão final precisa vir depois da missão inicial." });
      return;
    }
    setJourneySaving(true);
    try {
      const result = await createProvaJourneyRequirement({
        provaId: prova.id,
        provaTitle: prova.title,
        trackId: track.id,
        trackName: track.name,
        startMissionId: start.mission.id,
        startMissionName: start.mission.name,
        endMissionId: end.mission.id,
        endMissionName: end.mission.name,
        requiredToAdvance,
        isActive: true,
      });
      if (result.error) throw result.error;
      showToast({ variant: "success", message: "Prova vinculada à jornada." });
      await load();
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao vincular prova." });
    }
    setJourneySaving(false);
  }

  async function toggleJourneyRequirement(row: ProvaJourneyRequirement) {
    try {
      const result = await updateProvaJourneyRequirement(row.id, {
        ...requirementInputFromRow(row),
        isActive: !row.isActive,
      });
      if (result.error) throw result.error;
      await load();
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao atualizar vínculo." });
    }
  }

  async function removeJourneyRequirement(row: ProvaJourneyRequirement) {
    const ok = window.confirm(`Remover o vínculo da prova "${row.provaTitle}" com a jornada?`);
    if (!ok) return;
    try {
      const result = await deleteProvaJourneyRequirement(row.id);
      if (result.error) throw result.error;
      showToast({ variant: "success", message: "Vínculo removido." });
      await load();
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao remover vínculo." });
    }
  }

  if (review) {
    return (
      <ProvaResultView
        attempt={review.attempt}
        passingPercent={review.passingPercent}
        onBack={() => setReview(null)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Liberações</p>
        <h2 className="text-xl font-semibold text-slate-100">Liberar prova para alunos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cada liberação permite uma tentativa. O tempo para realizar começa quando o aluno inicia a prova.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)_auto] lg:items-end">
          <label className="text-xs text-slate-400">
            Prova
            <select
              value={provaId}
              onChange={(e) => setProvaId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500"
            >
              <option value="">Selecione</option>
              {published.map((prova) => (
                <option key={prova.id} value={prova.id}>
                  {prova.title}
                </option>
              ))}
            </select>
          </label>
          <StudentSearchSelect
            key={pickerKey}
            label="Aluno"
            students={availableStudents}
            value=""
            onChange={addStudent}
            disableLocalFilter
            loading={pickerLoading}
            onQueryChange={setPickerQuery}
            className="block"
          />
          <button
            type="button"
            disabled={releasing}
            onClick={() => void handleRelease()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {releasing ? "Liberando..." : `Liberar (${selected.length})`}
          </button>
        </div>

        {selected.length ? (
          <div className="flex flex-wrap gap-2">
            {selected.map((student) => (
              <span
                key={student.userId}
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-200"
              >
                <span className="font-medium">{student.nickname || student.label}</span>
                {student.email ? <span className="text-slate-500">{student.email}</span> : null}
                <button
                  type="button"
                  onClick={() => removeStudent(student.userId)}
                  className="text-slate-500 hover:text-slate-200"
                  aria-label={`Remover ${student.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Pesquise e selecione os alunos que devem receber a prova.</p>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-400/80">Jornada</p>
          <h3 className="text-lg font-semibold text-slate-100">Vincular prova à trilha</h3>
          <p className="mt-1 text-sm text-slate-500">
            O aluno verá a prova no ponto certo da formação. Quando marcada como obrigatória, ela trava o avanço visual após a missão final até ser concluída.
          </p>
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(12rem,18rem)_minmax(12rem,18rem)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] xl:items-end">
          <label className="text-xs text-slate-400">
            Prova
            <select
              value={journeyProvaId}
              onChange={(e) => setJourneyProvaId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500"
            >
              {published.map((prova) => (
                <option key={prova.id} value={prova.id}>
                  {prova.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Trilha
            <select
              value={journeyTrackId}
              onChange={(e) => {
                setJourneyTrackId(e.target.value);
                setStartMissionId("");
                setEndMissionId("");
              }}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500"
            >
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            De
            <select
              value={startMissionId}
              onChange={(e) => setStartMissionId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500"
            >
              {journeyMissionOptions.map((row) => (
                <option key={row.mission.id} value={row.mission.id}>
                  {row.index + 1}. {row.stage.name} · {row.mission.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Até
            <select
              value={endMissionId}
              onChange={(e) => setEndMissionId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-violet-500"
            >
              {journeyMissionOptions.map((row) => (
                <option key={row.mission.id} value={row.mission.id}>
                  {row.index + 1}. {row.stage.name} · {row.mission.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={journeySaving || !published.length || !tracks.length || !journeyMissionOptions.length}
            onClick={() => void handleCreateJourneyRequirement()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
          >
            {journeySaving ? "Vinculando..." : "Vincular"}
          </button>
        </div>
        <label className="flex w-fit items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={requiredToAdvance}
            onChange={(e) => setRequiredToAdvance(e.target.checked)}
          />
          Obrigatória para avançar após a missão final
        </label>
        {journeyRequirements.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Prova</th>
                  <th className="px-3 py-2">Trilha</th>
                  <th className="px-3 py-2">Período</th>
                  <th className="px-3 py-2">Regra</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {journeyRequirements.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-100">{row.provaTitle}</td>
                    <td className="px-3 py-2 text-slate-300">{row.trackName}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {row.startMissionName} até {row.endMissionName}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {row.requiredToAdvance ? "Obrigatória" : "Informativa"} · {row.isActive ? "Ativa" : "Inativa"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void toggleJourneyRequirement(row)}
                        className="mr-3 text-xs font-semibold text-sky-300"
                      >
                        {row.isActive ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeJourneyRequirement(row)}
                        className="text-xs font-semibold text-rose-300"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-500">
            Nenhuma prova vinculada à jornada ainda.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar liberações"
          className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
      </div>

      {loading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Aluno</th>
                <th className="px-3 py-2">Prova</th>
                <th className="px-3 py-2">Prazo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Nota</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-slate-100">{row.studentName || row.studentUserId}</td>
                  <td className="px-3 py-2 text-slate-300">{row.provaTitle}</td>
                  <td className="px-3 py-2 text-slate-400">{prazoLabel(row)}</td>
                  <td className="px-3 py-2 text-slate-300">{statusLabel(row.status)}</td>
                  <td className="px-3 py-2">
                    {row.scorePercent == null ? "—" : `${row.scorePercent.toFixed(0)}% ${row.passed ? "· Aprovado" : "· Reprovado"}`}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.attemptId && (row.status === "submitted" || row.status === "expired") ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-sky-300"
                        onClick={async () => {
                          try {
                            const attempt = await getAdminProvaAttempt(row.attemptId!);
                            setReview({ attempt, passingPercent: row.passingPercent });
                          } catch (error) {
                            showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao abrir." });
                          }
                        }}
                      >
                        Ver correção
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    Nenhuma liberação ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
