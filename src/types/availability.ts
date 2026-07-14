import type { AvailableDay, AvailablePeriod } from "./crm";

export type AvailabilityPresetId =
  | "fds"
  | "uteis"
  | "manhas"
  | "tardes"
  | "todos"
  | "personalizado";

export type AvailabilityValue = {
  kind: "availability";
  preset: AvailabilityPresetId | null;
  days: AvailableDay[];
  period: AvailablePeriod | "";
};
