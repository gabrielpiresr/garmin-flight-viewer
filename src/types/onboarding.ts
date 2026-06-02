export type OnboardingConfig = {
  enabled: boolean;
  updatedAt: string | null;
};

export type OnboardingConfigInput = {
  enabled: boolean;
};

import type { ManeuverRichContent } from "./maneuver";

export type OnboardingStep = {
  id: string;
  title: string;
  /** Texto plano (busca, validação, prévia na lista). */
  description: string;
  descriptionJson: ManeuverRichContent;
  descriptionHtml: string;
  imageFileId: string | null;
  sortOrder: number;
  updatedAt: string | null;
};

export type OnboardingStepInput = {
  title: string;
  description: string;
  descriptionJson: ManeuverRichContent;
  descriptionHtml: string;
  imageFileId?: string | null;
  sortOrder: number;
};

export type OnboardingPublicPayload = {
  onboarding: OnboardingConfig;
  steps: OnboardingStep[];
};
