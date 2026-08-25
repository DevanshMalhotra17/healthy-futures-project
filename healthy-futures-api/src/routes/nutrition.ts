import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errors";
import { isConfigured } from "../services/anthropic";
import { analyzeRecipe, MealType } from "../services/nutrition";
import { logCompanionUse } from "../services/activity";

const router = Router();

const MAX_RECIPE_TEXT = 4000;
const MEAL_TYPES: MealType[] = ["breakfast", "brunch", "lunch", "dinner", "snack"];
// Accepts "7", "7pm", "19:30", "7:30 pm".
const TIME_RE = /^\d{1,2}(:\d{2})?\s*(am|pm)?$/i;

// Backs the Nutrition companion panel. The chat assistant calls the same
// service via its analyze_food tool, so both surfaces agree.
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Validate the request before reporting server configuration, so a
    // malformed request gets a useful 400 either way.
    const {
      recipe_text,
      servings,
      allergies,
      age,
      dietary_preference,
      meal_type,
      snack_time,
    } = req.body || {};
    const text = String(recipe_text ?? "").trim();
    if (!text) {
      throw new HttpError(400, "recipe_text is required.");
    }
    if (text.length > MAX_RECIPE_TEXT) {
      throw new HttpError(400, `recipe_text must be ${MAX_RECIPE_TEXT} characters or fewer.`);
    }

    const servingCount =
      servings === undefined || servings === null ? undefined : Number(servings);
    if (servingCount !== undefined && (!Number.isFinite(servingCount) || servingCount < 1)) {
      throw new HttpError(400, "servings must be a positive number.");
    }

    const ageValue = age === undefined || age === null ? undefined : Number(age);
    if (ageValue !== undefined && (!Number.isFinite(ageValue) || ageValue < 5 || ageValue > 120)) {
      throw new HttpError(400, "age must be a realistic number.");
    }

    let mealType: MealType | undefined;
    if (meal_type !== undefined && meal_type !== null && meal_type !== "") {
      const candidate = String(meal_type).trim().toLowerCase();
      if (!MEAL_TYPES.includes(candidate as MealType)) {
        throw new HttpError(400, `meal_type must be one of: ${MEAL_TYPES.join(", ")}.`);
      }
      mealType = candidate as MealType;
    }

    let snackTime: string | undefined;
    if (snack_time !== undefined && snack_time !== null && String(snack_time).trim() !== "") {
      const candidate = String(snack_time).trim();
      if (!TIME_RE.test(candidate)) {
        throw new HttpError(400, "snack_time should look like a time, e.g. 4pm or 16:30.");
      }
      if (mealType !== "snack") {
        throw new HttpError(400, "snack_time only applies when meal_type is snack.");
      }
      snackTime = candidate;
    }

    if (!isConfigured()) {
      throw new HttpError(
        503,
        "The nutrition companion isn't configured yet — the server needs an ANTHROPIC_API_KEY."
      );
    }

    const analysis = await analyzeRecipe(text, {
      servings: servingCount,
      age: ageValue,
      allergies: allergies === undefined || allergies === null ? undefined : String(allergies),
      dietaryPreference:
        dietary_preference === undefined || dietary_preference === null
          ? undefined
          : String(dietary_preference),
      mealType,
      snackTime,
    });

    await logCompanionUse(req.user!.userId, "nutrition", {
      score: analysis.health_score,
      detail: `${mealType ? `${mealType}: ` : ""}${text.slice(0, 120)}`,
    });

    res.json(analysis);
  })
);

export default router;
