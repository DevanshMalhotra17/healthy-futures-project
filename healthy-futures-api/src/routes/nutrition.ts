import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errors";
import { isConfigured } from "../services/anthropic";
import { analyzeRecipe } from "../services/nutrition";

const router = Router();

const MAX_RECIPE_TEXT = 4000;

// Backs the Nutrition companion panel. The chat assistant calls the same
// service via its analyze_food tool, so both surfaces agree.
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Validate the request before reporting server configuration, so a
    // malformed request gets a useful 400 either way.
    const { recipe_text, servings, allergies } = req.body || {};
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

    if (!isConfigured()) {
      throw new HttpError(
        503,
        "The nutrition companion isn't configured yet — the server needs an ANTHROPIC_API_KEY."
      );
    }

    const analysis = await analyzeRecipe(text, {
      servings: servingCount,
      allergies: allergies === undefined || allergies === null ? undefined : String(allergies),
    });

    res.json(analysis);
  })
);

export default router;
