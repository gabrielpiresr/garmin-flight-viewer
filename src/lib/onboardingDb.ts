import { Query } from "appwrite";

import {

  ADMIN_USERS_FUNCTION_ID,

  databases,

  DEFAULT_SCHOOL_ID,

  functions,

  ID,

  isAppwriteConfigured,

  ONBOARDING_MEDIA_BUCKET_ID,

  ONBOARDING_STEPS_COL_ID,

  storage,

} from "./appwrite";

import { normalizeOnboardingStep } from "./richContentFields";

import type {

  OnboardingConfig,

  OnboardingConfigInput,

  OnboardingPublicPayload,

  OnboardingStep,

  OnboardingStepInput,

} from "../types/onboarding";



const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

const PROFILES_COL_ID = import.meta.env.VITE_APPWRITE_PROFILES_COLLECTION_ID as string | undefined;



type OnboardingResponse = {

  message?: string;

  onboarding?: OnboardingConfig;

  steps?: OnboardingStep[];

};



function parseResponse(body: string | undefined): OnboardingResponse {

  if (!body) return {};

  try {

    return JSON.parse(body) as OnboardingResponse;

  } catch {

    return {};

  }

}



async function executeOnboarding(payload: Record<string, unknown>): Promise<OnboardingResponse> {

  if (!functions || !ADMIN_USERS_FUNCTION_ID) {

    throw new Error("Função administrativa não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");

  }

  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);

  const response = parseResponse(execution.responseBody);

  if (execution.status === "failed" || execution.responseStatusCode >= 400) {

    throw new Error(response.message || "Falha ao executar função de onboarding.");

  }

  return response;

}



function isOnboardingStepsConfigured(): boolean {

  return Boolean(isAppwriteConfigured && databases && DB_ID && ONBOARDING_STEPS_COL_ID);

}



function toStep(doc: Record<string, unknown>): OnboardingStep {

  const rich = normalizeOnboardingStep({

    description: typeof doc.description === "string" ? doc.description : undefined,

    descriptionJson: doc.descriptionJson ?? doc.description_json,

    descriptionHtml:

      typeof doc.descriptionHtml === "string"

        ? doc.descriptionHtml

        : typeof doc.description_html === "string"

          ? doc.description_html

          : undefined,

  });

  const rawLayout = doc.layout;
  const layout: import("../types/onboarding").SlideLayout =
    rawLayout === "split" || rawLayout === "text-only" || rawLayout === "video-focus" || rawLayout === "list"
      ? rawLayout
      : "hero";

  const rawPos = doc.media_position ?? doc.mediaPosition;
  const mediaPosition: import("../types/onboarding").MediaPosition =
    rawPos === "left" || rawPos === "top" || rawPos === "bottom" ? rawPos : "right";

  return {

    id: String(doc.id ?? doc.$id ?? ""),

    title: String(doc.title ?? ""),

    subtitle: typeof doc.subtitle === "string" && doc.subtitle ? doc.subtitle : null,

    description: rich.description,

    descriptionJson: rich.descriptionJson,

    descriptionHtml: rich.descriptionHtml,

    imageFileId: typeof doc.imageFileId === "string" ? doc.imageFileId : typeof doc.image_file_id === "string" ? doc.image_file_id : null,

    videoUrl: typeof doc.videoUrl === "string" ? doc.videoUrl : typeof doc.video_url === "string" ? doc.video_url : null,

    layout,

    mediaPosition,

    sortOrder: Number(doc.sortOrder ?? doc.sort_order ?? 0),

    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : typeof doc.$updatedAt === "string" ? doc.$updatedAt : null,

  };

}



function stepPayload(payload: OnboardingStepInput) {

  const rich = normalizeOnboardingStep({

    description: payload.description,

    descriptionJson: payload.descriptionJson,

    descriptionHtml: payload.descriptionHtml,

  });

  return {

    school_id: DEFAULT_SCHOOL_ID,

    title: payload.title.trim(),

    subtitle: payload.subtitle?.trim() || null,

    description: rich.description,

    description_json: JSON.stringify(rich.descriptionJson),

    description_html: rich.descriptionHtml,

    image_file_id: payload.imageFileId?.trim() || null,

    video_url: payload.videoUrl?.trim() || null,

    layout: payload.layout ?? "hero",

    media_position: payload.mediaPosition ?? "right",

    sort_order: payload.sortOrder,

  };

}



