export type PackageEligibility =
  | { type: "all" }
  | { type: "saga_id_range"; min: number | null; max: number | null }
  | { type: "created_date_range"; from: string | null; to: string | null };

export type FlightCreditPackage = {
  id: string;
  hours: number;
  hourPrice: number;
  validityDays: number;
  aircraftModelId: string;
  aircraftModelName: string;
  active: boolean;
  isDefault: boolean;
  eligibility: PackageEligibility;
};

export type FlightCreditSalesConfig = {
  studentPurchasesEnabled: boolean;
  nightHoursDifferentFromDay: boolean;
  /** Percentual de desconto para modalidade "somente seg–sex"; null/0 = desligado. */
  weekdayDiscountPct: number | null;
  packages: FlightCreditPackage[];
  updatedAt: string | null;
};

export type FlightCreditSalesConfigInput = Omit<FlightCreditSalesConfig, "updatedAt">;

export type FlightCreditCheckout = {
  proposalId: string;
  paymentUrl: string;
};
