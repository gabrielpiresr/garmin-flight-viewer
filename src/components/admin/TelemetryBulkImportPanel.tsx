import { useCallback, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { attachFlightTelemetry } from "../../lib/attachFlightTelemetry";
import {
  buildAutoAssignments,
  flightForLogMatchFromRow,
  parseTelemetryLogFilename,
  unallocatedReasonLabel,
  type BulkLogFile,
  type LogFileAssignment,
  type MatchConfidence,
  type UnallocatedFile,
} from "../../lib/telemetryLogFilename";
import { MAX_TELEMETRY_CSV_FILES } from "../../lib/telemetryCsvMerge";
import type { AdminFlightReportRow } from "../../types/adminFlightReports";
import { TelemetryProcessingProgress } from "../ui/TelemetryProcessingProgress";
import { useToast } from "../ui/ToastProvider";

type Props = {
  flights: AdminFlightReportRow[];
  aircraftOptions: string[];
  onImported: () => void;
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function flightLabel(row: AdminFlightReportRow): string {
  return `${fmtDate(row.flightDate)} ${row.startTime || "—"} · ${row.route || "—"}`;
}

function confidenceClass(confidence: MatchConfidence): string {
  if (confidence === "high") return "border-emerald-500/50 bg-emerald-500/10";
  if (confidence === "medium") return "border-sky-500/40 bg-sky-500/10";
  return "border-slate-600 bg-slate-800/60";
}

function createFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function TelemetryBulkImportPanel({ flights, aircraftOptions, onImported }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [bulkAircraft, setBulkAircraft] = useState("");
  const [files, setFiles] = useState<BulkLogFile[]>([]);
  const [assignments, setAssignments] = useState<LogFileAssignment[]>([]);
  const [unallocated, setUnallocated] = useState<UnallocatedFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragFileId, setDragFileId] = useState<string | null>(null);

  const bulkPool = useMemo(() => {
    if (!bulkAircraft) return [];
    return flights.filter((row) => (row.aircraftIdent ?? "") === bulkAircraft);
  }, [bulkAircraft, flights]);

  const matchPool = useMemo(() => bulkPool.map(flightForLogMatchFromRow), [bulkPool]);

  const fileById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);
  const assignmentsByFlightId = useMemo(() => {
    const map = new Map<string, LogFileAssignment[]>();
    for (const item of assignments) {
      if (!item.flightId) continue;
      const list = map.get(item.flightId) ?? [];
      list.push(item);
      map.set(item.flightId, list);
    }
    return map;
  }, [assignments]);

  const unassignedFiles = useMemo(
    () => assignments.filter((item) => !item.flightId).map((item) => fileById.get(item.fileId)).filter(Boolean) as BulkLogFile[],
    [assignments, fileById],
  );

  const readyFlightCount = useMemo(
    () => new Set(assignments.filter((item) => item.flightId).map((item) => item.flightId)).size,
    [assignments],
  );
  const readyFileCount = useMemo(() => assignments.filter((item) => item.flightId).length, [assignments]);

  const applyAutoMatch = useCallback(
    (nextFiles: BulkLogFile[]) => {
      const result = buildAutoAssignments(nextFiles, matchPool);
      setAssignments(result.assignments);
      setUnallocated(result.unallocated);
    },
    [matchPool],
  );

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length || !bulkAircraft) return;

    const nextFiles: BulkLogFile[] = await Promise.all(
      selected.map(async (file) => ({
        id: createFileId(),
        name: file.name,
        file,
        parsed: parseTelemetryLogFilename(file.name),
      })),
    );

    setFiles(nextFiles);
    applyAutoMatch(nextFiles);
  };

  const assignFileToFlight = (fileId: string, flightId: string | null, confidence: MatchConfidence = "manual") => {
    if (flightId) {
      const countOnFlight = assignments.filter((item) => item.flightId === flightId && item.fileId !== fileId).length;
      if (countOnFlight >= MAX_TELEMETRY_CSV_FILES) {
        showToast({
          variant: "error",
          message: `No máximo ${MAX_TELEMETRY_CSV_FILES} CSVs por voo.`,
        });
        return;
      }
    }
    setAssignments((current) => {
      const withoutFile = current.filter((item) => item.fileId !== fileId);
      return [...withoutFile, { fileId, flightId, confidence }];
    });
    setUnallocated((current) => current.filter((item) => item.fileId !== fileId));
  };

  const handleDropOnFlight = (flightId: string) => {
    if (!dragFileId) return;
    assignFileToFlight(dragFileId, flightId, "manual");
    setDragFileId(null);
  };

  const handleDropUnallocated = () => {
    if (!dragFileId) return;
    assignFileToFlight(dragFileId, null, "manual");
    setDragFileId(null);
  };

  const handleImport = async () => {
    if (!user || user.role !== "admin") return;
    const byFlight = new Map<string, LogFileAssignment[]>();
    for (const item of assignments) {
      if (!item.flightId) continue;
      const list = byFlight.get(item.flightId) ?? [];
      list.push(item);
      byFlight.set(item.flightId, list);
    }
    if (!byFlight.size) {
      showToast({ variant: "error", message: "Associe pelo menos um arquivo a um voo." });
      return;
    }

    setImporting(true);
    let okFlights = 0;
    let failedFlights = 0;

    for (const [flightId, pairs] of byFlight) {
      const sortedPairs = [...pairs].sort((a, b) => {
        const aMs = fileById.get(a.fileId)?.parsed?.localMs ?? 0;
        const bMs = fileById.get(b.fileId)?.parsed?.localMs ?? 0;
        return aMs - bMs;
      });
      const telemetryFiles = await Promise.all(
        sortedPairs.map(async (pair) => {
          const file = fileById.get(pair.fileId);
          if (!file) throw new Error("Arquivo não encontrado.");
          return { name: file.name, text: await file.file.text() };
        }),
      );
      const result = await attachFlightTelemetry({
        flightId,
        actorUserId: user.id,
        actorRole: user.role,
        telemetryFiles,
      });
      if (result.error) {
        failedFlights += 1;
        showToast({ variant: "error", message: `Voo ${flightId.slice(0, 8)}…: ${result.error.message}` });
      } else {
        okFlights += 1;
      }
    }

    setImporting(false);
    showToast({
      variant: failedFlights ? "error" : "success",
      message: `Importação: ${okFlights} voo(s)${failedFlights ? `, ${failedFlights} falha(s)` : ""} (${readyFileCount} arquivo(s) mesclados).`,
    });

    if (okFlights > 0) {
      setFiles([]);
      setAssignments([]);
      setUnallocated([]);
      onImported();
    }
  };

  if (importing) {
    return <TelemetryProcessingProgress className="min-h-[280px]" label="Importando telemetria em massa…" />;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Importação em massa</h2>
          <p className="mt-1 text-xs text-slate-500">
            Vários CSVs podem ir para o mesmo voo (ex.: reinício do Garmin). Padrão: log_AAAAMMDD_HHMMSS_ICAO — segmentos
            extras devem bater com uma perna da rota e cair na duração do voo.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-xs text-slate-400">
            Avião obrigatório
            <select
              value={bulkAircraft}
              onChange={(e) => {
                setBulkAircraft(e.target.value);
                setFiles([]);
                setAssignments([]);
                setUnallocated([]);
              }}
              className="mt-1 block h-10 min-w-[12rem] rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
            >
              <option value="">Selecione o avião</option>
              {aircraftOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label
            className={`inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium ${
              bulkAircraft
                ? "cursor-pointer border-sky-600 bg-sky-600/20 text-sky-200 hover:bg-sky-600/30"
                : "cursor-not-allowed border-slate-700 text-slate-500 opacity-60"
            }`}
          >
            Escolher CSVs
            <input
              type="file"
              multiple
              accept=".csv,text/csv,text/plain"
              disabled={!bulkAircraft}
              onChange={(e) => void handleFilesSelected(e)}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {!bulkAircraft ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
          Selecione um avião para habilitar o upload e a pré-visualização.
        </p>
      ) : null}

      {files.length > 0 ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Voos sem telemetria ({bulkPool.length})
              </p>
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-2">
                {bulkPool.map((flight) => {
                  const linked = assignmentsByFlightId.get(flight.id) ?? [];
                  const linkedFiles = linked
                    .map((item) => ({ assignment: item, file: fileById.get(item.fileId) }))
                    .filter((entry): entry is { assignment: LogFileAssignment; file: BulkLogFile } => Boolean(entry.file));
                  const bestConfidence = linkedFiles[0]?.assignment.confidence ?? "manual";
                  return (
                    <div
                      key={flight.id}
                      onDragOver={(e: DragEvent) => e.preventDefault()}
                      onDrop={() => handleDropOnFlight(flight.id)}
                      className={`rounded-lg border p-3 transition ${
                        linkedFiles.length ? confidenceClass(bestConfidence) : "border-dashed border-slate-700 bg-slate-900/30"
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-100">{flightLabel(flight)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {flight.studentName} · {flight.instructorName || "Sem INVA"}
                        {linkedFiles.length > 1 ? ` · ${linkedFiles.length} arquivos` : ""}
                      </p>
                      {linkedFiles.length ? (
                        <div className="mt-2 space-y-1.5">
                          {linkedFiles.map(({ file }) => (
                            <div
                              key={file.id}
                              draggable
                              onDragStart={() => setDragFileId(file.id)}
                              onDragEnd={() => setDragFileId(null)}
                              className="flex items-center justify-between gap-2 rounded border border-slate-700/80 bg-slate-950/80 px-2 py-1.5"
                            >
                              <span className="min-w-0 truncate text-xs text-slate-200">{file.name}</span>
                              <button
                                type="button"
                                onClick={() => assignFileToFlight(file.id, null, "manual")}
                                className="shrink-0 text-[10px] text-slate-400 hover:text-slate-200"
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-slate-500">Arraste um ou mais arquivos aqui</p>
                      )}
                    </div>
                  );
                })}
                {!bulkPool.length ? (
                  <p className="px-2 py-6 text-center text-xs text-slate-500">Nenhum voo sem telemetria para este avião no filtro.</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Arquivos carregados</p>
              <div
                onDragOver={(e: DragEvent) => e.preventDefault()}
                onDrop={handleDropUnallocated}
                className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-2"
              >
                {unassignedFiles.map((file) => (
                  <div
                    key={file.id}
                    draggable
                    onDragStart={() => setDragFileId(file.id)}
                    onDragEnd={() => setDragFileId(null)}
                    className="cursor-grab rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 active:cursor-grabbing"
                  >
                    <p className="truncate text-xs font-medium text-slate-200">{file.name}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {file.parsed
                        ? `${file.parsed.localDate} ${file.parsed.localTime} · ${file.parsed.depIcao}`
                        : "Nome fora do padrão"}
                    </p>
                  </div>
                ))}
                {!unassignedFiles.length ? (
                  <p className="px-2 py-6 text-center text-xs text-slate-500">Todos os arquivos foram associados.</p>
                ) : null}
              </div>
            </div>
          </div>

          {unallocated.length ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/15 p-3">
              <p className="text-xs font-semibold text-rose-400">Não alocados automaticamente ({unallocated.length})</p>
              <ul className="mt-2 space-y-1">
                {unallocated.map((item) => (
                  <li key={item.fileId} className="text-xs text-rose-400">
                    <span className="font-medium">{item.name}</span>
                    {" — "}
                    {unallocatedReasonLabel(item.reason)}
                    {item.detail ? `: ${item.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
            <p className="text-xs text-slate-500">
              {readyFlightCount} voo(s), {readyFileCount} arquivo(s) prontos (mesclados por voo na importação)
            </p>
            <button
              type="button"
              disabled={!readyFlightCount}
              onClick={() => void handleImport()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Importar {readyFlightCount} voo(s)
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
