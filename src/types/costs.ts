export const STUDENT_PAYMENT_METHODS = ["Cartão de crédito à vista", "Parcelado", "PIX"] as const;
export type StudentPaymentMethod = (typeof STUDENT_PAYMENT_METHODS)[number];

export type InstructorModelCost = {
  modelId: string;
  modelName: string;
  hourlyDayRate: number;
  hourlyNightRate: number;
  fixedDayRate: number;
  fixedNightRate: number;
};

export type InstructorCosts = {
  id: string;
  instructorUserId: string;
  monthlyFixedCost: number;
  modelCosts: InstructorModelCost[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export type InstructorPaymentSnapshot = {
  aircraftModelId: string | null;
  aircraftModelName: string | null;
  isNight: boolean;
  hourlyRateApplied: number;
  fixedRateApplied: number;
  flightMinutesConsidered: number;
  totalCalculated: number;
  calculatedAt: string;
};

export type PaymentMethodCost = {
  fixedCost: number;
  percentCost: number;
};

export type ProfitDeductions = {
  aircraftCosts: boolean;
  fuelCosts: boolean;
  instructorTransfer: boolean;
  paymentMethodFees: boolean;
  workOrderCosts: boolean;
};

export type TaxConfig = {
  revenueRatePercent: number;
  grossProfitRatePercent: number;
  netProfitRatePercent: number;
  grossProfitDeductions: ProfitDeductions;
  netProfitDeductions: ProfitDeductions;
};

export type ManualDreLine = {
  id: string;
  name: string;
  defaultAmount: number;
  sectionKey: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ManualDreMonthlyValue = Record<string, Record<string, number>>;

export type SchoolCosts = {
  id: string | null;
  enrollmentCost: number;
  paymentMethodCosts: Record<StudentPaymentMethod, PaymentMethodCost>;
  taxConfig: TaxConfig;
  manualDreLines: ManualDreLine[];
  manualDreValues: ManualDreMonthlyValue;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type CreditCostSnapshot = {
  enrollmentCost: number;
  paymentMethodFixedCost: number;
  paymentMethodPercentCost: number;
  totalCostCalculated: number;
  appliedAt: string;
};

export function defaultPaymentMethodCosts(): Record<StudentPaymentMethod, PaymentMethodCost> {
  return {
    "Cartão de crédito à vista": { fixedCost: 0, percentCost: 0 },
    Parcelado: { fixedCost: 0, percentCost: 0 },
    PIX: { fixedCost: 0, percentCost: 0 },
  };
}

export function defaultProfitDeductions(): ProfitDeductions {
  return {
    aircraftCosts: false,
    fuelCosts: false,
    instructorTransfer: false,
    paymentMethodFees: false,
    workOrderCosts: false,
  };
}

export function defaultTaxConfig(): TaxConfig {
  return {
    revenueRatePercent: 0,
    grossProfitRatePercent: 0,
    netProfitRatePercent: 0,
    grossProfitDeductions: defaultProfitDeductions(),
    netProfitDeductions: defaultProfitDeductions(),
  };
}

export function defaultSchoolCosts(): SchoolCosts {
  return {
    id: null,
    enrollmentCost: 0,
    paymentMethodCosts: defaultPaymentMethodCosts(),
    taxConfig: defaultTaxConfig(),
    manualDreLines: [],
    manualDreValues: {},
    updatedAt: null,
    updatedBy: null,
  };
}

// Produtos / Serviços
export type SchoolProduct = {
  id: string;
  schoolId: string;
  name: string;
  idealPrice: number;
  active: boolean;
  createdAt: string;
  deletedAt: string | null;
};

export type SchoolProductInput = {
  name: string;
  idealPrice: number;
};

// Vendas de produtos para usuários
export type ProductSale = {
  id: string;
  schoolId: string;
  userId: string;
  productId: string;
  productName: string;
  idealPrice: number;
  saleDate: string;
  amountPaid: number;
  paymentMethod: string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  deletedAt: string | null;
};

export type ProductSaleInput = {
  userId: string;
  productId: string;
  productName: string;
  idealPrice: number;
  saleDate: string;
  amountPaid: number;
  paymentMethod: string;
  notes: string;
};
