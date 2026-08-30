import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errors";

const router = Router();

// Age and allergies don't change between meals, so asking every time was noise.
// They're stored once here and read by the nutrition companion from then on.
const MAX_ALLERGIES = 500;
const MAX_DIET = 120;
const MIN_AGE = 5;
const MAX_AGE = 120;

export type NutritionProfile = {
  age: number | null;
  allergies: string | null;
  dietary_preference: string | null;
};

// Used by the nutrition route so a request without age/allergies still gets
// personalised advice instead of generic scoring.
export async function loadNutritionProfile(userId: string): Promise<NutritionProfile> {
  const result = await pool.query(
    "SELECT age, allergies, dietary_preference FROM user_profile WHERE user_id = $1",
    [userId]
  );
  const row = result.rows[0];
  return {
    age: row?.age ?? null,
    allergies: row?.allergies ?? null,
    dietary_preference: row?.dietary_preference ?? null,
  };
}

router.get(
  "/nutrition",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await loadNutritionProfile(req.user!.userId);
    res.json({
      ...profile,
      // The app uses this to decide whether to ask at all.
      complete: profile.age !== null,
    });
  })
);

router.put(
  "/nutrition",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { age, allergies, dietary_preference } = req.body ?? {};

    let ageValue: number | null = null;
    if (age !== undefined && age !== null && age !== "") {
      const n = Number(age);
      if (!Number.isInteger(n) || n < MIN_AGE || n > MAX_AGE) {
        throw new HttpError(400, `age must be a whole number between ${MIN_AGE} and ${MAX_AGE}.`);
      }
      ageValue = n;
    }

    // An empty string is a deliberate "no allergies", which is different from
    // never having been asked — so it's stored as "" rather than NULL.
    let allergyValue: string | null = null;
    if (allergies !== undefined && allergies !== null) {
      const text = String(allergies).trim();
      if (text.length > MAX_ALLERGIES) {
        throw new HttpError(400, `allergies must be ${MAX_ALLERGIES} characters or fewer.`);
      }
      allergyValue = text;
    }

    let dietValue: string | null = null;
    if (dietary_preference !== undefined && dietary_preference !== null) {
      const text = String(dietary_preference).trim();
      if (text.length > MAX_DIET) {
        throw new HttpError(400, `dietary_preference must be ${MAX_DIET} characters or fewer.`);
      }
      dietValue = text;
    }

    if (ageValue === null && allergyValue === null && dietValue === null) {
      throw new HttpError(400, "Provide age, allergies or dietary_preference.");
    }

    // COALESCE on update so saving one field doesn't wipe the others.
    const saved = await pool.query(
      `INSERT INTO user_profile (user_id, age, allergies, dietary_preference)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         age                = COALESCE($2, user_profile.age),
         allergies          = COALESCE($3, user_profile.allergies),
         dietary_preference = COALESCE($4, user_profile.dietary_preference),
         updated_at         = now()
       RETURNING age, allergies, dietary_preference`,
      [req.user!.userId, ageValue, allergyValue, dietValue]
    );

    const row = saved.rows[0];
    res.json({
      age: row.age ?? null,
      allergies: row.allergies ?? null,
      dietary_preference: row.dietary_preference ?? null,
      complete: row.age !== null,
    });
  })
);

export default router;
