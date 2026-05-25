import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  EmailBrandSettings,
  EmailBrandSettingsInput,
  EmailSettings,
  EmailSettingsInput,
  EmailTemplateType,
  GoogleCalendarSettings,
  GoogleCalendarSettingsInput,
  NotificationDispatchPayload,
  NotificationResponse,
  PushSubscriptionInput,
} from "../types/notification";

const BRAND_CACHE_KEY = "gfv:emailBrandSettings";
const BRAND_LOG_PREFIX = "[gfv:brand]";

function summarizeBrandSettings(settings: EmailBrandSettings | undefined) {
  if (!settings) return null;
  return {
    schoolName: settings.schoolName || "",
    hasLogoUrl: Boolean(settings.logoUrl?.trim()),
    logoUrl: settings.logoUrl || "",
    hasLogoDataUrl: Boolean(settings.logoDataUrl?.startsWith("data:image/")),
    logoDataUrlLength: settings.logoDataUrl?.length ?? 0,
    updatedAt: settings.updatedAt ?? null,
  };
}

function logBrandDebug(message: string, details?: Record<string, unknown>) {
  console.info(BRAND_LOG_PREFIX, message, details ?? {});
}

function warnBrandDebug(message: string, details?: Record<string, unknown>) {
  console.warn(BRAND_LOG_PREFIX, message, details ?? {});
}

function cacheBrandSettings(settings: EmailBrandSettings) {
  try {
    window.localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Local cache is only a fallback for share previews.
  }
}

export function getCachedBrandSettings(): EmailBrandSettings | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(BRAND_CACHE_KEY) : null;
    return raw ? (JSON.parse(raw) as EmailBrandSettings) : null;
  } catch {
    return null;
  }
}

function parseResponse(body: string | undefined): NotificationResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as NotificationResponse;
  } catch {
    return {};
  }
}

