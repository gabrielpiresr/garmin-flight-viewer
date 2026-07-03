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
  weekdayOnly: boolean;
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
  /**
   * Saldo cru do modelo (compradas − consumidas, PODE ser negativo) — mesma conta
   * do card "Saldo disponível" da aba Créditos. `availableHours` é o saldo alocável
   * (clampado em ≥ 0 no modo por alocação) e diverge quando o aluno está devendo.
   */
  balanceHours: number;
  unallocatedFlightHours: number;
  /** Horas restantes em créditos restritos a seg–sex (após alocação FIFO). */
  weekdayOnlyAvailableHours: number;
  /** Horas restantes em créditos válidos em qualquer dia (após alocação FIFO). */
  anyDayAvailableHours: number;
};

export type StudentCreditStatement = {
  userId: string;
  generatedAt: string;
  purchases: StudentCreditPurchase[];
  flightDebits: StudentCreditFlightDebit[];
  adjustments: Array<{
    id: string;
    flightId: string | null;
    aircraftModelId: string;
    aircraftIdent: string;
    hours: number;
    percentage: number;
    reason: string;
    occurredAt: string;
    flightDate: string | null;
    flightStartTime: string | null;
  }>;
  summaries: StudentCreditModelSummary[];
  totals: {
    purchasedHours: number;
    consumedHours: number;
    expiredHours: number;
    availableHours: number;
    /** Saldo líquido após voos e multas (pode ser negativo). */
    balanceHours: number;
    penaltyHours: number;
    unallocatedFlightHours: number;
    /** Dívida histórica ainda não coberta por compras (deve ser 0 quando comprado ≥ voado). */
    debtHours?: number;
    weekdayOnlyAvailableHours: number;
    anyDayAvailableHours: number;
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
  weekdayOnly?: boolean;
};
