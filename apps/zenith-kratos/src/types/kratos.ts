export interface Exercise {
  id: string;
  user_id: string;
  name: string;
  category: 'Quads' | 'Hamstrings' | 'Calves' | 'Glutes' | 'Chest' | 'Lats' | 'Upper Back' | 'Lower Back' | 'Shoulders' | 'Biceps' | 'Triceps' | 'Abs' | 'Obliques' | 'Traps' | 'Forearms';
  primary_muscle?: string;
  secondary_muscles?: string[];
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

export interface Workout {
  id: string;
  user_id: string;
  template_id?: string;
  name: string;
  started_at: string;
  completed_at: string;
  volume: number;
  cardio_stress_factor: number;
  sets: WorkoutExerciseLog[];
  created_at: string;
}

export type KratosTab = 'dashboard' | 'workout' | 'templates' | 'exercises' | 'settings';
