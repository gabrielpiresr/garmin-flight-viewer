export type CaktoSettings = {
  clientId: string;
  productId: string;
  secretConfigured: boolean;
  webhookUrl: string;
  updatedAt: string | null;
};

export type CaktoSettingsInput = {
  clientId: string;
  clientSecret?: string | null;
  productId: string;
};

export type CaktoReceipt = {
  id: string;
  source: "cakto" | "saga";
  eventId: string;
  eventType: string;
  orderId: string;
  offerId: string;
  productId: string;
  proposalId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  fulfillmentStatus: string;
  fulfillmentError: string;
  fulfillmentUpdatedAt: string | null;
  creditId: string;
  sagaStatus: string;
  sagaError: string;
  sagaCreditMarker: string;
  sagaUpdatedAt: string | null;
  eventAt: string | null;
  receivedAt: string;
  payloadJson: string;
};

export type CaktoReceiptFilters = {
  search?: string;
  source?: "all" | "cakto" | "saga";
  eventType?: string;
  eventTypes?: string[];
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  fullScan?: boolean;
  recentLimit?: number;
};

export type CaktoReceiptPage = {
  receipts: CaktoReceipt[];
  total: number;
  limit: number;
  offset: number;
  summary: {
    approved: number;
    refunded: number;
    pending: number;
  };
};

export type FlightReviewClubCheckout = {
  proposalId: string;
  paymentUrl: string;
  amount: number;
  pricingRuleId: string;
  planId?: string;
  planName?: string;
  recurrencePeriodDays?: number;
  trainingTrackName: string;
  flownHours: number;
};

export type FlightReviewClubQuote = {
  amount: number;
  discountPercent: number;
  pricingRuleId: string;
  planId?: string;
  planName?: string;
  recurrencePeriodDays?: number;
  billingMode?: "legacy_one_time" | "student_subscription";
  trainingTrackId: string;
  trainingTrackName: string;
  minHours: number;
  maxHours: number | null;
  flownHours: number;
};

export type FlightReviewClubMembership = {
  id: string;
  studentUserId: string;
  source: "cakto" | "manual" | "legacy_track";
  status: "active" | "trial" | "inactive" | "canceled" | "expired" | "paused" | "pending" | "unknown";
  planId: string;
  planName: string;
  recurrenceKey: string;
  recurrencePeriodDays: number;
  amount: number;
  caktoOfferId: string;
  caktoSubscriptionId: string;
  proposalId: string;
  currentPeriod: number;
  paidPaymentsQuantity: number;
  nextPaymentDate: string | null;
  accessUntil: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  lastPaymentAt: string | null;
  updatedAt: string | null;
};

export type FlightReviewClubMemberkitStatus = {
  configured: boolean;
  granted: boolean;
  email: string;
  syncedAt: string | null;
  error: string;
  membersUrl: string;
};

export type FlightReviewClubMemberkitAccess = {
  email: string;
  granted: boolean;
  authenticatedUrl: string;
  membersUrl: string;
  message: string;
};

export type FlightReviewClubStatus = {
  enabled: boolean;
  hasAccess: boolean;
  legacyTrackMember: boolean;
  membership: FlightReviewClubMembership | null;
  memberkit?: FlightReviewClubMemberkitStatus | null;
};

export type FlightReviewClubTaskStatus =
  | "pendente"
  | "em_andamento"
  | "concluido"
  | "bloqueado"
  | "revogar"
  | "revogado";

export type FlightReviewClubTask = {
  id: string;
  membershipId: string;
  studentUserId: string;
  templateItemId: string;
  title: string;
  description: string;
  status: FlightReviewClubTaskStatus;
  assignedToUserId: string;
  dueAt: string | null;
  completedAt: string | null;
  notes: string;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FlightReviewClubMemberRow = {
  membership: FlightReviewClubMembership;
  studentName: string;
  studentEmail: string;
  tasks: FlightReviewClubTask[];
};

export type FlightReviewClubAdminOverview = {
  totalMembers: number;
  activeAccess: number;
  canceled: number;
  pendingTasks: number;
  completedTasks: number;
  revocationTasks: number;
  members: FlightReviewClubMemberRow[];
};
