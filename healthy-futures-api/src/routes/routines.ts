import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, isUuid, HttpError } from "../middleware/errors";

const router = Router();

// Column names double as the API field names, so the whitelist below is also
// what guards the dynamic UPDATE built in PUT /today.
export const FITNESS_FIELDS = ["active_play", "ball_control", "touches", "stretch"] as const;
export const HABIT_FIELDS = ["fruits_veggies", "water", "breakfast", "sleep"] as const;
export const ROUTINE_FIELDS = [...FITNESS_FIELDS, ...HABIT_FIELDS] as const;

export type RoutineField = (typeof ROUTINE_FIELDS)[number];

const FIELD_SET = new Set<string>(ROUTINE_FIELDS);

const EMPTY_DAY = Object.fromEntries(ROUTINE_FIELDS.map((f) => [f, false]));

router.get(
  "/today",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT ${ROUTINE_FIELDS.join(", ")}, log_date
       FROM routine_logs
       WHERE user_id = $1 AND log_date = CURRENT_DATE`,
      [req.user!.userId]
    );
    const day = result.rows[0] ?? { ...EMPTY_DAY, log_date: null };
    const summary = await summarize(req.user!.userId);
    res.json({ today: day, ...summary });
  })
);

router.put(
  "/today",
  requireAuth,
  asyncHandler(async (req, res) => {
    const updates = pickFields(req.body);
    if (Object.keys(updates).length === 0) {
      throw new HttpError(
        400,
        `Provide at least one of: ${ROUTINE_FIELDS.join(", ")} (booleans).`
      );
    }

    const saved = await upsertToday(req.user!.userId, updates);
    const summary = await summarize(req.user!.userId);
    res.json({ today: saved, ...summary });
  })
);

// A coach viewing a student's at-home consistency. Students may only read
// their own history.
router.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const requested = req.query.student_id;
    let targetId = req.user!.userId;

    if (requested !== undefined && requested !== "") {
      if (!isUuid(requested)) {
        throw new HttpError(400, "student_id must be a valid id.");
      }
      if (requested !== req.user!.userId) {
        if (req.user!.role !== "coach") {
          throw new HttpError(403, "You can only view your own routine history.");
        }
        await assertCoachOwnsStudent(req.user!.userId, requested);
      }
      targetId = requested;
    }

    const result = await pool.query(
      `SELECT log_date, ${ROUTINE_FIELDS.join(", ")}
       FROM routine_logs
       WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '27 days'
       ORDER BY log_date DESC`,
      [targetId]
    );
    const summary = await summarize(targetId);
    res.json({ days: result.rows, ...summary });
  })
);

export async function upsertToday(
  userId: string,
  updates: Partial<Record<RoutineField, boolean>>
) {
  const keys = Object.keys(updates) as RoutineField[];
  // Keys are validated against FIELD_SET before reaching here, so they are
  // safe to interpolate as identifiers.
  const assignments = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = keys.map((k) => updates[k]);

  const result = await pool.query(
    `INSERT INTO routine_logs (user_id, log_date, ${keys.join(", ")})
     VALUES ($1, CURRENT_DATE, ${keys.map((_, i) => `$${i + 2}`).join(", ")})
     ON CONFLICT (user_id, log_date)
     DO UPDATE SET ${assignments}, updated_at = now()
     RETURNING ${ROUTINE_FIELDS.join(", ")}, log_date`,
    [userId, ...values]
  );
  return result.rows[0];
}

export function pickFields(body: unknown): Partial<Record<RoutineField, boolean>> {
  const source = (body ?? {}) as Record<string, unknown>;
  const updates: Partial<Record<RoutineField, boolean>> = {};
  for (const [key, value] of Object.entries(source)) {
    if (FIELD_SET.has(key) && typeof value === "boolean") {
      updates[key as RoutineField] = value;
    }
  }
  return updates;
}

// The program asks for fitness 3-5 days a week and daily habits, so the two
// halves are summarized differently: days-active for fitness, a streak for habits.
export async function summarize(userId: string) {
  const fitnessAny = FITNESS_FIELDS.map((f) => f).join(" OR ");
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE log_date >= date_trunc('week', CURRENT_DATE)::date AND (${fitnessAny})
       )::int AS fitness_days_this_week,
       COUNT(*) FILTER (
         WHERE log_date >= CURRENT_DATE - INTERVAL '27 days'
       )::int AS days_logged_last_28
     FROM routine_logs
     WHERE user_id = $1`,
    [userId]
  );

  const streak = await habitStreak(userId);
  return {
    fitness_days_this_week: result.rows[0].fitness_days_this_week,
    days_logged_last_28: result.rows[0].days_logged_last_28,
    habit_streak: streak,
  };
}

// Consecutive days ending today (or yesterday, so an unlogged today doesn't
// look like a broken streak) where every habit was checked.
async function habitStreak(userId: string): Promise<number> {
  const result = await pool.query(
    `SELECT log_date FROM routine_logs
     WHERE user_id = $1
       AND ${HABIT_FIELDS.map((f) => f).join(" AND ")}
       AND log_date >= CURRENT_DATE - INTERVAL '365 days'
     ORDER BY log_date DESC`,
    [userId]
  );
  if (result.rows.length === 0) return 0;

  const days = result.rows.map((r) => toDateKey(r.log_date));
  const today = new Date();
  let cursor = new Date(today);

  // Allow the streak to start at yesterday if today isn't fully logged yet.
  if (days[0] !== toDateKey(today)) {
    cursor.setDate(cursor.getDate() - 1);
    if (days[0] !== toDateKey(cursor)) return 0;
  }

  let streak = 0;
  for (const day of days) {
    if (day !== toDateKey(cursor)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function toDateKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export async function assertCoachOwnsStudent(coachId: string, studentId: string) {
  const link = await pool.query(
    "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
    [coachId, studentId]
  );
  if (link.rows.length === 0) {
    throw new HttpError(403, "That student is not on your roster.");
  }
}

export default router;
