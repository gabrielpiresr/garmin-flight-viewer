export type NotificationChannel = "email" | "push";

export type NotificationEventType =
  | "flight.scheduled"
  | "flight.updated"
  | "flight.reopened"
  | "flight.cancelled"
  | "flight.reminder_24h"
  | "weeklyPlan.submitted"
  | "notice.published"
  | "schedule.published"
  | "crm.lead_qualified"
  | "crm.lead_registered"
  | "cakto.sale_approved";

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
  faviconUrl?: string | null;
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
  faviconUrl?: string | null;
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

export type GoogleCalendarSettings = {
  enabled: boolean;
  serviceAccountEmail: string;
  serviceAccountConfigured: boolean;
  oauthClientConfigured: boolean;
  oauthConnected: boolean;
  oauthEmail: string | null;
  delegatedEmail: string | null;
  aircraftCalendars: Array<{
    aircraftIdent: string;
    calendarId: string;
  }>;
  lastTestAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

export type GoogleCalendarSettingsInput = {
  enabled: boolean;
  delegatedEmail: string;
  aircraftCalendars: Array<{
    aircraftIdent: string;
    calendarId: string;
  }>;
};

export type NotificationResponse = {
  ok?: boolean;
  message?: string;
  emailSettings?: EmailSettings;
  brandSettings?: EmailBrandSettings;
  googleCalendarSettings?: GoogleCalendarSettings;
  deliveries?: Array<{
    channel: NotificationChannel;
    recipientUserId: string;
    status: "sent" | "skipped" | "failed";
  }>;
};
