import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  EmailBrandSettings,
  EmailBrandSettingsInput,
  EmailSettings,
  EmailSettingsInput,
  EmailTemplateType,
  NotificationDispatchPayload,
  NotificationResponse,
  PushSubscriptionInput,
} from "../types/notification";

const BRAND_CACHE_KEY = "gfv:emailBrandSettings";

function cacheBrandSettings(settings: EmailBrandSettings) {
  try {
    window.localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Local cache is only a fallback for share previews.
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
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }

  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
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
  cacheBrandSettings(response.brandSettings);
  return response.brandSettings;
}

export async function saveEmailBrandSettings(settings: EmailBrandSettingsInput): Promise<EmailBrandSettings> {
  const response = await executeNotifications({ action: "saveEmailBrandSettings", settings });
  if (!response.brandSettings) throw new Error(response.message || "Configuração visual de email não retornada.");
  cacheBrandSettings(response.brandSettings);
  return response.brandSettings;
}

export async function sendTestEmail(to: string, templateType: EmailTemplateType = "test"): Promise<void> {
  await executeNotifications({ action: "sendTestEmail", to, templateType });
}

export async function registerPushSubscription(subscription: PushSubscriptionInput): Promise<void> {
  await executeNotifications({ action: "registerPushSubscription", subscription });
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await executeNotifications({ action: "deletePushSubscription", endpoint });
}

export async function dispatchNotificationEvent(payload: NotificationDispatchPayload): Promise<{ error: Error | null }> {
  try {
    await executeNotifications({ action: "dispatchEvent", event: payload });
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
