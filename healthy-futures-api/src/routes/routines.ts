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
      `SELECT ${ROUTINE_FIELDS.join(", ")}, active_minutes, sleep_hours,
              active_source, sleep_source, log_date
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
  // active_play and sleep can also come from a health store. Tag a hand-set value
  // as manual so a later sync doesn't quietly overwrite the student's own answer.
  const extraColumns: string[] = [];
  if (keys.includes("active_play")) extraColumns.push("active_source");
  if (keys.includes("sleep")) extraColumns.push("sleep_source");
  // Keys are validated against FIELD_SET before reaching here, so they are
  // safe to interpolate as identifiers.
  const allColumns = [...keys, ...extraColumns];
  const assignments = allColumns.map((c, i) => `${c} = $${i + 2}`).join(", ");
  const values: (boolean | string | undefined)[] = [
    ...keys.map((k) => updates[k]),
    ...extraColumns.map(() => "manual"),
  ];

  const result = await pool.query(
    `INSERT INTO routine_logs (user_id, log_date, ${allColumns.join(", ")})
     VALUES ($1, CURRENT_DATE, ${allColumns.map((_, i) => `$${i + 2}`).join(", ")})
     ON CONFLICT (user_id, log_date)
     DO UPDATE SET ${assignments}, updated_at = now()
     RETURNING ${ROUTINE_FIELDS.join(", ")}, active_minutes, sleep_hours,
               active_source, sleep_source, log_date`,
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


// Measured values from the device's health store (Apple Health today). Kept on a
// separate route from PUT /today so the boolean whitelist there stays strict.
//
// Two rules matter here:
//  - A manual tap always wins. If a student has already ticked or un-ticked an
//    item themselves, a later health sync must not silently flip it.
//  - Only these two items are derivable. Ball control, touches, stretching and
//    the nutrition habits have no sensor equivalent and stay self-reported.
const ACTIVE_MINUTES_TARGET = 30;
const SLEEP_HOURS_TARGET = 8;

router.put(
  "/health-sync",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { active_minutes, sleep_hours } = req.body ?? {};

    const minutes =
      active_minutes === undefined || active_minutes === null
        ? null
        : Number(active_minutes);
    const hours =
      sleep_hours === undefined || sleep_hours === null ? null : Number(sleep_hours);

    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440)) {
      throw new HttpError(400, "active_minutes must be between 0 and 1440.");
    }
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
      throw new HttpError(400, "sleep_hours must be between 0 and 24.");
    }
    if (minutes === null && hours === null) {
      throw new HttpError(400, "Provide active_minutes or sleep_hours.");
    }

    // What the student has already set by hand today.
    const existing = await pool.query(
      `SELECT active_play, sleep, active_source, sleep_source
       FROM routine_logs WHERE user_id = $1 AND log_date = CURRENT_DATE`,
      [req.user!.userId]
    );
    const row = existing.rows[0];
    const activeIsManual = row?.active_source === "manual";
    const sleepIsManual = row?.sleep_source === "manual";

    const columns: string[] = [];
    const values: (number | boolean | string | null)[] = [];
    const push = (col: string, value: number | boolean | string | null) => {
      columns.push(col);
      values.push(value);
    };

    if (minutes !== null) {
      push("active_minutes", Math.round(minutes));
      if (!activeIsManual) {
        push("active_play", Math.round(minutes) >= ACTIVE_MINUTES_TARGET);
        push("active_source", "health");
      }
    }
    if (hours !== null) {
      push("sleep_hours", hours);
      if (!sleepIsManual) {
        push("sleep", hours >= SLEEP_HOURS_TARGET);
        push("sleep_source", "health");
      }
    }

    const assignments = columns.map((c, i) => `${c} = $${i + 2}`).join(", ");
    const placeholders = columns.map((_, i) => `$${i + 2}`).join(", ");
    const saved = await pool.query(
      `INSERT INTO routine_logs (user_id, log_date, ${columns.join(", ")})
       VALUES ($1, CURRENT_DATE, ${placeholders})
       ON CONFLICT (user_id, log_date)
       DO UPDATE SET ${assignments}, updated_at = now()
       RETURNING ${ROUTINE_FIELDS.join(", ")}, active_minutes, sleep_hours,
                 active_source, sleep_source, log_date`,
      [req.user!.userId, ...values]
    );

    const summary = await summarize(req.user!.userId);
    res.json({
      today: saved.rows[0],
      ...summary,
      applied: {
        active_play: minutes !== null && !activeIsManual,
        sleep: hours !== null && !sleepIsManual,
      },
      // So the client can explain why a manual choice was left alone.
      skipped_manual: { active_play: activeIsManual, sleep: sleepIsManual },
    });
  })
);

export default router;
