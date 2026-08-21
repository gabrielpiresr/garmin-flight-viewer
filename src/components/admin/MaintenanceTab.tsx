import { useCallback, useEffect, useMemo, useState } from "react";
import { listAircrafts } from "../../lib/aircraftDb";
import { listModels } from "../../lib/aircraftModelsDb";
import { useAuth } from "../../contexts/AuthContext";
import { usePermissions } from "../../contexts/PermissionsContext";
import {
  createWorkOrder,
  listAttachments,
  listProgramItemsByModel,
  listWorkOrders,
  softDeleteWorkOrder,
  updateWorkOrder,
  uploadWorkOrderAttachment,
  type WorkOrderPayload,
} from "../../lib/maintenanceDb";
import { linkDiscrepancyToWorkOrder } from "../../lib/flightDiscrepanciesDb";
import { getFlightRecordMetaBatch, listAllFlightsByAircraft, type SavedFlightListItem } from "../../lib/flightsDb";
import { flightAircraftHours } from "../../lib/flightHours";
import type { FlightRecordMeta } from "../../lib/flightRecordCodec";
import { SCHOOL_ID } from "../../lib/appwrite";
import type {
  Aircraft,
  AircraftModel,
  MaintenanceAttachment,
  MaintenanceAttachmentType,
  MaintenanceProgramItem,
  MaintenanceWorkOrder,
  MaintenanceWorkOrderChecklistTask,
} from "../../types/admin";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

const schoolId = SCHOOL_ID ?? "escola_principal";

const ATTACHMENT_TYPES = ["pdf", "image", "invoice", "certificate", "CRS", "AD", "SB", "logbook", "legacy_record", "migration_evidence"] as const;
const ATTACHMENT_LABELS: Record<string, string> = {
  pdf: "PDF",
  image: "Imagem",
  invoice: "Nota fiscal",
  certificate: "Certificado",
  CRS: "Certificado de Retorno ao Serviço (CRS)",
  AD: "Diretriz de Aeronavegabilidade (AD)",
  SB: "Boletim de Serviço (SB)",
  logbook: "Caderneta",
  legacy_record: "Registro legado",
  migration_evidence: "Evidência de migração",
};

type WorkOrderForm = {
  work_order_number: string;
  aircraft_id: string;
  maintenance_program_item_id: string;
  work_order_type: MaintenanceWorkOrder["work_order_type"];
  status: MaintenanceWorkOrder["status"];
  opened_at: string;
  started_at: string;
  completed_at: string;
  released_at: string;
  aircraft_ttaf: string;
  aircraft_total_landings: string;
  engine_time: string;
  propeller_time: string;
  tach_time: string;
  cycles: string;
  description_performed: string;
  discrepancy_reported: string;
  corrective_action: string;
  linked_discrepancy_id: string;
  reference_type: "" | NonNullable<MaintenanceWorkOrder["reference_type"]>;
  reference_document: string;
  reference_revision: string;
  reference_section: string;
  mechanic_name: string;
  mechanic_canac: string;
  mechanic_license_type: "" | NonNullable<MaintenanceWorkOrder["mechanic_license_type"]>;
  mechanic_signature: string;
  mechanic_is_current_user: boolean;
  approved_return_to_service: boolean;
  release_statement: string;
  aircraft_released: boolean;
  grounding_removed: boolean;
  legacy_update: boolean;
  data_origin: MaintenanceWorkOrder["data_origin"];
  source_confidence: "" | NonNullable<MaintenanceWorkOrder["source_confidence"]>;
  source_notes: string;
  legacy_reference: string;
  migrated_at: string;
  migrated_by: string;
  parts_cost: string;
  labor_cost: string;
  other_costs: string;
  created_by: string;
  released_by_user_id: string;
  released_by_name: string;
  released_by_canac: string;
  released_by_license_type: "" | NonNullable<MaintenanceWorkOrder["released_by_license_type"]>;
  release_is_current_user: boolean;
  checklist_execution: MaintenanceWorkOrderChecklistTask[];
};

const emptyForm: WorkOrderForm = {
  work_order_number: "",
  aircraft_id: "",
  maintenance_program_item_id: "",
  work_order_type: "scheduled",
  status: "released",
  opened_at: "",
  started_at: "",
  completed_at: "",
  released_at: "",
  aircraft_ttaf: "",
  aircraft_total_landings: "",
  engine_time: "",
  propeller_time: "",
  tach_time: "",
  cycles: "",
  description_performed: "",
  discrepancy_reported: "",
  corrective_action: "",
  linked_discrepancy_id: "",
  reference_type: "",
  reference_document: "",
  reference_revision: "",
  reference_section: "",
  mechanic_name: "",
  mechanic_canac: "",
  mechanic_license_type: "",
  mechanic_signature: "",
  mechanic_is_current_user: false,
  approved_return_to_service: true,
  release_statement: "",
  aircraft_released: true,
  grounding_removed: true,
  legacy_update: false,
  data_origin: "native",
  source_confidence: "",
  source_notes: "",
  legacy_reference: "",
  migrated_at: "",
  migrated_by: "",
  parts_cost: "",
  labor_cost: "",
  other_costs: "",
  created_by: "",
  released_by_user_id: "",
  released_by_name: "",
  released_by_canac: "",
  released_by_license_type: "",
  release_is_current_user: false,
  checklist_execution: [],
};

