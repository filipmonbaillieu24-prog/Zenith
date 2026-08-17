export type MuscleGroupKey =
  | 'chest'
  | 'deltoids'
  | 'biceps'
  | 'triceps'
  | 'abs'
  | 'obliques'
  | 'quadriceps'
  | 'upperBack'
  | 'lowerBack'
  | 'gluteal'
  | 'hamstring'
  | 'calves'
  | 'forearm'
  | 'trapezius';

export interface Exercise {
  id: string;
  user_id: string;
  name: string;
  category: 'Quads' | 'Hamstrings' | 'Calves' | 'Glutes' | 'Chest' | 'Lats' | 'Upper Back' | 'Lower Back' | 'Shoulders' | 'Biceps' | 'Triceps' | 'Abs' | 'Obliques' | 'Traps' | 'Forearms';
  primary_muscle?: MuscleGroupKey;
  secondary_muscles?: MuscleGroupKey[];
  notes?: string;
  increment_weight: number;
  increment_per_side: boolean;
  is_bodyweight: boolean;
  default_rir: number;
  weight_unit: 'kg' | 'lbs';
  deleted: boolean;
}

export interface TemplateSet {
  type: 'warmup' | 'working';
  min_reps: number;
  max_reps: number;
  target_rir: number;
}

export interface TemplateExercise {
  exercise_id: string;
  sets: TemplateSet[];
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  exercises: TemplateExercise[];
  created_at: string;
}

export interface WorkoutLoggedSet {
  type: 'warmup' | 'working';
  weight: number;
  reps: number;
  rir: number;
  rest_seconds?: number;
}

export interface WorkoutExerciseLog {
  exercise_id: string;
  sets: WorkoutLoggedSet[];
}

export interface WorkoutLog {
  id: string;
  user_id: string;
  template_id?: string;
  name: string;
  logged_at: string;
  duration_minutes?: number;
  exercises: WorkoutExerciseLog[];
}
