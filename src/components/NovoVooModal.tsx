import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { buildFlightTelemetryMetrics, deriveIdentity } from "../lib/flightTelemetryMetrics";
import { insertFlight } from "../lib/flightsDb";
import { chartDurationSec } from "../lib/flightStats";
import type { ParseResult } from "../lib/parseGarminCsv";
import { listAssignableStudents, type StudentOption } from "../lib/rbac";
import CsvWorker from "../workers/csvWorker?worker";

type Phase = "idle" | "parsing" | "ready" | "saving" | "error";

type Props = {
  onClose: () => void;
  onCreated: (id: string) => void;
};

export function NovoVooModal({ onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [rawCsvText, setRawCsvText] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [targetStudentId, setTargetStudentId] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const isInstructorFlow = user?.role === "instrutor" || user?.role === "admin";

  useEffect(() => {
    if (!user) return;
    if (!isInstructorFlow) {
      setTargetStudentId(user.id);
      return;
    }
    setStudentsLoading(true);
    setErrorMsg(null);
    void listAssignableStudents(user.id, user.role)
      .then((res) => {
        setStudents(res);
        setTargetStudentId(res[0]?.userId ?? "");
      })
      .catch((error) => {
        setErrorMsg((error as Error).message);
      })
      .finally(() => setStudentsLoading(false));
  }, [isInstructorFlow, user]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const handleFile = (file: File) => {
    setPhase("parsing");
    setErrorMsg(null);
    setParsed(null);
    setSourceFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRawCsvText(text);

      workerRef.current?.terminate();
      const worker = new CsvWorker();
      workerRef.current = worker;

      worker.onmessage = (ev: MessageEvent<{ ok: boolean; result?: ParseResult; error?: string }>) => {
        worker.terminate();
        workerRef.current = null;
        if (!ev.data.ok || !ev.data.result) {
          setPhase("error");
          setErrorMsg(ev.data.error ?? "Erro ao processar CSV.");
          return;
        }
        const result = ev.data.result;
        setParsed(result);
        setPhase("ready");
      };

      worker.onerror = (err) => {
        worker.terminate();
        workerRef.current = null;
        setPhase("error");
        setErrorMsg(err.message);
      };

      worker.postMessage(text);
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!user || !rawCsvText || !sourceFileName || !parsed || !targetStudentId) return;
    setPhase("saving");
    setErrorMsg(null);

    const durationSec =
      chartDurationSec(parsed.chartData, parsed.hasChartTime) ??
      (parsed.points.length >= 2
        ? ((parsed.points[parsed.points.length - 1]?.t ?? 0) - (parsed.points[0]?.t ?? 0)) / 1000
        : null);
    const telemetryMetrics = buildFlightTelemetryMetrics({
      parsed,
      identity: deriveIdentity({
        studentUserId: targetStudentId,
        instructorUserId: isInstructorFlow ? user.id : null,
        aircraftIdent: parsed.aircraftIdent ?? null,
      }),
      meta: null,
    });

    const { id, error } = await insertFlight({
      actorUserId: user.id,
      actorRole: user.role,
      studentUserId: targetStudentId,
      source_filename: sourceFileName,
      csv_text: rawCsvText,
      aircraft_ident: parsed.aircraftIdent ?? null,
      duration_sec: durationSec ?? null,
      telemetryMetrics,
      telemetryAlertParsed: parsed,
    });

    if (error || !id) {
      setPhase("error");
      setErrorMsg(error?.message ?? "Erro ao salvar.");
      return;
    }

    onCreated(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-4 py-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-900 p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">Novo voo</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Step 1: pick CSV */}
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Arquivo CSV (Garmin)</span>
            <div
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 transition ${
                phase === "parsing"
                  ? "cursor-wait border-sky-500/40 bg-slate-950/50 opacity-60"
                  : "border-sky-500/40 bg-slate-950/50 hover:border-sky-400/70 hover:bg-slate-900/60"
              }`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation();
                const f = e.dataTransfer.files?.[0];
                if (f && phase !== "parsing" && phase !== "saving") handleFile(f);
              }}
            >
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                disabled={phase === "parsing" || phase === "saving"}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {phase === "parsing" ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                  <span className="text-sm text-sky-300">Lendo CSV…</span>
                </div>
              ) : (
                <>
                  <span className="text-sm font-medium text-sky-300">
                    {sourceFileName ?? "Selecionar CSV"}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    {sourceFileName ? "Clique para trocar" : "ou solte aqui"}
                  </span>
                </>
              )}
            </div>
          </label>

          {/* Step 2: flight owner */}
          {(phase === "ready" || phase === "saving" || phase === "error") && (
            <>
              {isInstructorFlow && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-400">Aluno</span>
                  <select
                    value={targetStudentId}
                    disabled={studentsLoading || phase === "saving"}
                    onChange={(e) => setTargetStudentId(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none disabled:opacity-60"
                  >
                    {students.length === 0 ? (
                      <option value="">
                        {studentsLoading ? "Carregando alunos..." : "Nenhum aluno vinculado"}
                      </option>
                    ) : (
                      students.map((student) => (
                        <option key={student.userId} value={student.userId}>
                          {student.email}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              )}

              {parsed?.aircraftIdent ? (
                <p className="text-xs text-slate-500">Aeronave detectada: {parsed.aircraftIdent}</p>
              ) : null}
            </>
          )}

          {errorMsg && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-300">
              {errorMsg}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 sm:w-auto"
            disabled={phase === "saving"}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={phase !== "ready" || !targetStudentId}
            className="w-full rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-40 sm:w-auto"
          >
            {phase === "saving" ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvando…
              </span>
            ) : (
              "Salvar voo"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
