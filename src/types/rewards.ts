export type RewardKind = "badge" | "achievement";

export type RewardVisual =
  | {
      type: "libraryIcon";
      iconId: string;
      colorMode: "school" | "custom";
      color?: string;
      imageUrl?: null;
      imageFileId?: null;
    }
  | {
      type: "uploadedImage";
      imageUrl: string;
      imageFileId: string | null;
      colorMode?: "school" | "custom";
      color?: string;
      iconId?: null;
    };

export type RewardMetric =
  | "flight_count"
  | "total_hours"
  | "total_distance_nm"
  | "total_landings"
  | "smooth_landings"
  | "smooth_landing_rate"
  | "smooth_landing_streak"
  | "weekly_streak"
  | "longest_flight_distance_nm"
  | "longest_flight_duration_min"
  | "solo_flight_count"
  | "solo_hours"
  | "night_hours"
  | "ifr_hours"
  | "navigation_hours"
  | "navigation_distance_nm"
  | "navigation_flight_count"
  | "mission_completed_count"
  | "stage_completed_count";

export type RewardOperator = "gte" | "lte" | "eq";

export type RewardCondition = {
  metric: RewardMetric;
  operator: RewardOperator;
  value: number;
};

export type RewardRules = {
  mode: "all" | "any";
  conditions: RewardCondition[];
};

export type JourneyReward = {
  id: string;
  schoolId: string;
  kind: RewardKind;
  trackId: string | null;
  title: string;
  description: string;
  visual: RewardVisual;
  rules: RewardRules;
  isActive: boolean;
  order: number;
  updatedAt: string;
  createdAt?: string;
};

export type JourneyRewardInput = Omit<JourneyReward, "id" | "updatedAt" | "createdAt">;

export type EvaluatedJourneyReward = JourneyReward & {
  achieved: boolean;
  progressPct: number;
  currentValue: number;
  targetValue: number;
};