export async function getOnboardingPublic(): Promise<OnboardingPublicPayload> {

  const response = await executeOnboarding({ action: "getOnboardingPublic" });

  return {

    onboarding: response.onboarding ?? { enabled: false, showInStudentMenu: false, updatedAt: null },

    steps: (response.steps ?? []).map((step) => toStep(step as unknown as Record<string, unknown>)),

  };

}



export async function getOnboardingConfig(): Promise<OnboardingPublicPayload> {

  const response = await executeOnboarding({ action: "getOnboardingConfig" });

  return {

    onboarding: response.onboarding ?? { enabled: false, showInStudentMenu: false, updatedAt: null },

    steps: (response.steps ?? []).map((step) => toStep(step as unknown as Record<string, unknown>)),

  };

}



export async function saveOnboardingConfig(config: OnboardingConfigInput): Promise<OnboardingConfig> {

  const response = await executeOnboarding({ action: "saveOnboardingConfig", config });

  if (!response.onboarding) throw new Error(response.message || "Configuração de onboarding não retornada.");

  return response.onboarding;

}



export async function listOnboardingSteps(): Promise<OnboardingStep[]> {

  if (!isOnboardingStepsConfigured() || !databases || !DB_ID || !ONBOARDING_STEPS_COL_ID) {

    return [];

  }

  const res = await databases.listDocuments(DB_ID, ONBOARDING_STEPS_COL_ID, [

    Query.equal("school_id", [DEFAULT_SCHOOL_ID]),

    Query.orderAsc("sort_order"),

    Query.limit(100),

  ]);

  return res.documents.map((doc) =>

    toStep({

      $id: doc.$id,

      title: doc.title,

      subtitle: doc.subtitle,

      description: doc.description,

      description_json: doc.description_json,

      description_html: doc.description_html,

      image_file_id: doc.image_file_id,

      video_url: doc.video_url,

      layout: doc.layout,

      media_position: doc.media_position,

      sort_order: doc.sort_order,

      $updatedAt: doc.$updatedAt,

    }),

  );

}



export async function createOnboardingStep(

  payload: OnboardingStepInput,

): Promise<{ data: OnboardingStep | null; error: Error | null }> {

  if (!isOnboardingStepsConfigured() || !databases || !DB_ID || !ONBOARDING_STEPS_COL_ID) {

    return { data: null, error: new Error("Coleção de etapas de onboarding não configurada.") };

  }

  try {

    const doc = await databases.createDocument(DB_ID, ONBOARDING_STEPS_COL_ID, ID.unique(), stepPayload(payload));

    return {

      data: toStep({

        $id: doc.$id,

        title: doc.title,

        subtitle: doc.subtitle,

        description: doc.description,

        description_json: doc.description_json,

        description_html: doc.description_html,

        image_file_id: doc.image_file_id,

        video_url: doc.video_url,

        layout: doc.layout,

        sort_order: doc.sort_order,

        $updatedAt: doc.$updatedAt,

      }),

      error: null,

    };

  } catch (error) {

    return { data: null, error: error as Error };

  }

}



export async function updateOnboardingStep(

  stepId: string,

  payload: OnboardingStepInput,

): Promise<{ data: OnboardingStep | null; error: Error | null }> {

  if (!isOnboardingStepsConfigured() || !databases || !DB_ID || !ONBOARDING_STEPS_COL_ID) {

    return { data: null, error: new Error("Coleção de etapas de onboarding não configurada.") };

  }

  try {

    const doc = await databases.updateDocument(DB_ID, ONBOARDING_STEPS_COL_ID, stepId, stepPayload(payload));

    return {

      data: toStep({

        $id: doc.$id,

        title: doc.title,

        subtitle: doc.subtitle,

        description: doc.description,

        description_json: doc.description_json,

        description_html: doc.description_html,

        image_file_id: doc.image_file_id,

        video_url: doc.video_url,

        layout: doc.layout,

        sort_order: doc.sort_order,

        $updatedAt: doc.$updatedAt,

      }),

      error: null,

    };

  } catch (error) {

    return { data: null, error: error as Error };

  }

}



