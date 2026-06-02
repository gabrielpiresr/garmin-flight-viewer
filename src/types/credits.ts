export type StudentCreditPurchase = {
  id: string;
  userId: string;
  purchaseDate: string;
  aircraftModelId: string;
  aircraftModelName: string;
  amountPaid: number;
  paymentMethod: string;
  paymentInstallments: number | null;
  validityDays: number;
  hours: number;
  expiresAt: string;
  notes: string;
  isNight: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type StudentCreditAllocation = {
  creditId: string;
  hours: number;
};

export type StudentCreditFlightDebit = {
  id: string;
  flightId: string;
  flightDate: string;
  aircraftIdent: string;
  isNight: boolean;
  aircraftModelId: string | null;
  aircraftModelName: string;
  hours: number;
  allocatedHours: number;
  unallocatedHours: number;
  allocations: StudentCreditAllocation[];
};

export type StudentCreditModelSummary = {
  aircraftModelId: string;
  aircraftModelName: string;
  purchasedHours: number;
  consumedHours: number;
  expiredHours: number;
  availableHours: number;
  unallocatedFlightHours: number;
};

export type StudentCreditStatement = {
  userId: string;
  generatedAt: string;
  purchases: StudentCreditPurchase[];
  flightDebits: StudentCreditFlightDebit[];
  summaries: StudentCreditModelSummary[];
  totals: {
    purchasedHours: number;
    consumedHours: number;
    expiredHours: number;
    availableHours: number;
    unallocatedFlightHours: number;
    amountPaid: number;
  };
};

export type StudentCreditInput = {
  userId: string;
  purchaseDate: string;
  aircraftModelId: string;
  aircraftModelName: string;
  amountPaid: number;
  paymentMethod: string;
  paymentInstallments?: number | null;
  validityDays: number;
  hours: number;
  notes?: string;
  isNight?: boolean;
};
