import type { Aircraft } from "../types/admin";

export const DEFAULT_FUEL_DENSITY_KG_PER_L = 0.72;

export type FuelQuantityUnit = "kg" | "l";
export type WeightBalancePointId = "ramp" | "takeoff" | "landing";

export type WeightBalanceFuelInput = {
  value: number | null;
  unit: FuelQuantityUnit;
  weightKg: number | null;
};

export type WeightBalanceInputs = {
  personsOnBoard: number | null;
  occupantsWeightKg: number | null;
  baggageWeightKg: number | null;
  rampFuel: WeightBalanceFuelInput;
  taxiFuel: WeightBalanceFuelInput;
  tripFuel: WeightBalanceFuelInput;
};

export type WeightBalanceAircraftSnapshot = {
  aircraftId?: string;
  registration: string;
  emptyWeightKg: number | null;
  emptyArmMm: number | null;
  occupantsArmMm: number | null;
  occupantsMaxKg: number | null;
  baggageArmMm: number | null;
  baggageMaxKg: number | null;
  fuelArmMm: number | null;
  fuelMaxKg: number | null;
  fuelDensityKgPerL: number;
  maxWeightKg: number | null;
  armMinMm: number | null;
  armMaxMm: number | null;
};

export type WeightBalancePoint = {
  id: WeightBalancePointId;
  label: string;
  weightKg: number | null;
  momentKgMm: number | null;
  armMm: number | null;
  inEnvelope: boolean | null;
  issues: string[];
};

export type WeightBalanceResults = {
  stationIssues: string[];
  points: WeightBalancePoint[];
  isComplete: boolean;
  isWithinLimits: boolean;
};

export type FlightWeightBalanceMeta = {
  version: "WEIGHT_BALANCE_V1";
  aircraft: WeightBalanceAircraftSnapshot;
  inputs: WeightBalanceInputs;
  results: WeightBalanceResults;
  updatedAt?: string;
};

const POINT_LABELS: Record<WeightBalancePointId, string> = {
  ramp: "Rampa",
  takeoff: "Decolagem",
  landing: "Pouso",
};

