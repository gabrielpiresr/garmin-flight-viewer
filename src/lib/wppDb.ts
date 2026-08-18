import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  WppConnectionInput,
  WppConnectionSettings,
  WppDeliveryStatus,
  WppFlightReviewReadyTemplateSettings,
  WppHub,
  WppIncomingAutoReplySettings,
  WppTransactionalTemplateSettings,
  WppTomorrowFlightReminderTemplateSettings,
  WppTemplate,
  WppTemplateInput,
  WppTestTemplateInput,
} from "../types/wpp";

type WppResponse = {
  message?: string;
  settings?: WppConnectionSettings;
  templates?: WppTemplate[];
  template?: WppTemplate;
  messageId?: string;
  deliveries?: WppDeliveryStatus[];
  hub?: WppHub;
  watches?: WppHub["watches"];
};

let templatesCache: { value: WppTemplate[]; expiresAt: number } | null = null;
let templatesRequest: Promise<WppTemplate[]> | null = null;

async function execute(payload: Record<string, unknown>): Promise<WppResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID)
    throw new Error("Função administrativa não configurada.");
  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify(payload),
    false,
  );
  let response: WppResponse = {};
  try {
    response = execution.responseBody
      ? (JSON.parse(execution.responseBody) as WppResponse)
      : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha na integração com o WhatsApp.");
  }
  return response;
}

export async function getWppSettings(): Promise<WppConnectionSettings> {
  const response = await execute({ action: "getWppSettings" });
  if (!response.settings)
    throw new Error("Configuração do WhatsApp não retornada.");
  return response.settings;
}

export async function saveWppSettings(
  input: WppConnectionInput,
): Promise<WppConnectionSettings> {
  const response = await execute({
    action: "saveWppSettings",
    settings: input,
  });
  if (!response.settings)
    throw new Error("Configuração do WhatsApp não retornada.");
  return response.settings;
}

export async function saveWppNotificationTemplates(
  input: {
    flightReviewReadyTemplate: WppFlightReviewReadyTemplateSettings;
    tomorrowFlightReminderTemplate: WppTomorrowFlightReminderTemplateSettings;
    paymentReceivedTemplate: WppTransactionalTemplateSettings;
    bookingRequestedTemplate: WppTransactionalTemplateSettings;
    soloFlightApprovalTemplate: WppTransactionalTemplateSettings;
    soloFlightAwarenessTemplate: WppTransactionalTemplateSettings;
    soloFlightInstructorApprovedTemplate: WppTransactionalTemplateSettings;
    soloFlightInstructorRejectedTemplate: WppTransactionalTemplateSettings;
    aiswebAlertTemplate: WppTransactionalTemplateSettings;
    soloFlightCoordinatorPhone: string;
    soloFlightSgsoPhone: string;
  },
): Promise<WppConnectionSettings> {
  const response = await execute({
    action: "saveWppNotificationTemplates",
    settings: input,
  });
  if (!response.settings)
    throw new Error("Configuração do WhatsApp não retornada.");
  return response.settings;
}

export async function saveWppBotSettings(
  input: { incomingAutoReply: WppIncomingAutoReplySettings },
): Promise<WppConnectionSettings> {
  const response = await execute({
    action: "saveWppBotSettings",
    settings: input,
  });
  if (!response.settings)
    throw new Error("ConfiguraÃ§Ã£o do WhatsApp nÃ£o retornada.");
  return response.settings;
}

export async function testWppConnection(): Promise<WppConnectionSettings> {
  const response = await execute({ action: "testWppConnection" });
  if (!response.settings) throw new Error("Resultado do teste não retornado.");
  return response.settings;
}

export async function listWppTemplates(): Promise<WppTemplate[]> {
  if (templatesCache && templatesCache.expiresAt > Date.now())
    return templatesCache.value;
  if (templatesRequest) return templatesRequest;
  templatesRequest = execute({ action: "listWppTemplates" })
    .then((response) => {
      const value = response.templates ?? [];
      templatesCache = { value, expiresAt: Date.now() + 2 * 60 * 1000 };
      return value;
    })
    .finally(() => {
      templatesRequest = null;
    });
  return templatesRequest;
}

export async function createWppTemplate(
  input: WppTemplateInput,
): Promise<WppTemplate> {
  const response = await execute({
    action: "createWppTemplate",
    template: input,
  });
  if (!response.template)
    throw new Error("Template criado, mas a API não retornou os dados.");
  templatesCache = null;
  return response.template;
}

export async function updateWppTemplate(
  input: WppTemplateInput,
): Promise<WppTemplate> {
  const response = await execute({
    action: "updateWppTemplate",
    template: input,
  });
  if (!response.template)
    throw new Error("Template atualizado, mas a API não retornou os dados.");
  templatesCache = null;
  return response.template;
}

export async function deleteWppTemplate(name: string): Promise<void> {
  await execute({ action: "deleteWppTemplate", name });
  templatesCache = null;
}

export async function sendWppTemplateTest(
  input: WppTestTemplateInput,
): Promise<string | null> {
  const response = await execute({
    action: "sendWppTemplateTest",
    test: input,
  });
  return response.messageId ?? null;
}

export async function listWppDeliveryStatuses(options?: {
  limit?: number;
  messageId?: string;
}): Promise<WppDeliveryStatus[]> {
  const response = await execute({
    action: "listWppDeliveryStatuses",
    limit: options?.limit ?? 40,
    messageId: options?.messageId || undefined,
  });
  return response.deliveries ?? [];
}

export async function getWppDeliveryStatus(
  messageId: string,
): Promise<WppDeliveryStatus | null> {
  const id = String(messageId || "").trim();
  if (!id) return null;
  const deliveries = await listWppDeliveryStatuses({ messageId: id, limit: 1 });
  return deliveries[0] ?? null;
}

export async function getWppHub(): Promise<WppHub> {
  const response = await execute({ action: "getWppHub" });
  if (!response.hub) throw new Error("Dados do WhatsApp não retornados.");
  return response.hub;
}

export async function stopMyMetarWatch(icao: string): Promise<WppHub["watches"]> {
  const response = await execute({ action: "stopMyMetarWatch", icao });
  return response.watches ?? [];
}

export async function ensureAiswebAlertWppTemplate(): Promise<WppTemplate | null> {
  const response = await execute({ action: "ensureAiswebAlertWppTemplate" });
  return response.template ?? null;
}

