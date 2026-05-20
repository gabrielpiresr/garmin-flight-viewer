import { useCallback, useEffect, useMemo, useState } from "react";
import { listAircrafts } from "../../lib/aircraftDb";
import { listModels } from "../../lib/aircraftModelsDb";
import { useAuth } from "../../contexts/AuthContext";
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
import {
  discrepancyLabel,
  linkDiscrepancyToWorkOrder,
  listFlightDiscrepancies,
  type FlightDiscrepancy,
} from "../../lib/flightDiscrepanciesDb";
import { listAllFlightsByAircraft, type SavedFlightListItem } from "../../lib/flightsDb";
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

const WORK_ORDER_TYPES = ["scheduled", "unscheduled", "corrective", "preventive", "inspection", "overhaul", "migration_baseline"] as const;
const WORK_ORDER_STATUS = ["open", "in_progress", "completed", "released", "canceled"] as const;
const REFERENCE_TYPES = ["", "MM", "AMM", "IPC", "SB", "AD", "ICA", "OEM", "LEGACY_RECORD"] as const;
const LICENSE_TYPES = ["", "MMA", "CEL", "GMP"] as const;
const DATA_ORIGINS = ["native", "migration", "imported", "corrected"] as const;
const SOURCE_CONFIDENCE = ["", "low", "medium", "high"] as const;
const ATTACHMENT_TYPES = ["pdf", "image", "invoice", "certificate", "CRS", "AD", "SB", "logbook", "legacy_record", "migration_evidence"] as const;

const WORK_ORDER_TYPE_LABELS: Record<string, string> = {
  scheduled: "Programada",
  unscheduled: "Não programada",
  corrective: "Corretiva",
  preventive: "Preventiva",
  inspection: "Inspeção",
  overhaul: "Overhaul",
  migration_baseline: "Baseline técnico inicial",
};
const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  completed: "Concluída",
  released: "Liberada",
  canceled: "Cancelada",
};
const STATUS_BADGE_CLASSES: Record<string, string> = {
  open: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  in_progress: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  released: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  canceled: "border-slate-600/60 bg-slate-700/30 text-slate-400",
};
const REFERENCE_LABELS: Record<string, string> = {
  "": "Não informado",
  MM: "Manual de Manutenção (MM)",
  AMM: "Aircraft Maintenance Manual (AMM)",
  IPC: "Catálogo Ilustrado de Peças (IPC)",
  SB: "Boletim de Serviço (SB)",
  AD: "Diretriz de Aeronavegabilidade (AD)",
  ICA: "Instruções de Aeronavegabilidade Continuada (ICA)",
  OEM: "Fabricante original (OEM)",
  LEGACY_RECORD: "Registro legado",
};
const LICENSE_LABELS: Record<string, string> = {
  "": "Não informado",
  MMA: "Mecânico de Manutenção Aeronáutica (MMA)",
  CEL: "Célula (CEL)",
  GMP: "Grupo Motopropulsor (GMP)",
};
const DATA_ORIGIN_LABELS: Record<string, string> = {
  native: "Nativo",
  migration: "Migração",
  imported: "Importado",
  corrected: "Corrigido",
};
const CONFIDENCE_LABELS: Record<string, string> = {
  "": "Não informado",
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};
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
  status: "open",
  opened_at: new Date().toISOString().slice(0, 16),
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
  approved_return_to_service: false,
  release_statement: "",
  aircraft_released: false,
  grounding_removed: false,
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

function moneyValue(value: string): number {
  return decimal(value) ?? 0;
}

