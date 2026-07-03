import type { ManeuverRichContent } from "./maneuver";

export type ScheduleOnboardingStep = {
  id: string;
  title: string;
  descriptionJson: ManeuverRichContent;
  sortOrder: number;
};

export type ScheduleCustomFaq = {
  id: string;
  title: string;
  answerJson: ManeuverRichContent;
  sortOrder: number;
  enabled: boolean;
};

export type ScheduleStudentHelpConfig = {
  onboardingEnabled: boolean;
  onboardingSteps: ScheduleOnboardingStep[];
  customFaqs: ScheduleCustomFaq[];
  systemFaqEnabled: Record<string, boolean>;
  /** Títulos customizados para perguntas automáticas (id → título). Vazio usa o padrão. */
  systemFaqTitles: Record<string, string>;
};

export type ScheduleFaqItem = {
  id: string;
  title: string;
  answerJson: ManeuverRichContent;
  source: "system" | "custom";
  plainText: string;
};
