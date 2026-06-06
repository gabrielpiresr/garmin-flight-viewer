export type FlightCreditPackage = {
  id: string;
  hours: number;
  hourPrice: number;
  validityDays: number;
  aircraftModelId: string;
  aircraftModelName: string;
  active: boolean;
};

export type FlightCreditSalesConfig = {
  studentPurchasesEnabled: boolean;
  nightHoursDifferentFromDay: boolean;
  packages: FlightCreditPackage[];
  updatedAt: string | null;
};

export type FlightCreditSalesConfigInput = Omit<FlightCreditSalesConfig, "updatedAt">;

export type FlightCreditCheckout = {
  proposalId: string;
  paymentUrl: string;
};
