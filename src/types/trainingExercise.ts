export type ExerciseGrade = "NO" | "1" | "2" | "3" | "4";

export type TrainingExercise = {
  id: string;
  schoolId: string;
  title: string;
  acceptableProficiency: string;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TrainingExerciseInput = {
  schoolId: string;
  title: string;
  acceptableProficiency: string;
  order: number;
  isActive: boolean;
};

export type FlightExerciseGrade = {
  exerciseId: string;
  title: string;
  acceptableProficiency: string;
  grade: ExerciseGrade | null;
  order: number;
};
