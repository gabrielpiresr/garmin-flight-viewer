import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  MyReferralsPayload,
  ReferAndEarnConfig,
  ReferAndEarnConfigInput,
  ReferralWelcomeInfo,
  ReferralProgramConfig,
} from "../types/referAndEarn";
import { DEFAULT_REFER_AND_EARN_CONFIG } from "../types/referAndEarn";
import { normalizeReferralProgram } from "./richContentFields";

function normalizeReferAndEarnConfig(config: ReferAndEarnConfig): ReferAndEarnConfig {
  return {
    ...config,
    aluno: normalizeReferralProgram(config.aluno),
    instrutor: normalizeReferralProgram(config.instrutor),
  };
}

type ReferAndEarnResponse = {
  message?: string;
  referAndEarn?: ReferAndEarnConfig;
  schoolName?: string;
  welcome?: ReferralWelcomeInfo;
  referrals?: MyReferralsPayload;
};

function parseResponse(body: string | undefined): ReferAndEarnResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as ReferAndEarnResponse;
  } catch {
    return {};
  }
}

async function executeReferAndEarn(payload: Record<string, unknown>): Promise<ReferAndEarnResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar função de indique e ganhe.");
  }
  return response;
}

export async function getReferAndEarnConfig(): Promise<ReferAndEarnConfig> {
  try {
    const response = await executeReferAndEarn({ action: "getReferAndEarnConfig" });
    if (response.referAndEarn) return normalizeReferAndEarnConfig(response.referAndEarn);
  } catch {
    // Fallback: leitura pública (mesmo payload) quando o deploy ainda não tem a action admin
  }
  const fallback = await executeReferAndEarn({ action: "getReferAndEarnPublic" });
  return normalizeReferAndEarnConfig(fallback.referAndEarn ?? DEFAULT_REFER_AND_EARN_CONFIG);
}

export async function saveReferAndEarnConfig(config: ReferAndEarnConfigInput): Promise<ReferAndEarnConfig> {
  const response = await executeReferAndEarn({ action: "saveReferAndEarnConfig", config });
  if (!response.referAndEarn) throw new Error(response.message || "Configuração não retornada.");
  return normalizeReferAndEarnConfig(response.referAndEarn);
}

export async function getReferAndEarnPublic(): Promise<{
  referAndEarn: ReferAndEarnConfig;
  schoolName: string;
}> {
  const response = await executeReferAndEarn({ action: "getReferAndEarnPublic" });
  return {
    referAndEarn: normalizeReferAndEarnConfig(response.referAndEarn ?? DEFAULT_REFER_AND_EARN_CONFIG),
    schoolName: response.schoolName ?? "Escola",
  };
}

export async function getReferralWelcome(userId: string): Promise<ReferralWelcomeInfo> {
  const response = await executeReferAndEarn({ action: "getReferralWelcome", userId });
  return (
    response.welcome ?? {
      valid: false,
      referrerFirstName: null,
      schoolName: response.schoolName ?? "Escola",
    }
  );
}

export async function getMyReferrals(): Promise<MyReferralsPayload> {
  const response = await executeReferAndEarn({ action: "getMyReferrals" });
  if (!response.referrals) throw new Error(response.message || "Indicações não retornadas.");
  return response.referrals;
}

export function referralLinkForUser(userId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/qualificacao?user_id=${encodeURIComponent(userId)}`;
}

export function programConfigForRole(
  config: ReferAndEarnConfig,
  role: "aluno" | "instrutor",
): ReferralProgramConfig {
  const program = role === "instrutor" ? config.instrutor : config.aluno;
  return normalizeReferralProgram(program);
}
