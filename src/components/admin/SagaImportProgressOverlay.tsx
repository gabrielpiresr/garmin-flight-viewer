import { useEffect, useMemo, useState } from "react";
import type { SagaImportCatalogs, SagaImportPendingMission, SagaImportProgress } from "../../lib/sagaImportDb";
import {
  allMissionOptions,
  missionLabelFromCatalogs,
  missionOptionsForTrack,
} from "../../lib/sagaMissionMappingUi";

type Props = {
  active: boolean;
  awaitingMission?: boolean;
  modeLabel: string;
  importProgress: SagaImportProgress | null;
  importStartedAt: number | null;
  progressTick: number;
  catalogs: SagaImportCatalogs;
  missionBySaga?: Record<string, string>;
  onMissionBySagaChange?: (lookupKey: string, missionId: string) => void;
  pendingMission: SagaImportPendingMission | null;
  onConfirmMission: (missionId: string) => void;
};

export function SagaImportProgressOverlay({
  active,
  awaitingMission = false,
  modeLabel,
  importProgress,
  importStartedAt,
  progressTick,
  catalogs,
  missionBySaga = {},
  onMissionBySagaChange,
  pendingMission,
  onConfirmMission,
}: Props) {
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [showSavedMappings, setShowSavedMappings] = useState(true);

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

  const fallbackMissionOptions = useMemo(() => allMissionOptions(catalogs), [catalogs]);

  const savedMissionEntries = useMemo(
    () =>
      Object.entries(missionBySaga)
        .filter(([lookupKey, missionId]) => Boolean(lookupKey && missionId))
        .sort(([a], [b]) => a.localeCompare(b, "pt-BR")),
    [missionBySaga],
  );

  const existingMappedMissionId = pendingMission?.lookupKey ? missionBySaga[pendingMission.lookupKey] || "" : "";

  useEffect(() => {
    setSelectedMissionId(existingMappedMissionId || "");
  }, [pendingMission?.lookupKey, existingMappedMissionId]);

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
          <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-2xl border border-amber-500/40 bg-slate-900 p-5 shadow-2xl shadow-slate-950">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">De-para de missao</p>
            <h3 className="text-lg font-semibold text-slate-100">
              {existingMappedMissionId ? "Confirmar ou alterar missao" : "Missao nao encontrada na trilha"}
            </h3>
            <p className="text-sm text-slate-400">
              A ficha SAGA <span className="font-mono text-slate-200">{pendingMission.sagaFlightId}</span> trouxe a missao{" "}
              <span className="font-semibold text-amber-100">{pendingMission.rawMission || pendingMission.lookupKey}</span> no curso{" "}
              <span className="text-slate-200">{pendingMission.trackName}</span>.
            </p>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-500">
              <p>Aluno: {pendingMission.studentName || "—"}</p>
              <p>Data: {pendingMission.flightDate || "—"}</p>
              {pendingMission.missionCode ? <p>Codigo normalizado: {pendingMission.missionCode}</p> : null}
              {existingMappedMissionId ? (
                <p className="mt-1 text-emerald-300">
                  De-para salvo: {missionLabelFromCatalogs(catalogs, existingMappedMissionId)}
                </p>
              ) : null}
            </div>

            {savedMissionEntries.length > 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40">
                <button
                  type="button"
                  onClick={() => setShowSavedMappings((value) => !value)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-200"
                >
                  De-paras de missao salvos ({savedMissionEntries.length})
                  <span className="text-xs text-slate-500">{showSavedMappings ? "Ocultar" : "Exibir"}</span>
                </button>
                {showSavedMappings ? (
                  <div className="max-h-48 divide-y divide-slate-800 overflow-auto border-t border-slate-800">
                    {savedMissionEntries.map(([lookupKey, missionId]) => {
                      const isCurrent = lookupKey === pendingMission.lookupKey;
                      const options = isCurrent && missionOptions.length ? missionOptions : fallbackMissionOptions;
                      return (
                        <div key={lookupKey} className="grid gap-2 px-3 py-3">
                          <div>
                            <p className="font-mono text-xs text-amber-100/90">{lookupKey}</p>
                            {isCurrent ? <p className="text-[11px] text-cyan-400">Missao desta ficha</p> : null}
                          </div>
                          <select
                            value={missionId}
                            onChange={(event) => {
                              const next = event.target.value;
                              if (!next) return;
                              onMissionBySagaChange?.(lookupKey, next);
                              if (isCurrent) setSelectedMissionId(next);
                            }}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
                          >
                            <option value="">Selecione a missao</option>
                            {options.map((option) => (
                              <option key={`${lookupKey}-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            <label className="block text-sm text-slate-300">
              Missao local {existingMappedMissionId ? "(alterar se necessario)" : ""}
              <select
                value={selectedMissionId}
                onChange={(event) => {
                  const next = event.target.value;
                  setSelectedMissionId(next);
                  if (next && pendingMission.lookupKey) onMissionBySagaChange?.(pendingMission.lookupKey, next);
                }}
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
              <p className="text-xs text-rose-300">Nenhuma missao cadastrada na trilha selecionada. Cadastre em Trilhas de formacao.</p>
            ) : null}
            <button
              type="button"
              disabled={!selectedMissionId}
              onClick={() => onConfirmMission(selectedMissionId)}
              className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {existingMappedMissionId ? "Atualizar de-para e continuar import" : "Salvar de-para e continuar import"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
