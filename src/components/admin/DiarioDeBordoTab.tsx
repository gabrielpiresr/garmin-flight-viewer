import { useCallback, useEffect, useMemo, useState } from "react";
import { listAircrafts } from "../../lib/aircraftDb";
import { decodeFlightRecord } from "../../lib/flightRecordCodec";
import { exportFlightFichaPdf } from "../../lib/flightFichaPdf";
import {
  getFlightRecordMetaBatch,
  getSavedFlight,
  listAllFlightsByAircraft,
  type SavedFlightListItem,
} from "../../lib/flightsDb";
import { listSignaturesForFlights } from "../../lib/flightSignaturesDb";
import { listFlightDiscrepancies, syncFlightDiscrepanciesFromMetas, type FlightDiscrepancy } from "../../lib/flightDiscrepanciesDb";
import { getActiveLogbookOpeningSignature, type LogbookOpeningSignature } from "../../lib/logbookOpeningSignaturesDb";
import {
  buildAnacLogbookEntries,
  exportLogbookCsv,
  exportLogbookPdf,
  isLogbookDurationColumn,
  isLogbookTimeColumn,
  isLogbookWideColumn,
  LOGBOOK_CSV_COLUMNS,
  logbookCellValue,
  type AnacLogbookEntry,
} from "../../lib/logbookAnac";
import { buildMaintenanceAsOfFlight } from "../../lib/maintenanceAtDate";
import { listProgramItemsByModel, listWorkOrders } from "../../lib/maintenanceDb";
import { listProfileSummariesByUserIds } from "../../lib/rbac";
import { SCHOOL_ID } from "../../lib/appwrite";
import type { Aircraft } from "../../types/admin";
import type { MaintenanceProgramItem, MaintenanceWorkOrder } from "../../types/admin";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const schoolId = SCHOOL_ID ?? "escola_principal";

function flightAsOfMs(flight: SavedFlightListItem): number {
  const date = flight.flight_date ?? flight.created_at;
  const time = flight.start_time ? `T${flight.start_time}` : "";
  const ms = new Date(`${date}${time}`).getTime();
  return Number.isFinite(ms) ? ms : new Date(flight.created_at).getTime();
}

function latestBaseline(orders: MaintenanceWorkOrder[], aircraftId: string): MaintenanceWorkOrder | null {
  return orders
    .filter((order) => order.aircraft_id === aircraftId && order.work_order_type === "migration_baseline")
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0] ?? null;
}

function enrichLandingTotals(params: {
  entries: AnacLogbookEntry[];
  rows: SavedFlightListItem[];
  aircraft: Aircraft | null;
  workOrders: MaintenanceWorkOrder[];
}): AnacLogbookEntry[] {
  if (!params.aircraft) return params.entries;
  let baselineMs: number;
  let runningLandings: number;
  if (params.aircraft.logbook_landings != null) {
    baselineMs = params.aircraft.logbook_opening_date ? new Date(params.aircraft.logbook_opening_date).getTime() : Number.NEGATIVE_INFINITY;
    runningLandings = params.aircraft.logbook_landings;
  } else {
    const baseline = latestBaseline(params.workOrders, params.aircraft.id);
    baselineMs = baseline ? new Date(baseline.opened_at).getTime() : Number.NEGATIVE_INFINITY;
    runningLandings = baseline?.aircraft_total_landings ?? 0;
  }
  const flightDateMsByFlight = new Map<string, number>();
  for (const row of params.rows) {
    flightDateMsByFlight.set(row.id, flightAsOfMs(row));
  }
  // Sort entries chronologically; within the same flight sort by leg index so
  // each leg's partial landing count accumulates into the running total separately.
  const sorted = [...params.entries].sort((a, b) => {
    const aMs = flightDateMsByFlight.get(a.flightId) ?? 0;
    const bMs = flightDateMsByFlight.get(b.flightId) ?? 0;
    if (aMs !== bMs) return aMs - bMs;
    return a.legIndex - b.legIndex;
  });
  const totalsByKey = new Map<string, { partial: number; total: number }>();
  for (const entry of sorted) {
    const entryMs = flightDateMsByFlight.get(entry.flightId) ?? 0;
    const partial = Number(entry.landingsPartial) || 0;
    if (entryMs >= baselineMs) runningLandings += partial;
    totalsByKey.set(`${entry.flightId}:${entry.legIndex}`, { partial, total: runningLandings });
  }
  return params.entries.map((entry) => {
    const t = totalsByKey.get(`${entry.flightId}:${entry.legIndex}`);
    if (!t) return entry;
    return {
      ...entry,
      landingsPartial: String(t.partial),
      landingsTotal: String(t.total),
      cyclesPartialTotal: `${t.partial}/${t.total}`,
    };
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-200">{value || "—"}</p>
    </div>
  );
}

function LogbookTableRow({
  entry,
  exportingFicha,
  onDetail,
  onExportFicha,
}: {
  entry: AnacLogbookEntry;
  exportingFicha: boolean;
  onDetail: () => void;
  onExportFicha: () => void;
}) {
  return (
    <tr className="group hover:bg-slate-800/30">
      {LOGBOOK_CSV_COLUMNS.map((col) => {
        const value = logbookCellValue(entry, col.key);
        const isUtc = isLogbookTimeColumn(col.key);
        const isDur = isLogbookDurationColumn(col.key);
        const isWide = isLogbookWideColumn(col.key);
        return (
          <td
            key={col.key}
            title={value}
            className={`py-2 align-top ${
              isUtc
                ? "w-14 max-w-[3.5rem] whitespace-nowrap px-1.5 font-mono text-[10px]"
                : isDur
                  ? "w-12 max-w-[3rem] whitespace-nowrap px-1.5 font-mono text-[10px]"
                  : isWide
                    ? "min-w-[10rem] max-w-[14rem] px-3"
                    : "max-w-[14rem] whitespace-nowrap px-3"
            }`}
          >
            <span className={isWide ? "line-clamp-3 whitespace-normal break-words" : ""}>{value}</span>
          </td>
        );
      })}
      <td className="sticky right-0 whitespace-nowrap bg-slate-950/90 px-3 py-2 align-top shadow-[-8px_0_12px_rgba(2,6,23,0.5)] group-hover:bg-slate-900/90">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onDetail} className="text-emerald-400 hover:underline">
            Detalhe
          </button>
          <button
            type="button"
            disabled={exportingFicha}
            onClick={onExportFicha}
            className="text-sky-400 hover:underline disabled:opacity-50"
          >
            Ficha
          </button>
        </div>
      </td>
    </tr>
  );
}

