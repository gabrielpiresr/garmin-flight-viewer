export type RecipientFilterRole = "aluno" | "instrutor" | "todos" | "custom";

export type NumericRange = { min: string; max: string };

export type StudentProgressFilter = {
  daysWithoutFlying?: NumericRange;
  tracks?: string[];
  hours?: NumericRange;
  progress?: NumericRange;
  flights?: NumericRange;
  landings?: NumericRange;
};

export type RecipientFilter = {
  role: RecipientFilterRole;
  customEmails?: string[];
  studentFilter?: StudentProgressFilter;
};

export type BroadcastSegment = {
  id: string;
  name: string;
  description: string;
  resendAudienceId: string | null;
  memberCount: number;
  createdAt: string;
  createdBy: string | null;
  recipientFilter: RecipientFilter | null;
};

export type BroadcastMessage = {
  id: string;
  segmentId: string | null;
  segmentName: string | null;
  resendBroadcastId: string | null;
  subject: string;
  bodyHtml: string | null;
  sentAt: string | null;
  sentBy: string | null;
  recipientCount: number;
  status: "sent" | "failed" | "draft";
};

export type BroadcastRecipientPreview = {
  email: string;
  name: string;
};

export type ResendAccountInfo = {
  id?: string;
  email?: string;
  full_name?: string;
  [key: string]: unknown;
} | null;
