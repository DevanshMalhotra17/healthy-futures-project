import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errors";
import { isConfigured } from "../services/anthropic";
import { analyzeRecipe, MealType } from "../services/nutrition";
import { logCompanionUse } from "../services/activity";

const router = Router();

const MAX_RECIPE_TEXT = 4000;
// Base64 inflates by ~4/3, so this caps the original photo near 4 MB — inside
// the 8 MB body limit this route is mounted with. The app downscales first.
const MAX_IMAGE_CHARS = 5_600_000;
const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];
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
      image,
      image_media_type,
    } = req.body || {};

    // A photo is the evidence; the note is optional colour. Typed-only entries
    // are refused because they are trivial to fake.
    const imageData = typeof image === "string" ? image.replace(/^data:[^,]+,/, "").trim() : "";
    if (!imageData) {
      throw new HttpError(400, "A photo of the food is required.");
    }
    if (imageData.length > MAX_IMAGE_CHARS) {
      throw new HttpError(400, "That photo is too large — take a new one and try again.");
    }
    const mediaType =
      typeof image_media_type === "string" && ALLOWED_MEDIA.includes(image_media_type)
        ? image_media_type
        : "image/jpeg";

    const text = String(recipe_text ?? "").trim();
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

    // Look up today's session for this student so timing is judged against real
    // practice time. The student never has to enter it, and a coach logging their
    // own meal simply has no session to compare against.
    let minutesToSession: number | null = null;
    let sessionTitle: string | null = null;
    try {
      const session = await pool.query(
        `SELECT s.starts_at, s.title
         FROM sessions s
         JOIN coach_student_links l ON l.coach_id = s.coach_id
         WHERE l.student_id = $1
           AND s.starts_at::date = CURRENT_DATE
         ORDER BY s.starts_at ASC
         LIMIT 1`,
        [req.user!.userId]
      );
      if (session.rows.length > 0) {
        minutesToSession = Math.round(
          (new Date(session.rows[0].starts_at).getTime() - Date.now()) / 60000
        );
        sessionTitle = session.rows[0].title;
      }
    } catch {
      // No session context is fine; the analysis just loses that nuance.
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
      minutesToSession,
      sessionTitle,
      imageBase64: imageData,
      imageMediaType: mediaType,
    });

    await logCompanionUse(req.user!.userId, "nutrition", {
      score: analysis.health_score,
      // Timing goes in the detail so a coach reading the activity list can see the
      // meal was before practice without opening anything else. With photo-only
      // input the note is often empty, so fall back to what the model saw.
      detail: `${mealType ? `${mealType}: ` : ""}${(
        text || analysis.summary || "photo"
      ).slice(0, 100)}${
        minutesToSession !== null && minutesToSession > 0
          ? ` · ${minutesToSession}m before ${sessionTitle ?? "practice"}`
          : minutesToSession !== null
          ? ` · after ${sessionTitle ?? "practice"}`
          : ""
      }`,
    });

    res.json(analysis);
  })
);

export default router;
