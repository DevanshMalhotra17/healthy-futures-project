import { apiGet, apiPost, apiPut } from "./client";

export const MEAL_TYPES = [
  { key: "breakfast", label: "Breakfast" },
  { key: "brunch", label: "Brunch" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
] as const;

export type MealType = (typeof MEAL_TYPES)[number]["key"];

export type RecipeCompatibilityRequest = {
  // Required: base64 photo of the actual plate. The server refuses typed-only
  // entries because they're trivial to fake.
  image: string;
  image_media_type?: string;
  // Optional note. The model treats it as a hint and will contradict it if the
  // photo disagrees.
  recipe_text?: string;
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
export type IngredientBenefit = { ingredient: string; benefits: string[] };

export type RecipeCompatibilityResponse = {
  health_score?: number | null;
  nutrition?: NutritionInfo | null;
  recommended_portion?: string | null;
  timing_note?: string | null;
  // Practical swaps the athlete can act on — the coaching payoff of a score.
  ingredient_substitutions: string[];
  ingredient_benefits: IngredientBenefit[];
  health_labels: string[];
  warnings: string[];
  summary?: string | null;
};

export async function getRecipeCompatibility(
  request: RecipeCompatibilityRequest,
  token?: string | null
): Promise<RecipeCompatibilityResponse> {
  return apiPost<RecipeCompatibilityResponse>("/recipe-recommendation", request, token);
}

// Age and allergies are asked once and stored server-side, so the companion
// stops interrogating a kid before every meal.
export type NutritionProfile = {
  age: number | null;
  allergies: string | null;
  dietary_preference: string | null;
  complete: boolean;
};

export async function getNutritionProfile(
  token?: string | null
): Promise<NutritionProfile> {
  return apiGet<NutritionProfile>("/profile/nutrition", token);
}

export async function saveNutritionProfile(
  input: { age?: number; allergies?: string; dietary_preference?: string },
  token?: string | null
): Promise<NutritionProfile> {
  return apiPut<NutritionProfile>("/profile/nutrition", input, token);
}
