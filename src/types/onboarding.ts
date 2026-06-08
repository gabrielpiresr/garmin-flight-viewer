export type OnboardingConfig = {
  enabled: boolean;
  showInStudentMenu: boolean;
  updatedAt: string | null;
};

export type OnboardingConfigInput = {
  enabled: boolean;
  showInStudentMenu?: boolean;
};

import type { ManeuverRichContent } from "./maneuver";

export type SlideLayout = "hero" | "split" | "text-only" | "video-focus" | "list";
/** Posição da mídia (imagem/vídeo) dentro do slide */
export type MediaPosition = "right" | "left" | "top" | "bottom";

export type OnboardingStep = {
  id: string;
  title: string;
  subtitle: string | null;
  /** Texto plano (busca, validação, prévia na lista). */
  description: string;
  descriptionJson: ManeuverRichContent;
  descriptionHtml: string;
  imageFileId: string | null;
  videoUrl: string | null;
  layout: SlideLayout;
  mediaPosition: MediaPosition;
  sortOrder: number;
  updatedAt: string | null;
};

export type OnboardingStepInput = {
  title: string;
  subtitle?: string | null;
  description: string;
  descriptionJson: ManeuverRichContent;
  descriptionHtml: string;
  imageFileId?: string | null;
  videoUrl?: string | null;
  layout?: SlideLayout;
  mediaPosition?: MediaPosition;
  sortOrder: number;
};

export type OnboardingPublicPayload = {
  onboarding: OnboardingConfig;
  steps: OnboardingStep[];
};