async function executeNotifications(payload: Record<string, unknown>): Promise<NotificationResponse> {
  const action = String(payload.action || "unknown");
  const shouldTraceBrand = action === "getEmailBrandSettings" || action === "saveEmailBrandSettings";

  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    if (shouldTraceBrand) {
      warnBrandDebug("admin function not configured", {
        hasFunctionsClient: Boolean(functions),
        functionId: ADMIN_USERS_FUNCTION_ID || null,
      });
    }
    throw new Error("Função administrativa não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }

  if (shouldTraceBrand) {
    logBrandDebug("calling admin function", { action, functionId: ADMIN_USERS_FUNCTION_ID });
  }

  let execution;
  try {
    execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  } catch (error) {
    if (shouldTraceBrand) {
      warnBrandDebug("admin function call failed before response", {
        action,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }

  const response = parseResponse(execution.responseBody);
  if (shouldTraceBrand) {
    logBrandDebug("admin function response", {
      action,
      status: execution.status,
      responseStatusCode: execution.responseStatusCode,
      responseBodyLength: execution.responseBody?.length ?? 0,
      brandSettings: summarizeBrandSettings(response.brandSettings),
      message: response.message || "",
    });
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    if (shouldTraceBrand) {
      warnBrandDebug("admin function returned an error", {
        action,
        status: execution.status,
        responseStatusCode: execution.responseStatusCode,
        message: response.message || "",
      });
    }
    throw new Error(response.message || "Falha ao executar função de notificações.");
  }
  return response;
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const response = await executeNotifications({ action: "getEmailSettings" });
  if (!response.emailSettings) throw new Error(response.message || "Configuração de email não retornada.");
  return response.emailSettings;
}

export async function saveEmailSettings(settings: EmailSettingsInput): Promise<EmailSettings> {
  const response = await executeNotifications({ action: "saveEmailSettings", settings });
  if (!response.emailSettings) throw new Error(response.message || "Configuração de email não retornada.");
  return response.emailSettings;
}

export async function getEmailBrandSettings(): Promise<EmailBrandSettings> {
  const response = await executeNotifications({ action: "getEmailBrandSettings" });
  if (!response.brandSettings) throw new Error(response.message || "Configuração visual de email não retornada.");
  logBrandDebug("caching brand settings from function", {
    brandSettings: summarizeBrandSettings(response.brandSettings),
  });
  cacheBrandSettings(response.brandSettings);
  return response.brandSettings;
}

export async function saveEmailBrandSettings(settings: EmailBrandSettingsInput): Promise<EmailBrandSettings> {
  const response = await executeNotifications({ action: "saveEmailBrandSettings", settings });
  if (!response.brandSettings) throw new Error(response.message || "Configuração visual de email não retornada.");
  logBrandDebug("caching brand settings after save", {
    brandSettings: summarizeBrandSettings(response.brandSettings),
  });
  cacheBrandSettings(response.brandSettings);
  return response.brandSettings;
}

export async function sendTestEmail(to: string, templateType: EmailTemplateType = "test"): Promise<void> {
  await executeNotifications({ action: "sendTestEmail", to, templateType });
}

export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettings> {
  const response = await executeNotifications({ action: "getGoogleCalendarSettings" });
  if (!response.googleCalendarSettings) {
    throw new Error(response.message || "ConfiguraÃ§Ã£o do Google Calendar nÃ£o retornada.");
  }
  return response.googleCalendarSettings;
}

export async function saveGoogleCalendarSettings(
  settings: GoogleCalendarSettingsInput,
): Promise<GoogleCalendarSettings> {
  const response = await executeNotifications({ action: "saveGoogleCalendarSettings", settings });
  if (!response.googleCalendarSettings) {
    throw new Error(response.message || "ConfiguraÃ§Ã£o do Google Calendar nÃ£o retornada.");
  }
  return response.googleCalendarSettings;
}

export async function testGoogleCalendarConnection(): Promise<GoogleCalendarSettings> {
  const response = await executeNotifications({ action: "testGoogleCalendarConnection" });
  if (!response.googleCalendarSettings) {
    throw new Error(response.message || "ConfiguraÃ§Ã£o do Google Calendar nÃ£o retornada.");
  }
  return response.googleCalendarSettings;
}

export async function syncFlightCalendarEvent(
  flightId: string,
  mode: "upsert" | "cancel",
): Promise<{ error: Error | null; settings?: GoogleCalendarSettings }> {
  try {
    const response = await executeNotifications({ action: "syncFlightCalendarEvent", flightId, mode });
    return { error: null, settings: response.googleCalendarSettings };
  } catch (error) {
    console.warn("[calendar] Falha ao sincronizar evento:", flightId, mode, error);
    return { error: error as Error };
  }
}

export async function registerPushSubscription(subscription: PushSubscriptionInput): Promise<void> {
  await executeNotifications({ action: "registerPushSubscription", subscription });
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await executeNotifications({ action: "deletePushSubscription", endpoint });
}

export async function dispatchNotificationEvent(
  payload: NotificationDispatchPayload,
): Promise<{ error: Error | null; deliveries?: NotificationResponse["deliveries"] }> {
  try {
    const response = await executeNotifications({ action: "dispatchEvent", event: payload });
    const deliveries = response.deliveries ?? [];
    const emailDelivery = deliveries.find((item) => item.channel === "email");
    if (emailDelivery?.status === "failed") {
      console.warn("[notifications] Email falhou:", payload.eventType, deliveries);
      return { error: new Error("Falha ao enviar email de notificação."), deliveries };
    }
    if (emailDelivery?.status === "skipped") {
      console.warn("[notifications] Email ignorado:", payload.eventType, deliveries);
    } else if (deliveries.length > 0) {
      console.info("[notifications] Entregas:", payload.eventType, deliveries);
    }
    return { error: null, deliveries };
  } catch (error) {
    console.warn("[notifications] Falha ao disparar evento:", payload.eventType, error);
    return { error: error as Error };
  }
}
