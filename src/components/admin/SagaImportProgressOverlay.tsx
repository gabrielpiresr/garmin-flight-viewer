import { useEffect, useMemo, useState } from "react";
import type { SagaImportCatalogs, SagaImportPendingMission, SagaImportProgress } from "../../lib/sagaImportDb";

type Props = {
  active: boolean;
  awaitingMission?: boolean;
  modeLabel: string;
  importProgress: SagaImportProgress | null;
  importStartedAt: number | null;
  progressTick: number;
  catalogs: SagaImportCatalogs;
  pendingMission: SagaImportPendingMission | null;
  onConfirmMission: (missionId: string) => void;
};

function missionOptionsForTrack(catalogs: SagaImportCatalogs, trainingTrackId: string) {
  const track = catalogs.trainingTracks.find((row) => row.id === trainingTrackId);
  if (!track || !Array.isArray(track.stages)) return [];
  const options: Array<{ value: string; label: string }> = [];
  for (const stage of track.stages) {
    const stageName = typeof stage === "object" && stage && "name" in stage ? String((stage as { name?: string }).name || "") : "";
    const missions = typeof stage === "object" && stage && "missions" in stage ? (stage as { missions?: Array<Record<string, unknown>> }).missions : [];
    if (!Array.isArray(missions)) continue;
    for (const mission of missions) {
      const id = String(mission.id || "").trim();
      if (!id) continue;
      const type = String(mission.type || "").trim();
      const order = String(mission.order ?? "").trim();
      const name = String(mission.name || mission.title || "").trim();
      const code = type && order ? `${type}${order}` : "";
      options.push({
        value: id,
        label: [code, name, stageName].filter(Boolean).join(" — "),
      });
    }
  }
  return options;
}

export function SagaImportProgressOverlay({
  active,
  awaitingMission = false,
  modeLabel,
  importProgress,
  importStartedAt,
  progressTick,
  catalogs,
  pendingMission,
  onConfirmMission,
}: Props) {
  const [selectedMissionId, setSelectedMissionId] = useState("");

  const progressPercent = importProgress?.total
    ? Math.min(100, Math.max(0, Math.round((importProgress.current / importProgress.total) * 100)))
    : null;
  const elapsedSeconds = importStartedAt
    ? Math.max(0, Math.floor((Date.now() - importStartedAt + progressTick * 0) / 1000))
    : 0;

  const missionOptions = useMemo(
    () => (pendingMission ? missionOptionsForTrack(catalogs, pendingMission.trainingTrackId) : []),
    [catalogs, pendingMission],
  );

  useEffect(() => {
    setSelectedMissionId("");
  }, [pendingMission?.lookupKey]);

  const showMissionModal =
    awaitingMission || Boolean(pendingMission?.lookupKey) || importProgress?.status === "awaiting_mission_mapping";

  if (!active && !showMissionModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900 p-5 shadow-2xl shadow-slate-950">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full bg-emerald-400 transition-all ${progressPercent === null ? "w-2/3 animate-pulse" : ""}`}
              style={progressPercent === null ? undefined : { width: `${progressPercent}%` }}
            />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-100">
            {importProgress?.stage || "Importacao em andamento"}
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            {importProgress?.message || "Aguardando progresso da function no Appwrite."}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              <span className="block uppercase tracking-widest text-slate-500">Modo</span>
              <span className="mt-1 block font-semibold text-slate-200">{modeLabel}</span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              <span className="block uppercase tracking-widest text-slate-500">Progresso</span>
              <span className="mt-1 block font-semibold text-slate-200">
                {importProgress?.total ? `${importProgress.current}/${importProgress.total}` : "Calculando"}
              </span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              <span className="block uppercase tracking-widest text-slate-500">Tempo</span>
              <span className="mt-1 block font-semibold text-slate-200">{elapsedSeconds}s</span>
            </div>
          </div>
          {importProgress?.logs?.length ? (
            <div className="mt-4 max-h-32 space-y-1 overflow-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 font-mono text-xs text-slate-400">
              {importProgress.logs.map((line, index) => (
                <p key={`${index}-${line}`}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>

        {showMissionModal && pendingMission ? (
          <div className="rounded-2xl border border-amber-500/40 bg-slate-900 p-5 shadow-2xl shadow-slate-950">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">De-para de missao</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">Missao nao encontrada na trilha</h3>
            <p className="mt-2 text-sm text-slate-400">
              A ficha SAGA <span className="font-mono text-slate-200">{pendingMission.sagaFlightId}</span> trouxe a missao{" "}
              <span className="font-semibold text-amber-100">{pendingMission.rawMission || pendingMission.lookupKey}</span> no curso{" "}
              <span className="text-slate-200">{pendingMission.trackName}</span>. Escolha a missao local equivalente. O sistema salva o de-para para fichas semelhantes.
            </p>
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-500">
              <p>Aluno: {pendingMission.studentName || "—"}</p>
              <p>Data: {pendingMission.flightDate || "—"}</p>
              {pendingMission.missionCode ? <p>Codigo normalizado: {pendingMission.missionCode}</p> : null}
            </div>
            <label className="mt-4 block text-sm text-slate-300">
              Missao local
              <select
                value={selectedMissionId}
                onChange={(event) => setSelectedMissionId(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
              >
                <option value="">Selecione a missao</option>
                {missionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {missionOptions.length === 0 ? (
              <p className="mt-2 text-xs text-rose-300">Nenhuma missao cadastrada na trilha selecionada. Cadastre em Trilhas de formacao.</p>
            ) : null}
            <button
              type="button"
              disabled={!selectedMissionId}
              onClick={() => onConfirmMission(selectedMissionId)}
              className="mt-4 w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Salvar de-para e continuar import
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
