export type NotificationChannel = "email" | "push";

export type NotificationEventType =
  | "flight.scheduled"
  | "flight.updated"
  | "flight.cancelled"
  | "weeklyPlan.submitted"
  | "notice.published";

export type EmailTemplateType = NotificationEventType | "test";

export type EmailSettings = {
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  subjectPrefix: string;
  apiKeyConfigured: boolean;
  updatedAt: string | null;
};

export type EmailSettingsInput = {
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  subjectPrefix?: string | null;
  resendApiKey?: string | null;
};

export type EmailBrandSettings = {
  schoolName: string;
  logoUrl: string;
  logoDataUrl?: string | null;
  logoFileId: string | null;
  primaryColor: string;
  accentColor: string;
  appUrl: string;
  supportEmail: string;
  footerText: string;
  updatedAt: string | null;
};

export type EmailBrandSettingsInput = {
  schoolName: string;
  logoUrl?: string | null;
  logoFileId?: string | null;
  primaryColor: string;
  accentColor: string;
  appUrl?: string | null;
  supportEmail?: string | null;
  footerText?: string | null;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
};

export type NotificationDispatchPayload = {
  eventType: NotificationEventType;
  dedupeKey: string;
  recipientUserIds?: string[];
  channels?: NotificationChannel[];
  actorUserId?: string | null;
  flightId?: string | null;
  noticeId?: string | null;
  weeklyPlanId?: string | null;
  data?: Record<string, unknown>;
};

export type NotificationResponse = {
  ok?: boolean;
  message?: string;
  emailSettings?: EmailSettings;
  brandSettings?: EmailBrandSettings;
  deliveries?: Array<{
    channel: NotificationChannel;
    recipientUserId: string;
    status: "sent" | "skipped" | "failed";
  }>;
};
