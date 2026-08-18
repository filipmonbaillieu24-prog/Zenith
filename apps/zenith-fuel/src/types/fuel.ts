export interface Ingredient {
  id: string;
  name: string;
  barcode?: string;
  calories_per_100g: number;
  carbs_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  portion_name?: string;
  portion_weight_grams?: number;
  portions_per_package?: number;
  caffeine_mg_per_100g?: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  category: string;
  serving_size: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  caffeine_mg?: number;
  ingredients: any[];
  instructions: string[];
}

export interface FoodLog {
  id: string;
  logged_at: string;
  meal_type: string;
  custom_name?: string;
  recipe_id?: string;
  quantity: number;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  caffeine_mg?: number;
}

export interface DayState {
  date: string;
  is_complete: boolean;
}

export type FuelTab = 'dashboard' | 'logbook' | 'ingredients' | 'recipes' | 'supplements';
