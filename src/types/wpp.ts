export type WppConnectionSettings = {
  wabaId: string;
  phoneNumberId: string;
  graphApiVersion: string;
  apiKeyConfigured: boolean;
  businessName: string | null;
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  connectionStatus: "connected" | "error" | "not_tested";
  lastTestAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

export type WppConnectionInput = {
  wabaId: string;
  phoneNumberId: string;
  graphApiVersion: string;
  apiKey: string;
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

export type WppTestTemplateInput = {
  templateName: string;
  language: string;
  to: string;
  headerParameters: string[];
  bodyParameters: string[];
};
