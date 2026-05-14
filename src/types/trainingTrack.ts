export type TrainingMissionType = "DC" | "SL" | "PIC";

export type TrainingMission = {
  id: string;
  name: string;
  durationMinutes: number;
  type: TrainingMissionType;
  maneuvers: string[];
  order: number;
};

export type TrainingStage = {
  id: string;
  name: string;
  order: number;
  missions: TrainingMission[];
};

export type TrainingTrack = {
  id: string;
  schoolId: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  stages: TrainingStage[];
  missionCount: number;
  totalMinutes: number;
  updatedAt: string;
  createdAt: string;
};

export type TrainingTrackInput = {
  schoolId: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  stages: TrainingStage[];
};

export type StudentTrainingTrackStatus = "active" | "completed" | "paused";

export type StudentTrainingTrack = {
  id: string;
  schoolId: string;
  studentUserId: string;
  trackId: string;
  status: StudentTrainingTrackStatus;
  isPrimary: boolean;
  assignedAt: string;
  updatedAt: string;
  track: TrainingTrack | null;
};

export type TrainingSelectionSnapshot = {
  trackId: string;
  trackName: string;
  stageId: string;
  stageName: string;
  missionId: string;
  missionName: string;
  missionType: TrainingMissionType;
  durationMinutes: number;
  maneuvers: string[];
};

export type TrainingMissionSelection = {
  missionId: string;
  snapshot: TrainingSelectionSnapshot;
};