export function parseNullableNumber(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function toInputValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number | null, decimals = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function createEmptyFuelInput(unit: FuelQuantityUnit = "kg"): WeightBalanceFuelInput {
  return { value: null, unit, weightKg: null };
}

export function fuelInput(value: number | null, unit: FuelQuantityUnit, densityKgPerL: number): WeightBalanceFuelInput {
  const safeDensity = densityKgPerL > 0 ? densityKgPerL : DEFAULT_FUEL_DENSITY_KG_PER_L;
  const weightKg = value === null ? null : unit === "l" ? value * safeDensity : value;
  return {
    value,
    unit,
    weightKg: round(weightKg),
  };
}

export function aircraftToWeightBalanceSnapshot(aircraft: Aircraft | null | undefined): WeightBalanceAircraftSnapshot {
  return {
    aircraftId: aircraft?.id,
    registration: aircraft?.registration ?? "",
    emptyWeightKg: finiteOrNull(aircraft?.wb_empty_weight_kg),
    emptyArmMm: finiteOrNull(aircraft?.wb_empty_arm_mm),
    occupantsArmMm: finiteOrNull(aircraft?.wb_occupants_arm_mm),
    occupantsMaxKg: finiteOrNull(aircraft?.wb_occupants_max_kg),
    baggageArmMm: finiteOrNull(aircraft?.wb_baggage_arm_mm),
    baggageMaxKg: finiteOrNull(aircraft?.wb_baggage_max_kg),
    fuelArmMm: finiteOrNull(aircraft?.wb_fuel_arm_mm),
    fuelMaxKg: finiteOrNull(aircraft?.wb_fuel_max_kg),
    fuelDensityKgPerL: finiteOrNull(aircraft?.wb_fuel_density_kg_l) ?? DEFAULT_FUEL_DENSITY_KG_PER_L,
    maxWeightKg: finiteOrNull(aircraft?.wb_max_weight_kg),
    armMinMm: finiteOrNull(aircraft?.wb_arm_min_mm),
    armMaxMm: finiteOrNull(aircraft?.wb_arm_max_mm),
  };
}

export function emptyWeightBalanceInputs(defaultOccupantsWeightKg: number | null = null): WeightBalanceInputs {
  return {
    personsOnBoard: 2,
    occupantsWeightKg: defaultOccupantsWeightKg,
    baggageWeightKg: null,
    rampFuel: createEmptyFuelInput("l"),
    taxiFuel: createEmptyFuelInput("l"),
    tripFuel: createEmptyFuelInput("l"),
  };
}

function hasRequiredConfig(aircraft: WeightBalanceAircraftSnapshot): boolean {
  return [
    aircraft.emptyWeightKg,
    aircraft.emptyArmMm,
    aircraft.occupantsArmMm,
    aircraft.baggageArmMm,
    aircraft.fuelArmMm,
    aircraft.maxWeightKg,
    aircraft.armMinMm,
    aircraft.armMaxMm,
  ].every((value) => typeof value === "number" && Number.isFinite(value));
}

function pointIssues(
  label: string,
  weightKg: number | null,
  armMm: number | null,
  aircraft: WeightBalanceAircraftSnapshot,
): { inEnvelope: boolean | null; issues: string[] } {
  const issues: string[] = [];
  if (weightKg === null || armMm === null) return { inEnvelope: null, issues: ["Dados insuficientes para calcular."] };
  if (aircraft.maxWeightKg !== null && weightKg > aircraft.maxWeightKg) {
    issues.push(`${label}: peso acima do máximo da aeronave.`);
  }
  if (aircraft.armMinMm !== null && armMm < aircraft.armMinMm) {
    issues.push(`${label}: braço abaixo do mínimo.`);
  }
  if (aircraft.armMaxMm !== null && armMm > aircraft.armMaxMm) {
    issues.push(`${label}: braço acima do máximo.`);
  }
  return { inEnvelope: issues.length === 0, issues };
}

function buildPoint(
  id: WeightBalancePointId,
  aircraft: WeightBalanceAircraftSnapshot,
  weights: { occupants: number; baggage: number; fuel: number },
): WeightBalancePoint {
  if (!hasRequiredConfig(aircraft)) {
    return {
      id,
      label: POINT_LABELS[id],
      weightKg: null,
      momentKgMm: null,
      armMm: null,
      inEnvelope: null,
      issues: ["Configuração de peso e balanceamento da aeronave incompleta."],
    };
  }

  const totalWeight =
    aircraft.emptyWeightKg! +
    weights.occupants +
    weights.baggage +
    weights.fuel;
  const moment =
    aircraft.emptyWeightKg! * aircraft.emptyArmMm! +
    weights.occupants * aircraft.occupantsArmMm! +
    weights.baggage * aircraft.baggageArmMm! +
    weights.fuel * aircraft.fuelArmMm!;
  const arm = totalWeight > 0 ? moment / totalWeight : null;
  const envelope = pointIssues(POINT_LABELS[id], totalWeight, arm, aircraft);

  return {
    id,
    label: POINT_LABELS[id],
    weightKg: round(totalWeight),
    momentKgMm: round(moment),
    armMm: round(arm),
    inEnvelope: envelope.inEnvelope,
    issues: envelope.issues,
  };
}

export function calculateWeightBalance(
  aircraft: WeightBalanceAircraftSnapshot,
  inputs: WeightBalanceInputs,
): WeightBalanceResults {
  const stationIssues: string[] = [];
  const occupants = Math.max(0, inputs.occupantsWeightKg ?? 0);
  const baggage = Math.max(0, inputs.baggageWeightKg ?? 0);
  const rampFuel = Math.max(0, inputs.rampFuel.weightKg ?? 0);
  const taxiFuel = Math.max(0, inputs.taxiFuel.weightKg ?? 0);
  const tripFuel = Math.max(0, inputs.tripFuel.weightKg ?? 0);

  if (!hasRequiredConfig(aircraft)) stationIssues.push("Configuração de peso e balanceamento da aeronave incompleta.");
  if (aircraft.occupantsMaxKg !== null && occupants > aircraft.occupantsMaxKg) {
    stationIssues.push("Peso de ocupantes acima do máximo configurado.");
  }
  if (aircraft.baggageMaxKg !== null && baggage > aircraft.baggageMaxKg) {
    stationIssues.push("Peso de bagagem acima do máximo configurado.");
  }
  if (aircraft.fuelMaxKg !== null && rampFuel > aircraft.fuelMaxKg) {
    stationIssues.push("Combustível inicial acima do máximo configurado.");
  }
  if (taxiFuel + tripFuel > rampFuel) {
    stationIssues.push("Combustível consumido maior que o combustível inicial.");
  }

  const takeoffFuel = Math.max(0, rampFuel - taxiFuel);
  const landingFuel = Math.max(0, rampFuel - taxiFuel - tripFuel);
  const points = [
    buildPoint("ramp", aircraft, { occupants, baggage, fuel: rampFuel }),
    buildPoint("takeoff", aircraft, { occupants, baggage, fuel: takeoffFuel }),
    buildPoint("landing", aircraft, { occupants, baggage, fuel: landingFuel }),
  ];
  const pointIssuesList = points.flatMap((point) => point.issues);

  return {
    stationIssues,
    points,
    isComplete: hasRequiredConfig(aircraft),
    isWithinLimits: stationIssues.length === 0 && pointIssuesList.length === 0,
  };
}

export function buildWeightBalanceMeta(params: {
  aircraft: WeightBalanceAircraftSnapshot;
  inputs: Omit<WeightBalanceInputs, "rampFuel" | "taxiFuel" | "tripFuel" | "personsOnBoard"> & {
    personsOnBoard?: number | null;
    rampFuel: Pick<WeightBalanceFuelInput, "value" | "unit">;
    taxiFuel: Pick<WeightBalanceFuelInput, "value" | "unit">;
    tripFuel: Pick<WeightBalanceFuelInput, "value" | "unit">;
  };
  updatedAt?: string;
}): FlightWeightBalanceMeta {
  const personsOnBoard =
    typeof params.inputs.personsOnBoard === "number" && Number.isFinite(params.inputs.personsOnBoard)
      ? Math.max(1, Math.round(params.inputs.personsOnBoard))
      : 2;
  const inputs: WeightBalanceInputs = {
    personsOnBoard,
    occupantsWeightKg: params.inputs.occupantsWeightKg,
    baggageWeightKg: params.inputs.baggageWeightKg,
    rampFuel: fuelInput(params.inputs.rampFuel.value, params.inputs.rampFuel.unit, params.aircraft.fuelDensityKgPerL),
    taxiFuel: fuelInput(params.inputs.taxiFuel.value, params.inputs.taxiFuel.unit, params.aircraft.fuelDensityKgPerL),
    tripFuel: fuelInput(params.inputs.tripFuel.value, params.inputs.tripFuel.unit, params.aircraft.fuelDensityKgPerL),
  };
  return {
    version: "WEIGHT_BALANCE_V1",
    aircraft: params.aircraft,
    inputs,
    results: calculateWeightBalance(params.aircraft, inputs),
    updatedAt: params.updatedAt,
  };
}
