import { apiPost } from "./client";

export const MEAL_TYPES = [
  { key: "breakfast", label: "Breakfast" },
  { key: "brunch", label: "Brunch" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
] as const;

export type MealType = (typeof MEAL_TYPES)[number]["key"];

export type RecipeCompatibilityRequest = {
  recipe_text: string;
  servings?: number;
  // Lightweight personalization — no patient_id/connection_id required.
  age?: number;
  allergies?: string;
  is_athlete?: boolean;
  dietary_preference?: string;
  meal_type?: MealType;
  // Only meaningful when meal_type is "snack".
  snack_time?: string;
};

export type NutritionInfo = Record<string, number | string | null>;
export type DiseaseRating = Record<string, string | null>;
export type IngredientBenefit = { ingredient: string; benefits: string[] };

export type RecipeCompatibilityResponse = {
  health_score?: number | null;
  nutrition?: NutritionInfo | null;
  recommended_portion?: string | null;
  timing_note?: string | null;
  disease_suitability?: DiseaseRating | null;
  ingredient_benefits: IngredientBenefit[];
  ingredient_substitutions: (string | Record<string, unknown>)[];
  health_labels?: string[];
  warnings: string[];
  summary?: string | null;
};

export async function getRecipeCompatibility(
  request: RecipeCompatibilityRequest,
  token?: string | null
): Promise<RecipeCompatibilityResponse> {
  return apiPost<RecipeCompatibilityResponse>("/recipe-recommendation", request, token);
}