export function DiarioDeBordoTab() {
  const { showToast } = useToast();
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [aircraftIdent, setAircraftIdent] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [entries, setEntries] = useState<AnacLogbookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailEntry, setDetailEntry] = useState<AnacLogbookEntry | null>(null);
  const [exportingFicha, setExportingFicha] = useState(false);
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>([]);
  const [programItems, setProgramItems] = useState<MaintenanceProgramItem[]>([]);
  const [discrepancies, setDiscrepancies] = useState<FlightDiscrepancy[]>([]);
  const [openingSignature, setOpeningSignature] = useState<LogbookOpeningSignature | null>(null);
  const [allAircraftFlights, setAllAircraftFlights] = useState<SavedFlightListItem[]>([]);

  useEffect(() => {
    void listAircrafts(schoolId).then(setAircrafts).catch(() => setAircrafts([]));
  }, []);

  const selectedAircraft = useMemo(
    () => aircrafts.find((a) => a.registration === aircraftIdent) ?? null,
    [aircraftIdent, aircrafts],
  );

  const loadLogbook = useCallback(async () => {
    if (!aircraftIdent.trim()) {
      showToast({ variant: "warning", message: "Selecione uma aeronave." });
      return;
    }
    setLoading(true);
    setEntries([]);
    try {
      const { data: rows, error: listError } = await listAllFlightsByAircraft({
        aircraftIdent,
        fromDate: fromDate || null,
        toDate: toDate || null,
      });
      if (listError) throw listError;
      if (!rows?.length) {
        setEntries([]);
        return;
      }

      const flightIds = rows.map((row) => row.id);
      const modelId = selectedAircraft?.model_id ?? "";
      const aircraft = selectedAircraft;

      const [workOrders, programItems, metaByFlightId, signaturesByFlightId] = await Promise.all([
        listWorkOrders(),
        modelId ? listProgramItemsByModel(modelId) : Promise.resolve([]),
        getFlightRecordMetaBatch(flightIds, { concurrency: 12 }),
        listSignaturesForFlights(flightIds),
      ]);
      setWorkOrders(workOrders);
      setProgramItems(programItems);
      await syncFlightDiscrepanciesFromMetas(rows, metaByFlightId);
      setDiscrepancies(aircraftIdent ? await listFlightDiscrepancies(aircraftIdent) : []);
      setOpeningSignature(aircraft ? await getActiveLogbookOpeningSignature(aircraft.id) : null);
      const allFlights = await listAllFlightsByAircraft({ aircraftIdent });
      setAllAircraftFlights(allFlights.data ?? rows);

      const profileIds = new Set<string>();
      for (const flight of rows) {
        if (flight.student_user_id) profileIds.add(flight.student_user_id);
        if (flight.instructor_user_id) profileIds.add(flight.instructor_user_id);
      }
      for (const sig of signaturesByFlightId.values()) {
        if (sig.admin_operator?.signer_user_id) profileIds.add(sig.admin_operator.signer_user_id);
      }
      const profiles = await listProfileSummariesByUserIds([...profileIds]);

      const built: AnacLogbookEntry[] = [];
      for (const flight of rows) {
        const meta = metaByFlightId.get(flight.id);
        if (!meta) continue;

        const signatures = signaturesByFlightId.get(flight.id) ?? {
          student: null,
          instructor: null,
          admin_operator: null,
        };

        const profileNames = {
          student:
            (flight.student_user_id ? profiles[flight.student_user_id]?.fullName : undefined) ??
            meta.header.studentName,
          instructor:
            (flight.instructor_user_id ? profiles[flight.instructor_user_id]?.fullName : undefined) ??
            meta.header.instructorName,
          operator: signatures.admin_operator
            ? profiles[signatures.admin_operator.signer_user_id]?.fullName
            : undefined,
        };

        const maintenance =
          aircraft != null
            ? buildMaintenanceAsOfFlight({
                aircraft,
                programItems,
                workOrders,
                flights: rows,
                asOfMs: flightAsOfMs(flight),
              })
            : {
                lastInterventionType: null,
                lastInterventionDate: null,
                nextInterventionType: null,
                nextInterventionDueHours: null,
                returnToServiceResponsible: null,
              };

        built.push(
          ...buildAnacLogbookEntries({
            flight,
            meta,
            signatures,
            maintenance,
            profileNames,
          }),
        );
      }
      setEntries(enrichLandingTotals({ entries: built, rows, aircraft, workOrders }).filter((e) => Number(e.landingsPartial) > 0));
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [aircraftIdent, fromDate, toDate, selectedAircraft, showToast]);

  /** Exportação da ficha completa (inclui telemetria) — só ao clicar em Ficha, não na listagem. */
  const handleExportFicha = async (flightId: string) => {
    setExportingFicha(true);
    try {
      const { data, error } = await getSavedFlight(flightId);
      if (error || !data) throw error ?? new Error("Voo não encontrado");
      const decoded = decodeFlightRecord(data.csv_text);
      if (!decoded.meta) throw new Error("Ficha sem metadados");
      const result = exportFlightFichaPdf({
        meta: decoded.meta,
        telemetryCsv: decoded.telemetryCsv,
        telemetryFileName: data.source_filename ?? undefined,
      });
      if (!result.ok) throw new Error(result.error ?? "Falha ao exportar ficha");
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setExportingFicha(false);
    }
  };

  const handleExportLogbookPdf = async () => {
    if (!selectedAircraft) {
      showToast({ variant: "error", message: "Selecione uma aeronave." });
      return;
    }
    const signature = openingSignature ?? await getActiveLogbookOpeningSignature(selectedAircraft.id);
    if (!signature) {
      showToast({ variant: "error", message: "Assine o Termo de Abertura da aeronave antes de baixar o PDF." });
      return;
    }
    const signerProfiles = await listProfileSummariesByUserIds([signature.signer_user_id]);
    const signerProfile = signerProfiles[signature.signer_user_id] ?? null;
    const modelId = selectedAircraft.model_id;
    const currentProgramItems = programItems.length > 0 || !modelId ? programItems : await listProgramItemsByModel(modelId);
    const currentWorkOrders = workOrders.length > 0 ? workOrders : await listWorkOrders();
    const currentFlights = allAircraftFlights.length > 0 ? allAircraftFlights : (await listAllFlightsByAircraft({ aircraftIdent })).data ?? [];
    const currentDiscrepancies = discrepancies.length > 0 ? discrepancies : await listFlightDiscrepancies(aircraftIdent);
    const currentMaintenance = buildMaintenanceAsOfFlight({
      aircraft: selectedAircraft,
      programItems: currentProgramItems,
      workOrders: currentWorkOrders,
      flights: currentFlights,
      asOfMs: Date.now(),
    });
    if (!exportLogbookPdf({
      entries,
      aircraft: selectedAircraft,
      model: selectedAircraft.model,
      openingSignature: signature,
      signerProfile,
      discrepancies: currentDiscrepancies,
      currentMaintenance,
      workOrders: currentWorkOrders,
    })) {
      showToast({ variant: "error", message: "Permita pop-ups para exportar PDF." });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Diário de bordo</h1>
        <p className="mt-1 text-sm text-slate-400">
          Registros por aeronave conforme exigências ANAC (Art. 4º e 5º). Dados gravados na ficha de voo.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <label className="min-w-[200px] flex-1">
          <span className="mb-1 block text-xs text-slate-500">Aeronave *</span>
          <select
            value={aircraftIdent}
            onChange={(e) => setAircraftIdent(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          >
            <option value="">Selecione a matrícula</option>
            {aircrafts.map((ac) => (
              <option key={ac.id} value={ac.registration}>
                {ac.registration}
                {ac.nickname ? ` — ${ac.nickname}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-slate-500">De</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-slate-500">Até</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          />
        </label>
        <button
          type="button"
          disabled={!aircraftIdent || loading}
          onClick={() => void loadLogbook()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Carregando…" : "Consultar"}
        </button>
        {entries.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => exportLogbookCsv(entries, `diario-${aircraftIdent}`)}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => void handleExportLogbookPdf()}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              PDF
            </button>
          </>
        ) : null}
      </div>

      {!aircraftIdent ? (
        <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
          Selecione uma aeronave para consultar o diário de bordo.
        </p>
      ) : loading ? (
        <Skeleton className="h-48 w-full" />
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum voo encontrado para os filtros informados.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-max text-left text-xs">
            <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                {LOGBOOK_CSV_COLUMNS.map((col) => {
                  const isUtc = isLogbookTimeColumn(col.key);
                  const isDur = isLogbookDurationColumn(col.key);
                  return (
                    <th
                      key={col.key}
                      className={`whitespace-nowrap py-2 ${
                        isUtc
                          ? "w-14 max-w-[3.5rem] px-1.5 text-[9px]"
                          : isDur
                            ? "w-12 max-w-[3rem] px-1.5 text-[9px]"
                            : "px-3"
                      }`}
                    >
                      {col.label}
                    </th>
                  );
                })}
                <th className="sticky right-0 whitespace-nowrap bg-slate-900/95 px-3 py-2 shadow-[-8px_0_12px_rgba(2,6,23,0.5)]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {entries.map((entry) => (
                <LogbookTableRow
                  key={`${entry.flightId}-${entry.legIndex}`}
                  entry={entry}
                  exportingFicha={exportingFicha}
                  onDetail={() => setDetailEntry(entry)}
                  onExportFicha={() => void handleExportFicha(entry.flightId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailEntry ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-100">
                Voo {detailEntry.seqNumber} — {detailEntry.flightDate}
                {detailEntry.legCount > 1
                  ? ` · Etapa ${detailEntry.legIndex + 1}/${detailEntry.legCount}`
                  : ""}
              </h2>
              <button type="button" onClick={() => setDetailEntry(null)} className="text-slate-400 hover:text-slate-200">
                Fechar
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Locais (etapa)" value={detailEntry.route} />
              <Field label="Tripulantes" value={detailEntry.crewLines} />
              <Field label="Natureza" value={detailEntry.nature} />
              <Field label="Partida UTC" value={detailEntry.departureUtc} />
              <Field label="Decolagem UTC" value={detailEntry.takeoffUtc} />
              <Field label="Pouso UTC" value={detailEntry.landingUtc} />
              <Field label="Corte motor UTC" value={detailEntry.engineCutoffUtc} />
              <Field label="Voo" value={detailEntry.flightTime} />
              <Field label="Diurno" value={detailEntry.dayTime} />
              <Field label="Noturno" value={detailEntry.nightTime} />
              <Field label="Navegação" value={detailEntry.navTime} />
              <Field label="Serviço" value={detailEntry.serviceTime} />
              <Field label="IFR-R (h dec)" value={detailEntry.ifrHoursReal} />
              <Field label="IFR-C (h dec)" value={detailEntry.ifrHoursCap} />
              <Field label="Combustível" value={detailEntry.fuelByLeg} />
              <Field label="Pessoas a bordo" value={detailEntry.personsOnBoard} />
              <Field label="Carga" value={detailEntry.cargo} />
              <Field label="Ocorrências" value={detailEntry.occurrences} />
              <Field label="Discrepâncias" value={detailEntry.discrepancies} />
              <Field label="Detectado por" value={detailEntry.discrepancyDetectedBy} />
              <Field label="Ações corretivas" value={detailEntry.correctiveActions} />
              <Field label="Última manutenção" value={detailEntry.maintenance.lastInterventionType ?? "—"} />
              <Field label="Próxima manutenção" value={detailEntry.maintenance.nextInterventionType ?? "—"} />
              <Field
                label="Horas célula (próx.)"
                value={
                  detailEntry.maintenance.nextInterventionDueHours != null
                    ? String(detailEntry.maintenance.nextInterventionDueHours)
                    : "—"
                }
              />
              <Field label="Resp. retorno ao serviço" value={detailEntry.maintenance.returnToServiceResponsible ?? "—"} />
            </div>
            <div className="mt-4 space-y-2 rounded-lg border border-slate-700/60 bg-slate-950/40 p-3 text-xs text-slate-300">
              <p className="font-semibold text-slate-400">Assinaturas</p>
              <p>{detailEntry.signatures.student}</p>
              <p>{detailEntry.signatures.instructor}</p>
              <p>{detailEntry.signatures.operator}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