function decimal(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberInput(value: string, integerOnly = false): string {
  const cleaned = value.replace(integerOnly ? /[^\d]/g : /[^\d.,]/g, "");
  if (integerOnly) return cleaned;
  const normalized = cleaned.replace(",", ".");
  const firstDot = normalized.indexOf(".");
  if (firstDot === -1) return normalized;
  return `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, "")}`;
}

function formatNumberValue(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function aircraftHoursPatch(aircraft: Aircraft | undefined): Partial<WorkOrderForm> {
  if (!aircraft) return {};
  return {
    aircraft_ttaf: formatNumberValue(aircraft.logbook_ttaf),
    aircraft_total_landings: formatNumberValue(aircraft.logbook_landings),
    engine_time: formatNumberValue(aircraft.logbook_engine_hours),
    propeller_time: formatNumberValue(aircraft.logbook_propeller_hours),
    tach_time: formatNumberValue(aircraft.logbook_tach_hours),
    cycles: formatNumberValue(aircraft.logbook_cycles),
  };
}

function fillEmptyAircraftHours(form: WorkOrderForm, aircraft: Aircraft | undefined): WorkOrderForm {
  const patch = aircraftHoursPatch(aircraft);
  return {
    ...form,
    aircraft_ttaf: form.aircraft_ttaf || patch.aircraft_ttaf || "",
    aircraft_total_landings: form.aircraft_total_landings || patch.aircraft_total_landings || "",
    engine_time: form.engine_time || patch.engine_time || "",
    propeller_time: form.propeller_time || patch.propeller_time || "",
    tach_time: form.tach_time || patch.tach_time || "",
    cycles: form.cycles || patch.cycles || "",
  };
}

function flightTimestamp(flight: SavedFlightListItem): number {
  const date = flight.flight_date ?? flight.created_at;
  const time = flight.start_time ? `T${flight.start_time}` : "";
  const ms = new Date(`${date}${time}`).getTime();
  return Number.isFinite(ms) ? ms : new Date(flight.created_at).getTime();
}

function flightDurationHours(flight: SavedFlightListItem, metaByFlightId: ReadonlyMap<string, FlightRecordMeta | null>): number {
  return flightAircraftHours(flight, metaByFlightId.get(flight.id));
}

function orderTimestamp(order: MaintenanceWorkOrder): number {
  const raw = order.completed_at ?? order.released_at ?? order.opened_at;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function latestAircraftBaseline(orders: MaintenanceWorkOrder[], aircraftId: string, asOfMs: number): MaintenanceWorkOrder | null {
  return orders
    .filter((order) => order.aircraft_id === aircraftId && order.work_order_type === "migration_baseline")
    .filter((order) => orderTimestamp(order) <= asOfMs)
    .sort((a, b) => orderTimestamp(b) - orderTimestamp(a))[0] ?? null;
}

function openingTimestamp(form: WorkOrderForm): number {
  const ms = new Date(form.opened_at).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

function buildAircraftHoursAt(params: {
  aircraft: Aircraft;
  orders: MaintenanceWorkOrder[];
  flights: SavedFlightListItem[];
  metaByFlightId: ReadonlyMap<string, FlightRecordMeta | null>;
  asOfMs: number;
}): Partial<WorkOrderForm> {
  const baseline = latestAircraftBaseline(params.orders, params.aircraft.id, params.asOfMs);
  const baselineMs = params.aircraft.logbook_ttaf != null
    ? params.aircraft.logbook_opening_date
      ? new Date(params.aircraft.logbook_opening_date).getTime()
      : Number.NEGATIVE_INFINITY
    : baseline
      ? orderTimestamp(baseline)
      : Number.NEGATIVE_INFINITY;

  const afterBaseline = Number.isFinite(baselineMs) ? baselineMs : Number.NEGATIVE_INFINITY;
  const rows = params.flights.filter((flight) => {
    const ms = flightTimestamp(flight);
    return ms >= afterBaseline && ms <= params.asOfMs;
  });
  const flownHours = rows.reduce((sum, flight) => sum + flightDurationHours(flight, params.metaByFlightId), 0);
  const landings = rows.reduce((sum, flight) => sum + Math.max(0, Math.round(flight.landings ?? 0)), 0);
  const addHours = (base: number | null | undefined) => base == null ? "" : Number((base + flownHours).toFixed(1)).toString();
  const addCount = (base: number | null | undefined, increment: number) => base == null ? "" : String(base + increment);

  return {
    aircraft_ttaf: addHours(params.aircraft.logbook_ttaf ?? baseline?.aircraft_ttaf),
    aircraft_total_landings: addCount(params.aircraft.logbook_landings ?? baseline?.aircraft_total_landings, landings),
    engine_time: addHours(params.aircraft.logbook_engine_hours ?? baseline?.engine_time),
    propeller_time: addHours(params.aircraft.logbook_propeller_hours ?? baseline?.propeller_time),
    tach_time: addHours(params.aircraft.logbook_tach_hours ?? baseline?.tach_time),
    cycles: addCount(params.aircraft.logbook_cycles ?? baseline?.cycles, landings),
  };
}

function fromDatetimeLocal(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextWorkOrderNumber(): string {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OS-${stamp}-${suffix}`;
}

function nowDatetimeLocal(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function datePart(value: string): string {
  return value.slice(0, 10);
}

function applySameDate(form: WorkOrderForm, date: string): WorkOrderForm {
  const time = (form.opened_at.split("T")[1] || "12:00").slice(0, 5);
  const dt = date ? `${date}T${time}` : "";
  return {
    ...form,
    opened_at: dt,
    started_at: dt,
    completed_at: dt,
    released_at: dt,
  };
}

function workOrderTypeFromItem(item: MaintenanceProgramItem | undefined): MaintenanceWorkOrder["work_order_type"] {
  if (!item) return "scheduled";
  if (item.item_type === "corrective") return "corrective";
  if (item.item_type === "preventive") return "preventive";
  if (item.item_type === "overhaul") return "overhaul";
  if (item.item_type === "inspection") return "inspection";
  return "scheduled";
}

function applyCalculationDefaults(
  form: WorkOrderForm,
  params: { userId: string; userName: string; programItem?: MaintenanceProgramItem },
): WorkOrderForm {
  const now = nowDatetimeLocal();
  const dateTime = form.opened_at || now;
  const userName = params.userName.trim() || "Sistema";
  const userId = form.created_by.trim() || params.userId;
  const item = params.programItem;
  const maintenanceLabel = item ? `${item.code} — ${item.title}` : "Manutenção";
  return {
    ...form,
    work_order_number: form.work_order_number.trim() || nextWorkOrderNumber(),
    work_order_type: form.work_order_type || workOrderTypeFromItem(item),
    status: "released",
    opened_at: dateTime,
    started_at: form.started_at || dateTime,
    completed_at: form.completed_at || dateTime,
    released_at: form.released_at || dateTime,
    description_performed: form.description_performed.trim() || maintenanceLabel,
    reference_type: form.reference_type || item?.reference_type || "MM",
    reference_document: form.reference_document.trim() || item?.reference_document || "Programa de manutenção",
    reference_revision: form.reference_revision.trim() || item?.reference_revision || "",
    reference_section: form.reference_section.trim() || item?.reference_section || "",
    mechanic_name: form.mechanic_name.trim() || userName,
    mechanic_canac: form.mechanic_canac.trim() || "N/A",
    mechanic_license_type: form.mechanic_license_type || "MMA",
    mechanic_signature: form.mechanic_signature.trim() || "N/A",
    approved_return_to_service: true,
    aircraft_released: true,
    grounding_removed: true,
    release_statement: form.release_statement.trim() || "Registro operacional para cálculo de horas.",
    data_origin: form.legacy_update ? form.data_origin : "native",
    created_by: userId,
    released_by_user_id: form.released_by_user_id.trim() || userId,
    released_by_name: form.released_by_name.trim() || userName,
    released_by_canac: form.released_by_canac.trim() || "N/A",
    released_by_license_type: form.released_by_license_type || "MMA",
    checklist_execution: form.checklist_execution.map((task) => ({ ...task, done: true })),
  };
}

function checklistFromProgramItem(item: MaintenanceProgramItem | undefined): MaintenanceWorkOrderChecklistTask[] {
  return (item?.checklist_tasks ?? []).map((task, index) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    order: task.order || index + 1,
    done: false,
    observation: "",
  }));
}

function mergeChecklistWithProgram(
  current: MaintenanceWorkOrderChecklistTask[],
  item: MaintenanceProgramItem | undefined,
): MaintenanceWorkOrderChecklistTask[] {
  if (current.length > 0) return current;
  return checklistFromProgramItem(item);
}

function formToPayload(form: WorkOrderForm): WorkOrderPayload {
  const ttaf = decimal(form.aircraft_ttaf);
  if (ttaf == null) throw new Error("Informe as horas totais da aeronave.");
  return {
    work_order_number: form.work_order_number.trim() || nextWorkOrderNumber(),
    aircraft_id: form.aircraft_id,
    maintenance_program_item_id: form.maintenance_program_item_id || null,
    work_order_type: form.work_order_type,
    status: form.status,
    opened_at: fromDatetimeLocal(form.opened_at) ?? new Date().toISOString(),
    started_at: fromDatetimeLocal(form.started_at),
    completed_at: fromDatetimeLocal(form.completed_at),
    released_at: fromDatetimeLocal(form.released_at),
    aircraft_ttaf: ttaf,
    aircraft_total_landings: integer(form.aircraft_total_landings),
    engine_time: decimal(form.engine_time),
    propeller_time: decimal(form.propeller_time),
    tach_time: decimal(form.tach_time),
    cycles: integer(form.cycles),
    description_performed: form.description_performed.trim(),
    discrepancy_reported: form.linked_discrepancy_id ? form.discrepancy_reported.trim() || null : null,
    corrective_action: form.linked_discrepancy_id ? form.corrective_action.trim() || null : null,
    linked_discrepancy_id: form.linked_discrepancy_id || null,
    reference_type: form.reference_type || null,
    reference_document: form.reference_document.trim() || null,
    reference_revision: form.reference_revision.trim() || null,
    reference_section: form.reference_section.trim() || null,
    mechanic_name: form.mechanic_name.trim() || null,
    mechanic_canac: form.mechanic_canac.trim() || null,
    mechanic_license_type: form.mechanic_license_type || null,
    mechanic_signature: form.mechanic_signature.trim() || null,
    approved_return_to_service: form.approved_return_to_service,
    release_statement: form.release_statement.trim() || null,
    aircraft_released: form.aircraft_released,
    grounding_removed: form.grounding_removed,
    legacy_update: form.legacy_update,
    data_origin: form.legacy_update ? form.data_origin : "native",
    source_confidence: form.legacy_update ? form.source_confidence || null : null,
    source_notes: form.legacy_update ? form.source_notes.trim() || null : null,
    legacy_reference: form.legacy_update ? form.legacy_reference.trim() || null : null,
    migrated_at: form.legacy_update ? fromDatetimeLocal(form.migrated_at) : null,
    migrated_by: form.legacy_update ? form.migrated_by.trim() || null : null,
    parts_cost: decimal(form.parts_cost),
    labor_cost: decimal(form.labor_cost),
    other_costs: decimal(form.other_costs),
    created_by: form.created_by.trim() || null,
    released_by_user_id: form.released_by_user_id.trim() || null,
    released_by_name: form.released_by_name.trim() || null,
    released_by_canac: form.released_by_canac.trim() || null,
    released_by_license_type: form.released_by_license_type || null,
    checklist_execution: form.checklist_execution,
  };
}

function workOrderToForm(order: MaintenanceWorkOrder): WorkOrderForm {
  return {
    work_order_number: order.work_order_number,
    aircraft_id: order.aircraft_id,
    maintenance_program_item_id: order.maintenance_program_item_id ?? "",
    work_order_type: order.work_order_type,
    status: order.status,
    opened_at: toDatetimeLocal(order.opened_at),
    started_at: toDatetimeLocal(order.started_at),
    completed_at: toDatetimeLocal(order.completed_at),
    released_at: toDatetimeLocal(order.released_at),
    aircraft_ttaf: String(order.aircraft_ttaf),
    aircraft_total_landings: order.aircraft_total_landings == null ? "" : String(order.aircraft_total_landings),
    engine_time: order.engine_time == null ? "" : String(order.engine_time),
    propeller_time: order.propeller_time == null ? "" : String(order.propeller_time),
    tach_time: order.tach_time == null ? "" : String(order.tach_time),
    cycles: order.cycles == null ? "" : String(order.cycles),
    description_performed: order.description_performed,
    discrepancy_reported: order.discrepancy_reported ?? "",
    corrective_action: order.corrective_action ?? "",
    linked_discrepancy_id: order.linked_discrepancy_id ?? "",
    reference_type: order.reference_type ?? "",
    reference_document: order.reference_document ?? "",
    reference_revision: order.reference_revision ?? "",
    reference_section: order.reference_section ?? "",
    mechanic_name: order.mechanic_name ?? "",
    mechanic_canac: order.mechanic_canac ?? "",
    mechanic_license_type: order.mechanic_license_type ?? "",
    mechanic_signature: order.mechanic_signature ?? "",
    mechanic_is_current_user: false,
    approved_return_to_service: order.approved_return_to_service,
    release_statement: order.release_statement ?? "",
    aircraft_released: order.aircraft_released,
    grounding_removed: order.grounding_removed,
    legacy_update: order.legacy_update,
    data_origin: order.data_origin,
    source_confidence: order.source_confidence ?? "",
    source_notes: order.source_notes ?? "",
    legacy_reference: order.legacy_reference ?? "",
    migrated_at: toDatetimeLocal(order.migrated_at),
    migrated_by: order.migrated_by ?? "",
    parts_cost: order.parts_cost == null ? "" : String(order.parts_cost),
    labor_cost: order.labor_cost == null ? "" : String(order.labor_cost),
    other_costs: order.other_costs == null ? "" : String(order.other_costs),
    created_by: order.created_by ?? "",
    released_by_user_id: order.released_by_user_id ?? "",
    released_by_name: order.released_by_name ?? "",
    released_by_canac: order.released_by_canac ?? "",
    released_by_license_type: order.released_by_license_type ?? "",
    release_is_current_user: false,
    checklist_execution: order.checklist_execution,
  };
}

export function MaintenanceTab() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const { canAction } = usePermissions();
  const [orders, setOrders] = useState<MaintenanceWorkOrder[]>([]);
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [models, setModels] = useState<AircraftModel[]>([]);
  const [programItems, setProgramItems] = useState<MaintenanceProgramItem[]>([]);
  const [attachments, setAttachments] = useState<Record<string, MaintenanceAttachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkOrderForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filterAircraft, setFilterAircraft] = useState("");
  const [attachmentType, setAttachmentType] = useState<MaintenanceAttachmentType>("legacy_record");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderRows, aircraftRows, modelRows] = await Promise.all([
        listWorkOrders(),
        listAircrafts(schoolId),
        listModels(),
      ]);
      const planes = aircraftRows.filter((a) => a.type === "aviao");
      const uniqueModelIds = [...new Set(planes.map((aircraft) => aircraft.model_id).filter(Boolean))];
      const itemRows = (
        await Promise.all(uniqueModelIds.map((modelId) => listProgramItemsByModel(modelId).catch(() => [] as MaintenanceProgramItem[])))
      ).flat();
      setOrders(orderRows);
      setAircrafts(planes);
      setModels(modelRows);
      setProgramItems(itemRows);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const aircraftMap = useMemo(() => new Map(aircrafts.map((aircraft) => [aircraft.id, aircraft])), [aircrafts]);
  const modelMap = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const itemMap = useMemo(() => new Map(programItems.map((item) => [item.id, item])), [programItems]);

  const selectedAircraft = aircraftMap.get(form.aircraft_id);
  const selectedProgramItem = form.maintenance_program_item_id ? itemMap.get(form.maintenance_program_item_id) : undefined;

  const programItemsForAircraft = useMemo(
    () => (selectedAircraft?.model_id ? programItems.filter((item) => item.aircraft_model_id === selectedAircraft.model_id) : []),
    [programItems, selectedAircraft?.model_id],
  );

  useEffect(() => {
    if (!showForm || !form.maintenance_program_item_id || !selectedProgramItem || form.checklist_execution.length > 0) return;
    setForm((current) => ({
      ...current,
      checklist_execution: mergeChecklistWithProgram(current.checklist_execution, selectedProgramItem),
    }));
  }, [form.checklist_execution.length, form.maintenance_program_item_id, selectedProgramItem, showForm]);

  useEffect(() => {
    if (!showForm || editingId || !selectedAircraft) return;
    let canceled = false;
    const asOfMs = openingTimestamp(form);
    const toDate = new Date(asOfMs).toISOString().slice(0, 10);
    listAllFlightsByAircraft({ aircraftIdent: selectedAircraft.registration, toDate })
      .then(async (result) => {
        if (canceled) return;
        if (result.error) throw result.error;
        const flights = result.data ?? [];
        const metaByFlightId = await getFlightRecordMetaBatch(flights.map((flight) => flight.id), { concurrency: 12 });
        if (canceled) return;
        const patch = buildAircraftHoursAt({
          aircraft: selectedAircraft,
          orders,
          flights,
          metaByFlightId,
          asOfMs,
        });
        setForm((current) => ({ ...current, ...patch }));
      })
      .catch((e: Error) => showToast({ variant: "error", message: e.message }));
    return () => {
      canceled = true;
    };
  }, [editingId, form.opened_at, orders, selectedAircraft, showForm, showToast]);

  const visibleOrders = orders.filter((order) => {
    if (filterAircraft && order.aircraft_id !== filterAircraft) return false;
    return true;
  });

  function required(value: string | null | undefined): boolean {
    return Boolean(value?.trim());
  }

  function validateOrder(): { errors: string[]; keys: Set<string> } {
    const errors: string[] = [];
    const keys = new Set<string>();
    const check = (key: string, ok: boolean, msg: string) => {
      if (!ok) { errors.push(msg); keys.add(key); }
    };

    check("aircraft_id", required(form.aircraft_id), "Selecione a aeronave.");
    check("opened_at", required(form.opened_at), "Informe a data da manutenção.");
    check("aircraft_ttaf", decimal(form.aircraft_ttaf) != null, "Informe as horas da aeronave no momento da manutenção.");
    check("maintenance_program_item_id", required(form.maintenance_program_item_id), "Selecione a manutenção realizada.");
    if (!required(form.created_by || user?.id)) errors.push("Não foi possível identificar o usuário que lançou a manutenção.");

    return { errors, keys };
  }

  const openCreate = useCallback((aircraftId?: string) => {
    const now = nowDatetimeLocal();
    const aircraft = aircraftId ? aircrafts.find((row) => row.id === aircraftId) : undefined;
    setForm({
      ...fillEmptyAircraftHours(emptyForm, aircraft),
      work_order_number: nextWorkOrderNumber(),
      created_by: user?.id ?? "",
      opened_at: now,
      started_at: now,
      completed_at: now,
      released_at: now,
      status: "released",
      work_order_type: "scheduled",
      approved_return_to_service: true,
      aircraft_released: true,
      grounding_removed: true,
      aircraft_id: aircraft?.id ?? "",
    });
    setInvalidFields(new Set());
    setEditingId(null);
    setDetailId(null);
    setShowForm(true);
  }, [aircrafts, user?.id]);

  const [launchNonce, setLaunchNonce] = useState(0);
  useEffect(() => {
    const onPop = () => setLaunchNonce((n) => n + 1);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (loading || aircrafts.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    const aircraftId = params.get("aircraft")?.trim() || "";
    openCreate(aircraftId || undefined);
    params.delete("new");
    params.delete("aircraft");
    const search = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  }, [aircrafts.length, launchNonce, loading, openCreate]);

  async function openEdit(order: MaintenanceWorkOrder) {
    setForm(workOrderToForm(order));
    setInvalidFields(new Set());
    setEditingId(order.id);
    setDetailId(order.id);
    setShowForm(true);
    await loadOrderAttachments(order.id);
  }

  async function loadOrderAttachments(orderId: string) {
    try {
      const rows = await listAttachments(orderId);
      setAttachments((prev) => ({ ...prev, [orderId]: rows }));
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    }
  }

  async function saveOrder() {
    const { errors: validationErrors, keys: validationKeys } = validateOrder();
    if (validationErrors.length > 0) {
      setInvalidFields(validationKeys);
      showToast({ variant: "error", message: validationErrors[0] });
      return;
    }
    setInvalidFields(new Set());
    setSaving(true);
    try {
      const payload = formToPayload(applyCalculationDefaults(form, {
        userId: user?.id ?? "",
        userName: user?.name ?? "",
        programItem: selectedProgramItem,
      }));
      if (editingId) {
        const updated = await updateWorkOrder(editingId, payload);
        setOrders((prev) => prev.map((order) => (order.id === editingId ? updated : order)));
        await linkDiscrepancyToWorkOrder({
          discrepancyId: updated.linked_discrepancy_id,
          workOrderId: updated.id,
          status: updated.status === "released" ? "resolved" : "linked",
          correctiveAction: updated.corrective_action,
          responsibleCanac: updated.released_by_canac ?? updated.mechanic_canac,
          picCanac: updated.released_by_canac,
        });
      } else {
        const created = await createWorkOrder(payload);
        setOrders((prev) => [created, ...prev]);
        setEditingId(created.id);
        setDetailId(created.id);
        await linkDiscrepancyToWorkOrder({
          discrepancyId: created.linked_discrepancy_id,
          workOrderId: created.id,
          status: created.status === "released" ? "resolved" : "linked",
          correctiveAction: created.corrective_action,
          responsibleCanac: created.released_by_canac ?? created.mechanic_canac,
          picCanac: created.released_by_canac,
        });
      }
      setShowForm(false);
      setAttachmentFile(null);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function removeOrder(orderId: string) {
    try {
      await softDeleteWorkOrder(orderId);
      setOrders((prev) => prev.filter((order) => order.id !== orderId));
      if (detailId === orderId) setDetailId(null);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    }
  }

  async function uploadAttachment() {
    const targetId = editingId ?? detailId;
    if (!targetId || !attachmentFile) return;
    try {
      const uploaded = await uploadWorkOrderAttachment({ workOrderId: targetId, attachmentType, file: attachmentFile });
      setAttachments((prev) => ({ ...prev, [targetId]: [uploaded, ...(prev[targetId] ?? [])] }));
      setAttachmentFile(null);
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    }
  }

  const detailOrder = detailId ? orders.find((order) => order.id === detailId) ?? null : null;
  const detailProgramItem = detailOrder?.maintenance_program_item_id
    ? itemMap.get(detailOrder.maintenance_program_item_id) ?? null
    : null;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Manutenções</h2>
          <p className="text-xs text-slate-500">Lançamento simplificado para cálculo de horas. Preencha avião, data, horas e o serviço realizado.</p>
        </div>
        {!showForm ? (
          <div className="flex flex-wrap gap-2">
            {canAction("os.create") && (
              <button type="button" onClick={() => openCreate()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
                Lançar manutenção
              </button>
            )}
          </div>
        ) : null}
      </div>

      {!showForm ? (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3 md:grid-cols-3">
          <FilterSelect
            label="Aeronave"
            value={filterAircraft}
            options={["", ...aircrafts.map((a) => a.id)]}
            labels={{ "": "Todas", ...Object.fromEntries(aircrafts.map((a) => [a.id, a.registration])) }}
            onChange={setFilterAircraft}
          />
        </div>
      ) : null}

      {showForm ? (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">{editingId ? "Editar manutenção" : "Lançar manutenção"}</h3>
          <p className="mb-4 text-xs text-slate-500">Os demais campos da OS são preenchidos automaticamente para o cálculo de horas.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              label="Avião *"
              value={form.aircraft_id}
              options={["", ...aircrafts.map((a) => a.id)]}
              labels={{ "": "Selecione o avião", ...Object.fromEntries(aircrafts.map((a) => [a.id, `${a.registration} - ${modelMap.get(a.model_id)?.name ?? "Modelo"}`])) }}
              onChange={(value) => setForm((f) => fillEmptyAircraftHours({ ...f, aircraft_id: value, maintenance_program_item_id: "", checklist_execution: [] }, aircraftMap.get(value)))}
              tooltip="Aeronave na qual a manutenção foi feita."
              invalid={invalidFields.has("aircraft_id")}
            />
            <DateOnlyField
              label="Data *"
              value={datePart(form.opened_at)}
              onChange={(value) => setForm((f) => applySameDate(f, value))}
              invalid={invalidFields.has("opened_at")}
            />
            <NumberField
              label="Horas da aeronave *"
              value={form.aircraft_ttaf}
              onChange={(value) => setForm((f) => ({ ...f, aircraft_ttaf: numberInput(value) }))}
              suffix="h"
              tooltip="Horas totais da aeronave no momento da manutenção. Sugeridas automaticamente a partir dos voos."
              invalid={invalidFields.has("aircraft_ttaf")}
            />
            <Select
              label="Manutenção realizada *"
              value={form.maintenance_program_item_id}
              options={["", ...programItemsForAircraft.map((item) => item.id)]}
              labels={{ "": selectedAircraft ? "Selecione a manutenção" : "Selecione o avião primeiro", ...Object.fromEntries(programItemsForAircraft.map((item) => [item.id, `${item.code} - ${item.title}`])) }}
              onChange={(value) => {
                const item = programItemsForAircraft.find((row) => row.id === value);
                setForm((f) => ({
                  ...f,
                  maintenance_program_item_id: value,
                  work_order_type: workOrderTypeFromItem(item),
                  checklist_execution: value ? checklistFromProgramItem(item) : [],
                  reference_type: item?.reference_type ?? f.reference_type,
                  reference_document: item?.reference_document ?? f.reference_document,
                }));
              }}
              tooltip="Item do programa de manutenção do modelo da aeronave."
              invalid={invalidFields.has("maintenance_program_item_id")}
            />
            <TextArea
              label="Observação"
              value={form.description_performed}
              onChange={(value) => setForm((f) => ({ ...f, description_performed: value }))}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveOrder()} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {!showForm ? <div className="overflow-x-auto rounded-xl border border-slate-700/60">
        <table className="min-w-[900px] text-sm">
          <thead className="border-b border-slate-700/60 bg-slate-900/60 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Aeronave</th>
              <th className="px-4 py-3 text-left">Manutenção</th>
              <th className="px-4 py-3 text-left">Data</th>
              <th className="px-4 py-3 text-left">Horas</th>
              <th className="px-4 py-3 text-left">Observação</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={index}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : visibleOrders.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nenhuma manutenção lançada.</td></tr>
            ) : visibleOrders.map((order) => {
              const aircraft = aircraftMap.get(order.aircraft_id);
              const programItem = order.maintenance_program_item_id ? itemMap.get(order.maintenance_program_item_id) : null;
              return (
                <tr key={order.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-slate-300">{aircraft?.registration ?? "Aeronave"}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {programItem ? (
                      <span title={programItem.title}>
                        <span className="font-mono text-slate-300">{programItem.code}</span> - {programItem.title}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(order.completed_at ?? order.opened_at)}</td>
                  <td className="px-4 py-3 text-slate-300">{order.aircraft_ttaf} h</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-400" title={order.description_performed}>{order.description_performed || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => { setDetailId(order.id); void loadOrderAttachments(order.id); }} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700">Detalhes</button>
                      <button type="button" onClick={() => void openEdit(order)} className="rounded px-2 py-1 text-xs text-sky-400 hover:bg-sky-500/10">Editar</button>
                      <button type="button" onClick={() => void removeOrder(order.id)} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10">Remover</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div> : null}

      {!showForm && detailOrder ? (
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                {aircraftMap.get(detailOrder.aircraft_id)?.registration ?? "Aeronave"}
              </h3>
              <p className="mt-1 text-xs text-sky-300">
                {detailProgramItem ? `${detailProgramItem.code} - ${detailProgramItem.title}` : "Manutenção"}
              </p>
            </div>
            <button type="button" onClick={() => setDetailId(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400">Fechar</button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Info label="Data" value={formatDate(detailOrder.completed_at ?? detailOrder.opened_at)} />
            <Info label="Horas da aeronave" value={`${detailOrder.aircraft_ttaf} h`} />
            <Info label="Observação" value={detailOrder.description_performed || "-"} className="md:col-span-3" />
          </div>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
            <h4 className="text-sm font-semibold text-slate-200">Anexos e evidencias</h4>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_auto]">
              <Select label="Tipo" value={attachmentType} options={ATTACHMENT_TYPES} labels={ATTACHMENT_LABELS} onChange={(value) => setAttachmentType(value as MaintenanceAttachmentType)} />
              <label>
                <span className="mb-1 block text-xs text-slate-500">Arquivo</span>
                <input type="file" onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-sky-600 file:px-2 file:py-1 file:text-xs file:text-white" />
              </label>
              <button type="button" onClick={() => void uploadAttachment()} disabled={!attachmentFile} className="self-end rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                Anexar
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {(attachments[detailOrder.id] ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum anexo cadastrado.</p>
              ) : (attachments[detailOrder.id] ?? []).map((attachment) => (
                <a key={attachment.id} href={attachment.file_url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60">
                  <span>{attachment.file_name}</span>
                  <span className="text-xs text-slate-500">{attachment.attachment_type}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  integerOnly = false,
  tooltip,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  integerOnly?: boolean;
  tooltip?: string;
  invalid?: boolean;
}) {
  return (
    <label title={tooltip ?? label}>
      <span className={`mb-1 block text-xs ${invalid ? "text-red-400" : "text-slate-500"}`}>{label}</span>
      <div className="relative">
        <input
          type="number"
          min="0"
          step={integerOnly ? "1" : "0.1"}
          inputMode={integerOnly ? "numeric" : "decimal"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-lg border bg-slate-800 px-3 py-2 pr-12 text-sm text-slate-100 outline-none focus:border-sky-500 ${invalid ? "border-red-500" : "border-slate-700"}`}
        />
        {suffix ? <span className="pointer-events-none absolute right-3 top-2 text-xs text-slate-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function DateOnlyField({ label, value, onChange, invalid }: { label: string; value: string; onChange: (value: string) => void; invalid?: boolean }) {
  return (
    <label title={label}>
      <span className={`mb-1 block text-xs ${invalid ? "text-red-400" : "text-slate-500"}`}>{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className={`w-full rounded-lg border bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 ${invalid ? "border-red-500" : "border-slate-700"}`} />
    </label>
  );
}

function Select({ label, value, options, labels = {}, onChange, tooltip, invalid }: { label: string; value: string; options: readonly string[]; labels?: Record<string, string>; onChange: (value: string) => void; tooltip?: string; invalid?: boolean }) {
  return (
    <label title={tooltip ?? label}>
      <span className={`mb-1 block text-xs ${invalid ? "text-red-400" : "text-slate-500"}`}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`w-full rounded-lg border bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 ${invalid ? "border-red-500" : "border-slate-700"}`}>
        {options.map((option) => <option key={option || "empty"} value={option}>{(labels[option] ?? option) || "Não informado"}</option>)}
      </select>
    </label>
  );
}

function FilterSelect(props: Parameters<typeof Select>[0]) {
  return <Select {...props} />;
}

function TextArea({ label, value, onChange, invalid }: { label: string; value: string; onChange: (value: string) => void; invalid?: boolean }) {
  return (
    <label className="md:col-span-2" title={label}>
      <span className={`mb-1 block text-xs ${invalid ? "text-red-400" : "text-slate-500"}`}>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className={`w-full rounded-lg border bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 ${invalid ? "border-red-500" : "border-slate-700"}`} />
    </label>
  );
}

function Info({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 ${className}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{value}</p>
    </div>
  );
}
