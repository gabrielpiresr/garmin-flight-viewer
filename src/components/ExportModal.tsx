import { useEffect, useRef, useState } from "react";

export type ExportStage =
  | "render"
  | "upload"
  | "process"
  | "finalize"
  | "done"
  | "error";

export interface ExportProgress {
  stage: ExportStage;
  renderPct: number;   // 0-1
  uploadPct: number;   // 0-1
  processPct: number;  // 0-1
  finalizePct: number; // 0-1
  errorMsg?: string;
  fileUrl?: string;
}

interface Props {
  progress: ExportProgress;
  onClose: () => void;
}

const STAGE_LABELS: Record<ExportStage, string> = {
  render: "Renderizando overlay",
  upload: "Enviando ao helper",
  process: "Processando vídeo",
  finalize: "Finalizando upload",
  done: "Concluído",
  error: "Erro",
};

const STAGE_ORDER: ExportStage[] = ["render", "upload", "process", "finalize"];

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ProgressBar({ pct, active }: { pct: number; active: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className={`h-full rounded-full transition-all duration-300 ${active ? "bg-sky-500" : pct >= 1 ? "bg-emerald-500" : "bg-slate-700"}`}
        style={{ width: `${Math.round(pct * 100)}%` }}
      />
    </div>
  );
}

export function ExportModal({ progress, onClose }: Props) {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (progress.stage === "done" || progress.stage === "error") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [progress.stage]);

  // Rough ETA: weight each stage ~equally, estimate remaining
  const stagePcts: Record<string, number> = {
    render: progress.renderPct,
    upload: progress.uploadPct,
    process: progress.processPct,
    finalize: progress.finalizePct,
  };

  const overall =
    (progress.renderPct * 0.35 +
      progress.uploadPct * 0.15 +
      progress.processPct * 0.4 +
      progress.finalizePct * 0.1);

  const etaSec =
    overall > 0.02 && overall < 1
      ? Math.round((elapsed / overall) * (1 - overall))
      : null;

  const isDone = progress.stage === "done";
  const isError = progress.stage === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {isDone ? "Download pronto!" : isError ? "Erro no processamento" : "Gerando vídeo com widgets"}
            </h2>
            {!isDone && !isError && (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-400">
                <span>⚠</span>
                <span>Não feche nem recarregue esta aba — o processo será perdido</span>
              </p>
            )}
          </div>
          {(isDone || isError) && (
            <button
              onClick={onClose}
              className="ml-4 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              Fechar
            </button>
          )}
        </div>

        {isError ? (
          <p className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
            {progress.errorMsg ?? "Erro desconhecido"}
          </p>
        ) : isDone ? (
          <div className="space-y-3">
            <p className="text-xs text-emerald-400">✓ Vídeo processado com sucesso</p>
            {progress.fileUrl && (
              <a
                href={progress.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg bg-emerald-500/20 px-4 py-2.5 text-center text-sm font-medium text-emerald-300 hover:bg-emerald-500/30"
              >
                ↓ Baixar vídeo
              </a>
            )}
          </div>
        ) : (
          <>
            {/* Stages */}
            <div className="space-y-3">
              {STAGE_ORDER.map((s, i) => {
                const stageIdx = STAGE_ORDER.indexOf(progress.stage as ExportStage);
                const isActive = progress.stage === s;
                const isPast = stageIdx > i;
                const pct = isPast ? 1 : isActive ? stagePcts[s] ?? 0 : 0;
                const pctLabel = isActive
                  ? `${Math.round(pct * 100)}%`
                  : isPast
                    ? "✓"
                    : "—";

                return (
                  <div key={s}>
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`text-xs font-medium ${isActive ? "text-sky-300" : isPast ? "text-emerald-400" : "text-slate-600"}`}
                      >
                        {i + 1}. {STAGE_LABELS[s]}
                      </span>
                      <span
                        className={`text-[11px] tabular-nums ${isActive ? "text-sky-400" : isPast ? "text-emerald-500" : "text-slate-700"}`}
                      >
                        {pctLabel}
                      </span>
                    </div>
                    <ProgressBar pct={pct} active={isActive} />
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
              <span>Decorrido: {fmt(elapsed)}</span>
              {etaSec != null && etaSec > 2 && (
                <span>~{fmt(etaSec)} restantes</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
