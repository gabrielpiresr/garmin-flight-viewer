export type WppConnectionSettings = {
  wabaId: string;
  phoneNumberId: string;
  graphApiVersion: string;
  apiKeyConfigured: boolean;
  flightReviewReadyTemplate: WppFlightReviewReadyTemplateSettings;
  tomorrowFlightReminderTemplate: WppTomorrowFlightReminderTemplateSettings;
  paymentReceivedTemplate: WppTransactionalTemplateSettings;
  bookingRequestedTemplate: WppTransactionalTemplateSettings;
  soloFlightApprovalTemplate: WppTransactionalTemplateSettings;
  soloFlightAwarenessTemplate: WppTransactionalTemplateSettings;
  soloFlightInstructorApprovedTemplate: WppTransactionalTemplateSettings;
  soloFlightInstructorRejectedTemplate: WppTransactionalTemplateSettings;
  soloFlightCoordinatorPhone: string;
  soloFlightSgsoPhone: string;
  incomingAutoReply: WppIncomingAutoReplySettings;
  businessName: string | null;
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  connectionStatus: "connected" | "error" | "not_tested";
  lastTestAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
  aiswebAlertTemplate: WppTransactionalTemplateSettings;
};

export type WppFlightReviewReadyTemplateSettings = {
  enabled: boolean;
  templateName: string;
  language: string;
};

export type WppTomorrowFlightReminderTemplateSettings = {
  enabled: boolean;
  templateName: string;
  language: string;
  sendHour: number;
  bodyParameters: string[];
};

export type WppTransactionalTemplateSettings = {
  enabled: boolean;
  templateName: string;
  language: string;
  bodyParameters: string[];
};

export type WppIncomingAutoReplySettings = {
  enabled: boolean;
  matchingMode: WppIncomingMatchMode;
  message: string;
  buttons: WppIncomingReplyButton[];
  actions: WppIncomingActionType[];
  rules: WppIncomingAutoReplyRule[];
  verifyToken: string;
  webhookUrl: string;
};

export type WppIncomingMatchMode = "id" | "content";

export type WppIncomingRuleOperator = "equals" | "contains" | "starts_with";

export type WppIncomingReplyButton = {
  id: string;
  title: string;
};

export type WppIncomingActionType =
  | "send_last_flight_stickers"
  | "send_next_mission_details"
  | "send_student_credit_balance"
  | "send_next_scheduled_flights"
  | "send_flight_credit_purchase_options"
  | "send_flight_credit_custom_purchase_link"
  | "create_flight_credit_checkout"
  | "start_flight_booking";

export type WppIncomingAutoReplyRule = {
  id: string;
  name: string;
  enabled: boolean;
  operator: WppIncomingRuleOperator;
  matchValue: string;
  message: string;
  buttons: WppIncomingReplyButton[];
  actions: WppIncomingActionType[];
};

export type WppConnectionInput = {
  wabaId: string;
  phoneNumberId: string;
  graphApiVersion: string;
  apiKey: string;
  flightReviewReadyTemplate?: WppFlightReviewReadyTemplateSettings;
  tomorrowFlightReminderTemplate?: WppTomorrowFlightReminderTemplateSettings;
  paymentReceivedTemplate?: WppTransactionalTemplateSettings;
  bookingRequestedTemplate?: WppTransactionalTemplateSettings;
  soloFlightApprovalTemplate?: WppTransactionalTemplateSettings;
  soloFlightAwarenessTemplate?: WppTransactionalTemplateSettings;
  soloFlightInstructorApprovedTemplate?: WppTransactionalTemplateSettings;
  soloFlightInstructorRejectedTemplate?: WppTransactionalTemplateSettings;
  aiswebAlertTemplate?: WppTransactionalTemplateSettings;
  soloFlightCoordinatorPhone?: string;
  soloFlightSgsoPhone?: string;
  incomingAutoReply?: WppIncomingAutoReplySettings;
};

export type WppTemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export type WppTemplateComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  example?: Record<string, unknown>;
};

export type WppTemplate = {
  id: string;
  name: string;
  status: string;
  category: WppTemplateCategory;
  language: string;
  components: WppTemplateComponent[];
  qualityScore: string | null;
  rejectedReason: string | null;
};

export type WppTemplateInput = {
  id?: string;
  name: string;
  category: WppTemplateCategory;
  language: string;
  headerText: string;
  bodyText: string;
  footerText: string;
  buttons?: Array<Record<string, unknown>>;
};

export type WppTemplateButtonUrlParameter =
  | string
  | {
      index?: number;
      text?: string;
      value?: string;
    };

export type WppTestTemplateInput = {
  templateName: string;
  language: string;
  to: string;
  headerParameters: string[];
  bodyParameters: string[];
  buttonUrlParameters?: WppTemplateButtonUrlParameter[];
};

export type WppDeliveryStatusValue =
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "deleted"
  | "unknown";

export type WppDeliveryStatus = {
  id: string;
  messageId: string;
  status: WppDeliveryStatusValue | string;
  recipient: string;
  templateName: string | null;
  language: string | null;
  occurredAt: string | null;
  providerTimestamp: string | null;
  source: string;
  failureReason: string | null;
  errors: Array<{
    code: number | null;
    title: string;
    message: string;
    details: string;
  }>;
};

export type WppHubCommand = {
  title: string;
  example: string;
  description: string;
};

export type WppHubWatch = {
  icao: string;
  hours: number;
  expiresAt: string | null;
  simplified: boolean;
};

export type WppHubTrial = {
  unlimited: boolean;
  usedCount: number;
  limit: number;
  remaining: number;
  expired: boolean;
  hasPhone: boolean;
  subscribeUrl: string;
};

export type WppHub = {
  displayPhoneNumber: string | null;
  waMeUrl: string | null;
  businessName: string | null;
  commands: WppHubCommand[];
  watches: WppHubWatch[];
  trial: WppHubTrial;
};

