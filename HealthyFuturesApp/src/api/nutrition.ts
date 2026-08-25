import { apiPost } from "./client";

export type RecipeCompatibilityRequest = {
  recipe_text: string;
  servings?: number;
  // Lightweight personalization — no patient_id/connection_id required.
  age?: number;
  allergies?: string;
  is_athlete?: boolean;
  dietary_preference?: string;
};

export type NutritionInfo = Record<string, number | string | null>;
export type DiseaseRating = Record<string, string | null>;
export type IngredientBenefit = { ingredient: string; benefits: string[] };

export type RecipeCompatibilityResponse = {
  health_score?: number | null;
  nutrition?: NutritionInfo | null;
  recommended_portion?: string | null;
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