export async function deleteOnboardingStep(stepId: string): Promise<{ error: Error | null }> {

  if (!isOnboardingStepsConfigured() || !databases || !DB_ID || !ONBOARDING_STEPS_COL_ID) {

    return { error: new Error("Coleção de etapas de onboarding não configurada.") };

  }

  try {

    await databases.deleteDocument(DB_ID, ONBOARDING_STEPS_COL_ID, stepId);

    return { error: null };

  } catch (error) {

    return { error: error as Error };

  }

}



export async function reorderOnboardingSteps(orderedIds: string[]): Promise<{ error: Error | null }> {

  if (!isOnboardingStepsConfigured() || !databases || !DB_ID || !ONBOARDING_STEPS_COL_ID) {

    return { error: new Error("Coleção de etapas de onboarding não configurada.") };

  }

  try {

    const current = await listOnboardingSteps();

    const byId = new Map(current.map((step) => [step.id, step]));

    await Promise.all(

      orderedIds.map((id, index) => {

        const step = byId.get(id);

        if (!step) return Promise.resolve();

        return databases!.updateDocument(DB_ID!, ONBOARDING_STEPS_COL_ID!, id, {

          school_id: DEFAULT_SCHOOL_ID,

          title: step.title,

          description: step.description,

          description_json: JSON.stringify(step.descriptionJson),

          description_html: step.descriptionHtml,

          image_file_id: step.imageFileId,

          sort_order: index + 1,

        });

      }),

    );

    return { error: null };

  } catch (error) {

    return { error: error as Error };

  }

}



export function getOnboardingImageUrl(fileId: string | null | undefined): string {

  if (!fileId || !storage || !ONBOARDING_MEDIA_BUCKET_ID) return "";

  return storage.getFileView(ONBOARDING_MEDIA_BUCKET_ID, fileId).toString();

}



export async function uploadOnboardingVideo(file: File): Promise<{ videoUrl: string | null; error: Error | null }> {

  if (!storage || !ONBOARDING_MEDIA_BUCKET_ID) {

    return { videoUrl: null, error: new Error("Bucket de mídia do onboarding não configurado.") };

  }

  try {

    const uploaded = await storage.createFile(ONBOARDING_MEDIA_BUCKET_ID, ID.unique(), file);

    const url = storage.getFileView(ONBOARDING_MEDIA_BUCKET_ID, uploaded.$id).toString();

    return { videoUrl: url, error: null };

  } catch (error) {

    return { videoUrl: null, error: error as Error };

  }

}



export async function uploadOnboardingImage(file: File): Promise<{ fileId: string | null; error: Error | null }> {

  if (!storage || !ONBOARDING_MEDIA_BUCKET_ID) {

    return { fileId: null, error: new Error("Bucket de mídia do onboarding não configurado.") };

  }

  try {

    const uploaded = await storage.createFile(ONBOARDING_MEDIA_BUCKET_ID, ID.unique(), file);

    return { fileId: uploaded.$id, error: null };

  } catch (error) {

    return { fileId: null, error: error as Error };

  }

}



export async function getProfileOnboardingCompletedAt(userId: string): Promise<string | null> {

  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) return null;

  try {

    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [

      Query.equal("user_id", [userId]),

      Query.limit(1),

    ]);

    const doc = res.documents[0];

    const value = doc?.onboarding_completed_at;

    return typeof value === "string" && value.trim() ? value : null;

  } catch {

    return null;

  }

}



export async function markOnboardingCompleted(userId: string): Promise<{ error: Error | null }> {

  if (!isAppwriteConfigured || !databases || !DB_ID || !PROFILES_COL_ID) {

    return { error: new Error("Appwrite não configurado.") };

  }

  try {

    const res = await databases.listDocuments(DB_ID, PROFILES_COL_ID, [

      Query.equal("user_id", [userId]),

      Query.limit(1),

    ]);

    const doc = res.documents[0];

    if (!doc) return { error: new Error("Perfil não encontrado.") };

    await databases.updateDocument(DB_ID, PROFILES_COL_ID, doc.$id, {

      onboarding_completed_at: new Date().toISOString(),

    });

    return { error: null };

  } catch (error) {

    return { error: error as Error };

  }

}


