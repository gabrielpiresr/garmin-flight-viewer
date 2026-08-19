export type CreditPaymentProvider = "cakto" | "lastlink";

export type LastLinkSettings = {
  email: string;
  passwordConfigured: boolean;
  sessionConfigured: boolean;
  sessionExpiresAt: string | null;
  productSlug: string;
  communityId: string;
  webhookUrl: string;
  updatedAt: string | null;
};

export type LastLinkSettingsInput = {
  email: string;
  password?: string | null;
};

export type CreditPaymentSettings = {
  provider: CreditPaymentProvider;
  lastlink: LastLinkSettings;
};
