import type { AvailableDay, AvailablePeriod } from "../types/crm";
import type { AvailabilityPresetId, AvailabilityValue } from "../types/availability";

export type { AvailabilityPresetId, AvailabilityValue } from "../types/availability";
export type { AvailableDay, AvailablePeriod };

export type AvailabilityPreset = {
  id: AvailabilityPresetId;
  label: string;
  sub: string;
  icon: string;
  days: AvailableDay[];
  period?: AvailablePeriod;
};

export const AVAILABILITY_ALL_DAYS: AvailableDay[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
export const AVAILABILITY_WEEK_DAYS: AvailableDay[] = ["seg", "ter", "qua", "qui", "sex"];
export const AVAILABILITY_WEEKEND_DAYS: AvailableDay[] = ["sab", "dom"];

/** Presets idênticos ao preenchimento de disponibilidade na qualificação. */
export const AVAILABILITY_PRESETS: AvailabilityPreset[] = [
  { id: "fds", label: "Finais de semana", sub: "Sáb e Dom", icon: "🏖️", days: AVAILABILITY_WEEKEND_DAYS },
  { id: "uteis", label: "Dias úteis", sub: "Seg a Sex", icon: "💼", days: AVAILABILITY_WEEK_DAYS },
  { id: "manhas", label: "Todas as manhãs", sub: "Todos os dias, manhã", icon: "☀️", days: AVAILABILITY_ALL_DAYS, period: "manha" },
  { id: "tardes", label: "Todas as tardes", sub: "Todos os dias, tarde", icon: "🌆", days: AVAILABILITY_ALL_DAYS, period: "tarde" },
  { id: "todos", label: "Todos os dias", sub: "Seg a Dom, ambos", icon: "🗓️", days: AVAILABILITY_ALL_DAYS, period: "ambos" },
  { id: "personalizado", label: "Personalizado", sub: "Escolha os dias", icon: "✏️", days: [] },
];

export function emptyAvailabilityValue(): AvailabilityValue {
  return { kind: "availability", preset: null, days: [], period: "" };
}

export function isAvailabilityValue(value: unknown): value is AvailabilityValue {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { kind?: unknown }).kind === "availability",
  );
}

export function normalizeAvailabilityValue(value: unknown): AvailabilityValue {
  if (isAvailabilityValue(value)) {
    return {
      kind: "availability",
      preset: (value.preset as AvailabilityPresetId | null) ?? null,
      days: Array.isArray(value.days)
        ? value.days.filter((d): d is AvailableDay => AVAILABILITY_ALL_DAYS.includes(d as AvailableDay))
        : [],
      period:
        value.period === "manha" || value.period === "tarde" || value.period === "ambos"
          ? value.period
          : "",
    };
  }
  return emptyAvailabilityValue();
}

export function isAvailabilityComplete(value: AvailabilityValue | undefined): boolean {
  if (!value || value.kind !== "availability") return false;
  if (!value.preset) return false;
  if (value.days.length === 0) return false;
  if (!value.period) return false;
  return true;
}

export function formatAvailabilitySummary(value: AvailabilityValue): string {
  const presetLabel =
    AVAILABILITY_PRESETS.find((p) => p.id === (value.preset as AvailabilityPresetId))?.label ||
    value.preset ||
    "—";
  const days = value.days.map((d) => {
    const labels: Record<string, string> = {
      seg: "Seg",
      ter: "Ter",
      qua: "Qua",
      qui: "Qui",
      sex: "Sex",
      sab: "Sáb",
      dom: "Dom",
    };
    return labels[d] || d;
  }).join(", ") || "—";
  const period =
    value.period === "manha" ? "Manhã" : value.period === "tarde" ? "Tarde" : value.period === "ambos" ? "Ambos" : "—";
  return `${presetLabel} · ${days} · ${period}`;
}