function moneyLabel(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function flightDurationHours(flight: SavedFlightListItem): number {
  if (typeof flight.total_flight_minutes === "number" && Number.isFinite(flight.total_flight_minutes)) {
    return flight.total_flight_minutes / 60;
  }
  if (typeof flight.duration_sec === "number" && Number.isFinite(flight.duration_sec)) {
    return flight.duration_sec / 3600;
  }
  return 0;
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
  const flownHours = rows.reduce((sum, flight) => sum + flightDurationHours(flight), 0);
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
  return date.toISOString().slice(0, 16);
}

function nextWorkOrderNumber(): string {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OS-${stamp}-${suffix}`;
}

function nowDatetimeLocal(): string {
  return new Date().toISOString().slice(0, 16);
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

function hasPendingChecklistTasks(form: WorkOrderForm): boolean {
  return form.checklist_execution.some((task) => !task.done);
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
  const [filter, setFilter] = useState({ aircraft: "", status: "", type: "", origin: "", mechanic: "" });
  const [attachmentType, setAttachmentType] = useState<MaintenanceAttachmentType>("legacy_record");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [discrepancies, setDiscrepancies] = useState<FlightDiscrepancy[]>([]);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderRows, aircraftRows, modelRows] = await Promise.all([
        listWorkOrders(),
        listAircrafts(schoolId),
        listModels(),
      ]);
      setOrders(orderRows);
      setAircrafts(aircraftRows);
      setModels(modelRows);
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

  useEffect(() => {
    if (!selectedAircraft?.model_id) {
      setProgramItems([]);
      setDiscrepancies([]);
      return;
    }
    listProgramItemsByModel(selectedAircraft.model_id)
      .then(setProgramItems)
      .catch((e: Error) => showToast({ variant: "error", message: e.message }));
    listFlightDiscrepancies(selectedAircraft.registration)
      .then(setDiscrepancies)
      .catch((e: Error) => showToast({ variant: "error", message: e.message }));
  }, [selectedAircraft?.model_id, selectedAircraft?.registration, showToast]);

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
      .then((result) => {
        if (canceled) return;
        if (result.error) throw result.error;
        const patch = buildAircraftHoursAt({
          aircraft: selectedAircraft,
          orders,
          flights: result.data ?? [],
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
    if (filter.aircraft && order.aircraft_id !== filter.aircraft) return false;
    if (filter.status && order.status !== filter.status) return false;
    if (filter.type && order.work_order_type !== filter.type) return false;
    if (filter.origin && order.data_origin !== filter.origin) return false;
    if (filter.mechanic && !(order.mechanic_name ?? "").toLowerCase().includes(filter.mechanic.toLowerCase())) return false;
    return true;
  });

  const budgetTotal = moneyValue(form.parts_cost) + moneyValue(form.labor_cost) + moneyValue(form.other_costs);

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
    check("work_order_type", required(form.work_order_type), "Selecione o tipo da OS.");
    check("status", required(form.status), "Selecione o status.");
    check("opened_at", required(form.opened_at), "Data/hora de abertura nao foi definida pelo fluxo da OS.");
    if (!required(form.created_by || user?.id)) errors.push("Não foi possível identificar o usuário que abriu a OS.");

    if (form.work_order_type === "scheduled") {
      check("maintenance_program_item_id", required(form.maintenance_program_item_id), "OS programada exige item do programa de manutenção.");
    }

    if (form.status === "in_progress") {
      check("started_at", required(form.started_at), "OS em andamento exige data/hora de início.");
      check("aircraft_ttaf", decimal(form.aircraft_ttaf) != null, "OS em andamento exige Total de horas aeronave (TTAF).");
    }

    const baseline = form.work_order_type === "migration_baseline";
    if (baseline && form.aircraft_id) {
      const existingBaseline = orders.some(
        (order) =>
          order.aircraft_id === form.aircraft_id &&
          order.work_order_type === "migration_baseline" &&
          order.id !== editingId
      );
      if (!existingBaseline === false) errors.push("Esta aeronave já possui um baseline técnico inicial cadastrado.");
      check("aircraft_total_landings", integer(form.aircraft_total_landings) != null, "Baseline técnico exige total de pousos da aeronave.");
    }

    if (form.status === "completed" || form.status === "released") {
      check("aircraft_ttaf", decimal(form.aircraft_ttaf) != null, "Para concluir, informe Total de horas aeronave (TTAF).");
      check("description_performed", required(form.description_performed), "Para concluir, informe a descrição executada.");
      if (form.legacy_update) check("data_origin", required(form.data_origin), "Para concluir, informe a origem do dado.");

      if (baseline) {
        if (form.data_origin !== "migration") errors.push("Baseline técnico deve ter origem do dado igual a migração.");
        check("source_confidence", required(form.source_confidence), "Baseline técnico exige nível de confiança.");
        check("source_notes", required(form.source_notes), "Baseline técnico exige notas da origem.");
      } else {
        check("completed_at", required(form.completed_at), "Para concluir, informe data/hora de conclusão.");
        check("reference_type", required(form.reference_type), "Para concluir, informe o tipo de referência.");
        check("reference_document", required(form.reference_document), "Para concluir, informe o documento de referência.");
        check("mechanic_name", required(form.mechanic_name), "Para concluir, informe o mecânico responsável.");
        check("mechanic_canac", required(form.mechanic_canac), "Para concluir, informe CANAC/licença.");
        check("mechanic_license_type", required(form.mechanic_license_type), "Para concluir, informe o tipo de licença.");
      }

      if (form.linked_discrepancy_id) {
        check("discrepancy_reported", required(form.discrepancy_reported), "OS corretiva concluída exige discrepância reportada.");
        check("corrective_action", required(form.corrective_action), "OS corretiva concluída exige ação corretiva.");
      }
    }

    if (form.status === "released") {
      check("released_at", required(form.released_at), "Para liberar, informe data/hora da liberação.");
      check("approved_return_to_service", form.approved_return_to_service, "Para liberar, marque retorno ao serviço aprovado.");
      check("aircraft_released", form.aircraft_released, "Para liberar, marque aeronave liberada.");
      check("release_statement", required(form.release_statement), "Para liberar, informe a declaração de retorno ao serviço.");
      check("mechanic_signature", required(form.mechanic_signature), "Para liberar, informe assinatura/hash ou referência.");
      if (!required(form.released_by_user_id)) errors.push("Para liberar, marque a flag de usuario responsavel pela liberacao.");
      check("released_by_name", required(form.released_by_name), "Para liberar, informe o nome do responsável pela liberação.");
      check("released_by_canac", required(form.released_by_canac), "Para liberar, informe o CANAC/licença do responsável pela liberação.");
      check("released_by_license_type", required(form.released_by_license_type), "Para liberar, informe a habilitação do responsável pela liberação.");
    }

    return { errors, keys };
  }

  function applyStatusFlow(status: WorkOrderForm["status"]) {
    const now = nowDatetimeLocal();
    setForm((current) => ({
      ...current,
      status,
      opened_at: current.opened_at || now,
      started_at: ["in_progress", "completed", "released"].includes(status) ? current.started_at || now : "",
      completed_at: ["completed", "released"].includes(status) ? current.completed_at || now : "",
      released_at: status === "released" ? current.released_at || now : "",
    }));
  }

  function applyCurrentUserAsMechanic(checked: boolean) {
    setForm((current) => ({
      ...current,
      mechanic_is_current_user: checked,
      mechanic_name: checked ? user?.name || current.mechanic_name : current.mechanic_name,
    }));
  }

  function applyCurrentUserAsReleaseResponsible(checked: boolean) {
    setForm((current) => ({
      ...current,
      release_is_current_user: checked,
      released_by_user_id: checked ? user?.id || current.released_by_user_id : "",
      released_by_name: checked ? user?.name || current.released_by_name : current.released_by_name,
    }));
  }

  function updateChecklistTask(taskId: string, patch: Partial<MaintenanceWorkOrderChecklistTask>) {
    setForm((current) => ({
      ...current,
      checklist_execution: current.checklist_execution.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    }));
  }

  function openCreate(type: MaintenanceWorkOrder["work_order_type"] = "scheduled") {
    const aircraft = aircrafts[0];
    setForm({
      ...fillEmptyAircraftHours(emptyForm, aircraft),
      work_order_number: nextWorkOrderNumber(),
      created_by: user?.id ?? "",
      work_order_type: type,
      data_origin: type === "migration_baseline" ? "migration" : "native",
      legacy_update: type === "migration_baseline",
      reference_type: type === "migration_baseline" ? "LEGACY_RECORD" : "",
      aircraft_id: aircraft?.id ?? "",
      description_performed:
        type === "migration_baseline"
          ? "Baseline tecnico inicial criado com base em registros antigos."
          : "",
    });
    setInvalidFields(new Set());
    setEditingId(null);
    setDetailId(null);
    setShowForm(true);
  }

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
    if ((form.status === "completed" || form.status === "released") && hasPendingChecklistTasks(form)) {
      showToast({ variant: "warning", message: "Checklist com tarefas pendentes. A OS sera salva mesmo assim." });
    }
    setInvalidFields(new Set());
    setSaving(true);
    try {
      const payload = formToPayload({
        ...form,
        created_by: form.created_by || user?.id || "",
      });
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
      if (selectedAircraft?.registration) {
        setDiscrepancies(await listFlightDiscrepancies(selectedAircraft.registration));
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

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Ordens de Serviço</h2>
          <p className="text-xs text-slate-500">OS por aeronave, baseline tecnico inicial e evidencias anexas.</p>
        </div>
        {!showForm ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openCreate()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
              Nova OS
            </button>
          </div>
        ) : null}
      </div>

      {!showForm ? <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3 md:grid-cols-5">
        <FilterSelect label="Aeronave" value={filter.aircraft} options={["", ...aircrafts.map((a) => a.id)]} labels={Object.fromEntries(aircrafts.map((a) => [a.id, a.registration]))} onChange={(value) => setFilter((f) => ({ ...f, aircraft: value }))} />
        <FilterSelect label="Status" value={filter.status} options={["", ...WORK_ORDER_STATUS]} labels={STATUS_LABELS} onChange={(value) => setFilter((f) => ({ ...f, status: value }))} />
        <FilterSelect label="Tipo" value={filter.type} options={["", ...WORK_ORDER_TYPES]} labels={WORK_ORDER_TYPE_LABELS} onChange={(value) => setFilter((f) => ({ ...f, type: value }))} />
        <FilterSelect label="Origem" value={filter.origin} options={["", ...DATA_ORIGINS]} labels={DATA_ORIGIN_LABELS} onChange={(value) => setFilter((f) => ({ ...f, origin: value }))} />
        <label>
          <span className="mb-1 block text-xs text-slate-500">Mecânico</span>
          <input value={filter.mechanic} onChange={(event) => setFilter((f) => ({ ...f, mechanic: event.target.value }))} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
        </label>
      </div> : null}

      {showForm ? (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">{editingId ? "Editar OS" : "Nova OS"}</h3>
          <div className="space-y-4">
            {/* Seção 1 — Identificação */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Identificação</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <ReadOnly label="Número da OS" value={form.work_order_number || "Gerado ao salvar"} tooltip="Gerado automaticamente pelo sistema." />
                <Select label="Aeronave *" value={form.aircraft_id} options={aircrafts.map((a) => a.id)} labels={Object.fromEntries(aircrafts.map((a) => [a.id, `${a.registration} - ${modelMap.get(a.model_id)?.name ?? "Modelo"}`]))} onChange={(value) => setForm((f) => fillEmptyAircraftHours({ ...f, aircraft_id: value, maintenance_program_item_id: "", checklist_execution: [] }, aircraftMap.get(value)))} tooltip="A aeronave específica à qual a OS ficará vinculada." invalid={invalidFields.has("aircraft_id")} />
                <Select label="Tipo *" value={form.work_order_type} options={editingId ? WORK_ORDER_TYPES : WORK_ORDER_TYPES.filter((t) => t !== "migration_baseline")} labels={WORK_ORDER_TYPE_LABELS} onChange={(value) => setForm((f) => ({ ...f, work_order_type: value as WorkOrderForm["work_order_type"], data_origin: value === "migration_baseline" ? "migration" : f.data_origin }))} tooltip="Tipo de ordem de serviço." invalid={invalidFields.has("work_order_type")} />
                <Select label="Status *" value={form.status} options={WORK_ORDER_STATUS} labels={STATUS_LABELS} onChange={(value) => applyStatusFlow(value as WorkOrderForm["status"])} tooltip="Status administrativo da OS." invalid={invalidFields.has("status")} />
                <Select label="Item do programa" value={form.maintenance_program_item_id} options={["", ...programItems.map((item) => item.id)]} labels={Object.fromEntries(programItems.map((item) => [item.id, `${item.code} - ${item.title}`]))} onChange={(value) => { const item = programItems.find((row) => row.id === value); setForm((f) => ({ ...f, maintenance_program_item_id: value, checklist_execution: value ? checklistFromProgramItem(item) : [] })); }} tooltip="Lista apenas itens do programa do modelo da aeronave selecionada." invalid={invalidFields.has("maintenance_program_item_id")} />
              </div>
              <div className="mt-3">
                <Check label="Atualizacao antiga" checked={form.legacy_update} onChange={(value) => setForm((f) => ({ ...f, legacy_update: value, data_origin: value ? f.data_origin : "native" }))} />
              </div>
            </section>

            {/* Seção 2 — Datas e horários */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Datas e horários</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <DateField label="Abertura *" value={form.opened_at} onChange={(value) => setForm((f) => ({ ...f, opened_at: value }))} invalid={invalidFields.has("opened_at")} readOnly={!form.legacy_update} />
                <DateField label="Inicio" value={form.started_at} onChange={(value) => setForm((f) => ({ ...f, started_at: value }))} invalid={invalidFields.has("started_at")} readOnly={!form.legacy_update} />
                <DateField label="Conclusao" value={form.completed_at} onChange={(value) => setForm((f) => ({ ...f, completed_at: value }))} invalid={invalidFields.has("completed_at")} readOnly={!form.legacy_update} />
                <DateField label="Liberacao" value={form.released_at} onChange={(value) => setForm((f) => ({ ...f, released_at: value }))} invalid={invalidFields.has("released_at")} readOnly={!form.legacy_update} />
              </div>
            </section>

            {/* Seção 3 — Horas da aeronave */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Horas da aeronave</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <NumberField label="TTAF *" value={form.aircraft_ttaf} onChange={(value) => setForm((f) => ({ ...f, aircraft_ttaf: numberInput(value) }))} suffix="h" tooltip="Horas totais da aeronave no momento da OS." invalid={invalidFields.has("aircraft_ttaf")} />
                <NumberField label="Pousos totais" value={form.aircraft_total_landings} onChange={(value) => setForm((f) => ({ ...f, aircraft_total_landings: numberInput(value, true) }))} integerOnly invalid={invalidFields.has("aircraft_total_landings")} />
                <NumberField label="Horas motor" value={form.engine_time} onChange={(value) => setForm((f) => ({ ...f, engine_time: numberInput(value) }))} suffix="h" />
                <NumberField label="Horas hélice" value={form.propeller_time} onChange={(value) => setForm((f) => ({ ...f, propeller_time: numberInput(value) }))} suffix="h" />
                <NumberField label="Horas tacômetro" value={form.tach_time} onChange={(value) => setForm((f) => ({ ...f, tach_time: numberInput(value) }))} suffix="h" />
                <NumberField label="Ciclos" value={form.cycles} onChange={(value) => setForm((f) => ({ ...f, cycles: numberInput(value, true) }))} integerOnly />
              </div>
            </section>

            {/* Seção 4 — Execução */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Execução</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <TextArea label="Descrição executada *" value={form.description_performed} onChange={(value) => setForm((f) => ({ ...f, description_performed: value }))} invalid={invalidFields.has("description_performed")} />
                {form.checklist_execution.length > 0 ? (
                  <>
                    <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Checklist da manutencao</p>
                      <p className="text-xs text-slate-500">
                        {form.checklist_execution.filter((task) => task.done).length}/{form.checklist_execution.length} feitas
                      </p>
                    </div>
                    {form.checklist_execution.map((task) => (
                      <div key={task.id} className="md:col-span-4 rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                        <label className="flex items-start gap-3">
                          <input type="checkbox" checked={task.done} onChange={(event) => updateChecklistTask(task.id, { done: event.target.checked })} className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-800" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-200">{task.title}</span>
                            {task.description ? <span className="mt-1 block whitespace-pre-wrap text-xs text-slate-500">{task.description}</span> : null}
                          </span>
                        </label>
                        <label className="mt-3 block">
                          <span className="mb-1 block text-xs text-slate-500">OBS</span>
                          <textarea value={task.observation} onChange={(event) => updateChecklistTask(task.id, { observation: event.target.value })} rows={2} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                        </label>
                      </div>
                    ))}
                  </>
                ) : null}
                <Select label="Discrepancia vinculada" value={form.linked_discrepancy_id} options={["", ...discrepancies.map((item) => item.id)]} labels={Object.fromEntries(discrepancies.map((item) => [item.id, discrepancyLabel(item)]))} onChange={(value) => { const item = discrepancies.find((row) => row.id === value); setForm((f) => ({ ...f, linked_discrepancy_id: value, discrepancy_reported: value ? f.discrepancy_reported || item?.discrepancy_text || "" : "", corrective_action: value ? f.corrective_action : "" })); }} tooltip="Opcional: liga esta OS a uma discrepância registrada no diário." />
                {form.linked_discrepancy_id ? (
                  <>
                    <TextArea label="Discrepancia reportada" value={form.discrepancy_reported} onChange={(value) => setForm((f) => ({ ...f, discrepancy_reported: value }))} invalid={invalidFields.has("discrepancy_reported")} />
                    <TextArea label="Acao corretiva" value={form.corrective_action} onChange={(value) => setForm((f) => ({ ...f, corrective_action: value }))} invalid={invalidFields.has("corrective_action")} />
                  </>
                ) : null}
              </div>
            </section>

            {/* Seção 5 — Referência técnica */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Referência técnica</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Select label="Tipo de referência" value={form.reference_type} options={REFERENCE_TYPES} labels={REFERENCE_LABELS} onChange={(value) => setForm((f) => ({ ...f, reference_type: value as WorkOrderForm["reference_type"] }))} tooltip="Documento técnico ou registro legado usado como referência." invalid={invalidFields.has("reference_type")} />
                <Field label="Documento/referência" value={form.reference_document} onChange={(value) => setForm((f) => ({ ...f, reference_document: value }))} invalid={invalidFields.has("reference_document")} />
                <Field label="Revisão" value={form.reference_revision} onChange={(value) => setForm((f) => ({ ...f, reference_revision: value }))} />
                <Field label="Seção" value={form.reference_section} onChange={(value) => setForm((f) => ({ ...f, reference_section: value }))} />
              </div>
            </section>

            {/* Seção 6 — Mecânico responsável */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Mecânico responsável</h4>
              <div className="mb-3">
                <Check label="Sou o mecanico responsavel" checked={form.mechanic_is_current_user} onChange={applyCurrentUserAsMechanic} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Nome do mecânico" value={form.mechanic_name} onChange={(value) => setForm((f) => ({ ...f, mechanic_name: value }))} invalid={invalidFields.has("mechanic_name")} />
                <Field label="CANAC/licença" value={form.mechanic_canac} onChange={(value) => setForm((f) => ({ ...f, mechanic_canac: value }))} invalid={invalidFields.has("mechanic_canac")} />
                <Select label="Tipo de licença" value={form.mechanic_license_type} options={LICENSE_TYPES} labels={LICENSE_LABELS} onChange={(value) => setForm((f) => ({ ...f, mechanic_license_type: value as WorkOrderForm["mechanic_license_type"] }))} tooltip="Habilitação relacionada ao serviço." invalid={invalidFields.has("mechanic_license_type")} />
                <Field label="Assinatura/hash" value={form.mechanic_signature} onChange={(value) => setForm((f) => ({ ...f, mechanic_signature: value }))} invalid={invalidFields.has("mechanic_signature")} />
              </div>
            </section>

            {/* Seção 7 — Responsável pela liberação */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Responsável pela liberação</h4>
              <div className="mb-3">
                <Check label="Sou o responsavel pela liberacao" checked={form.release_is_current_user} onChange={applyCurrentUserAsReleaseResponsible} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Nome do responsável" value={form.released_by_name} onChange={(value) => setForm((f) => ({ ...f, released_by_name: value }))} tooltip="Obrigatório quando o status for liberada." invalid={invalidFields.has("released_by_name")} />
                <Field label="CANAC/licença do responsável" value={form.released_by_canac} onChange={(value) => setForm((f) => ({ ...f, released_by_canac: value }))} tooltip="Obrigatório quando o status for liberada." invalid={invalidFields.has("released_by_canac")} />
                <Select label="Habilitação do responsável" value={form.released_by_license_type} options={LICENSE_TYPES} labels={LICENSE_LABELS} onChange={(value) => setForm((f) => ({ ...f, released_by_license_type: value as WorkOrderForm["released_by_license_type"] }))} tooltip="Obrigatório quando o status for liberada." invalid={invalidFields.has("released_by_license_type")} />
                <ReadOnly label="Usuário responsável" value={form.released_by_user_id || "Nao selecionado"} tooltip="Identificador interno do usuário autorizado que liberou." />
              </div>
            </section>

            {form.legacy_update ? (
              <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Dados de origem</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Select label="Origem do dado" value={form.data_origin} options={DATA_ORIGINS} labels={DATA_ORIGIN_LABELS} onChange={(value) => setForm((f) => ({ ...f, data_origin: value as WorkOrderForm["data_origin"] }))} tooltip="Origem do registro: nativo, migracao, importacao ou correcao." invalid={invalidFields.has("data_origin")} />
                  <Select label="Confianca" value={form.source_confidence} options={SOURCE_CONFIDENCE} labels={CONFIDENCE_LABELS} onChange={(value) => setForm((f) => ({ ...f, source_confidence: value as WorkOrderForm["source_confidence"] }))} tooltip="Nivel de confiabilidade do dado migrado/importado." invalid={invalidFields.has("source_confidence")} />
                  <TextArea label="Notas da origem" value={form.source_notes} onChange={(value) => setForm((f) => ({ ...f, source_notes: value }))} invalid={invalidFields.has("source_notes")} />
                  <Field label="Referencia legada" value={form.legacy_reference} onChange={(value) => setForm((f) => ({ ...f, legacy_reference: value }))} />
                  <DateField label="Migrado em" value={form.migrated_at} onChange={(value) => setForm((f) => ({ ...f, migrated_at: value }))} />
                  <Field label="Migrado por" value={form.migrated_by} onChange={(value) => setForm((f) => ({ ...f, migrated_by: value }))} />
                </div>
              </section>
            ) : null}

            {/* Seção 9 — Orçamento */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Orçamento</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <MoneyField label="Valor peças" value={form.parts_cost} onChange={(value) => setForm((f) => ({ ...f, parts_cost: numberInput(value) }))} />
                <MoneyField label="Valor mão de obra" value={form.labor_cost} onChange={(value) => setForm((f) => ({ ...f, labor_cost: numberInput(value) }))} />
                <MoneyField label="Outros gastos" value={form.other_costs} onChange={(value) => setForm((f) => ({ ...f, other_costs: numberInput(value) }))} />
                <ReadOnly label="Valor total" value={moneyLabel(budgetTotal)} tooltip="Soma automática de peças, mão de obra e outros gastos." />
              </div>
            </section>

            {/* Seção 10 — Liberação */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Liberação</h4>
              <div className="flex flex-wrap gap-4">
                <Check label="Retorno ao serviço aprovado" checked={form.approved_return_to_service} onChange={(value) => setForm((f) => ({ ...f, approved_return_to_service: value }))} invalid={invalidFields.has("approved_return_to_service")} />
                <Check label="Aeronave liberada" checked={form.aircraft_released} onChange={(value) => setForm((f) => ({ ...f, aircraft_released: value }))} invalid={invalidFields.has("aircraft_released")} />
                <Check label="Grounding removido" checked={form.grounding_removed} onChange={(value) => setForm((f) => ({ ...f, grounding_removed: value }))} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <TextArea label="Declaração de retorno ao serviço" value={form.release_statement} onChange={(value) => setForm((f) => ({ ...f, release_statement: value }))} invalid={invalidFields.has("release_statement")} />
              </div>
            </section>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void saveOrder()} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar OS"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {!showForm ? <div className="overflow-x-auto rounded-xl border border-slate-700/60">
        <table className="min-w-[1250px] text-sm">
          <thead className="border-b border-slate-700/60 bg-slate-900/60 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">OS</th>
              <th className="px-4 py-3 text-left">Aeronave</th>
              <th className="px-4 py-3 text-left">Item do programa</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Abertura</th>
              <th className="px-4 py-3 text-left">Conclusao</th>
              <th className="px-4 py-3 text-left">Liberacao</th>
              <th className="px-4 py-3 text-left">Origem</th>
              <th className="px-4 py-3 text-left">Mecânico</th>
              <th className="px-4 py-3 text-left">Liberada</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={index}><td colSpan={12} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : visibleOrders.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-500">Nenhuma OS encontrada.</td></tr>
            ) : visibleOrders.map((order) => {
              const aircraft = aircraftMap.get(order.aircraft_id);
              const programItem = order.maintenance_program_item_id ? itemMap.get(order.maintenance_program_item_id) : null;
              return (
                <tr key={order.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-mono text-slate-200">{order.work_order_number}</td>
                  <td className="px-4 py-3 text-slate-300">{aircraft?.registration ?? "Aeronave"}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {programItem ? (
                      <span title={programItem.title}>
                        <span className="font-mono text-slate-300">{programItem.code}</span> - {programItem.title}
                      </span>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{WORK_ORDER_TYPE_LABELS[order.work_order_type] ?? order.work_order_type}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[order.status] ?? "border-slate-700 bg-slate-800 text-slate-400"}`}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(order.opened_at)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(order.completed_at)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(order.released_at)}</td>
                  <td className="px-4 py-3 text-slate-400">{DATA_ORIGIN_LABELS[order.data_origin] ?? order.data_origin}</td>
                  <td className="px-4 py-3 text-slate-400">{order.mechanic_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-400">{order.aircraft_released ? "Sim" : "Não"}</td>
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
              <h3 className="font-mono text-sm font-semibold text-slate-100">{detailOrder.work_order_number}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {aircraftMap.get(detailOrder.aircraft_id)?.registration} · {detailOrder.work_order_type} · {detailOrder.status}
              </p>
              {detailOrder.maintenance_program_item_id ? (
                <p className="mt-1 text-xs text-sky-300">
                  Item: {itemMap.get(detailOrder.maintenance_program_item_id)?.code ?? detailOrder.maintenance_program_item_id}
                </p>
              ) : null}
            </div>
            <button type="button" onClick={() => setDetailId(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400">Fechar</button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Info label="TTAF" value={`${detailOrder.aircraft_ttaf} h`} />
            <Info label="Pousos totais" value={detailOrder.aircraft_total_landings == null ? "-" : String(detailOrder.aircraft_total_landings)} />
            <Info label="Origem" value={detailOrder.data_origin} />
            <Info label="Referência legada" value={detailOrder.legacy_reference ?? "-"} />
            <Info label="Discrepância vinculada" value={detailOrder.linked_discrepancy_id ?? "-"} />
            <Info label="Descrição" value={detailOrder.description_performed} className="md:col-span-3" />
            {detailOrder.checklist_execution.length > 0 ? (
              <div className="md:col-span-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
                <p className="text-xs text-slate-500">Checklist</p>
                <div className="mt-2 space-y-2">
                  {detailOrder.checklist_execution.map((task) => (
                    <div key={task.id} className="rounded border border-slate-800 bg-slate-900/50 p-2">
                      <p className="text-sm font-medium text-slate-200">{task.done ? "Feito" : "Pendente"} - {task.title}</p>
                      {task.description ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{task.description}</p> : null}
                      {task.observation ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">OBS: {task.observation}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <Info
              label="Orçamento"
              value={moneyLabel((detailOrder.parts_cost ?? 0) + (detailOrder.labor_cost ?? 0) + (detailOrder.other_costs ?? 0))}
            />
            <Info label="Notas da origem" value={detailOrder.source_notes ?? "-"} className="md:col-span-3" />
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

function Field({ label, value, onChange, placeholder = "", tooltip, invalid }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; tooltip?: string; invalid?: boolean }) {
  return (
    <label title={tooltip ?? label}>
      <span className={`mb-1 block text-xs ${invalid ? "text-red-400" : "text-slate-500"}`}>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={`w-full rounded-lg border bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 ${invalid ? "border-red-500" : "border-slate-700"}`} />
    </label>
  );
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

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label title={label}>
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-2 text-xs text-slate-500">R$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pl-9 text-sm text-slate-100 outline-none focus:border-sky-500"
        />
      </div>
    </label>
  );
}

function ReadOnly({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <label title={tooltip ?? label}>
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input value={value} readOnly className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-300 outline-none" />
    </label>
  );
}

function DateField({ label, value, onChange, invalid, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; invalid?: boolean; readOnly?: boolean }) {
  return (
    <label title={label}>
      <span className={`mb-1 block text-xs ${invalid ? "text-red-400" : "text-slate-500"}`}>{label}</span>
      <input type="datetime-local" value={value} readOnly={readOnly} disabled={readOnly} onChange={(event) => onChange(event.target.value)} className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-sky-500 ${readOnly ? "bg-slate-950 text-slate-400" : "bg-slate-800 text-slate-100"} ${invalid ? "border-red-500" : "border-slate-700"}`} />
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

function Check({ label, checked, onChange, invalid }: { label: string; checked: boolean; onChange: (value: boolean) => void; invalid?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-700 bg-slate-800" />
      <span className={invalid ? "text-red-400" : ""}>{label}</span>
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
