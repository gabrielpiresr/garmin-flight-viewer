import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";

type RootAccessResponse = {
  sessionToken?: {
    userId?: string;
    secret?: string;
  };
  message?: string;
};

export type RootAccessLogin = {
  adminEmail: string;
  studentEmail: string;
};

export function parseRootAccessLogin(email: string): RootAccessLogin | null {
  const parts = email.split("::");
  if (parts.length !== 2) return null;
  const adminEmail = parts[0]?.trim().toLowerCase() || "";
  const studentEmail = parts[1]?.trim().toLowerCase() || "";
  if (!adminEmail || !studentEmail) return null;
  return { adminEmail, studentEmail };
}

export async function requestRootAccessSession(input: RootAccessLogin & { password: string }) {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Funcao administrativa nao configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }

  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify({
      action: "impersonateStudent",
      adminEmail: input.adminEmail,
      studentEmail: input.studentEmail,
      password: input.password,
    }),
    false,
  );

  let response: RootAccessResponse = {};
  try {
    response = JSON.parse(execution.responseBody || "{}") as RootAccessResponse;
  } catch {
    response = {};
  }

  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao criar sessao root.");
  }
  if (!response.sessionToken?.userId || !response.sessionToken.secret) {
    throw new Error("A funcao administrativa nao retornou um token de sessao valido.");
  }

  return {
    userId: response.sessionToken.userId,
    secret: response.sessionToken.secret,
  };
}
