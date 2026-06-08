import { createEmptyRichContent } from "../lib/maneuverContent";
import type { ManeuverRichContent } from "./maneuver";

export type ReferralProgramKey = "aluno" | "instrutor";

export type ReferralProgramConfig = {
  active: boolean;
  prize: string;
  requiredHours: number;
  rulesJson: ManeuverRichContent;
  rulesHtml: string;
};

export type ReferAndEarnConfig = {
  aluno: ReferralProgramConfig;
  instrutor: ReferralProgramConfig;
  updatedAt: string | null;
};

export type ReferAndEarnConfigInput = {
  aluno: ReferralProgramConfig;
  instrutor: ReferralProgramConfig;
};

export type ReferralWelcomeInfo = {
  valid: boolean;
  referrerFirstName: string | null;
  referrerNickname?: string | null;
  schoolName: string;
};

export type MyReferralItem = {
  id: string;
  name: string;
  email: string;
  crmStatus: string;
  userId: string | null;
  flownHours: number;
  requiredHours: number;
  progressPct: number;
  qualifiedAt: string | null;
};

export type MyReferralsPayload = {
  program: ReferralProgramKey;
  programConfig: ReferralProgramConfig;
  referrals: MyReferralItem[];
};

export const DEFAULT_REFERRAL_PROGRAM: ReferralProgramConfig = {
  active: false,
  prize: "",
  requiredHours: 10,
  rulesJson: createEmptyRichContent(),
  rulesHtml: "",
};

export const DEFAULT_REFER_AND_EARN_CONFIG: ReferAndEarnConfig = {
  aluno: { ...DEFAULT_REFERRAL_PROGRAM },
  instrutor: { ...DEFAULT_REFERRAL_PROGRAM },
  updatedAt: null,
};
