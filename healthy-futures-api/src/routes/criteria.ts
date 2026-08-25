import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, isUuid, HttpError } from "../middleware/errors";
import { assertCoachOwnsStudent } from "./routines";

const router = Router();

// Attendance is computed, not rated — see schema.sql. The remaining six are
// the coach's judgement calls, in the order the program lists them.
export const RATED_CRITERIA = [
  "attitude",
  "effort",
  "coachability",
  "skill",
  "character",
  "academics",
] as const;

export type RatedCriterion = (typeof RATED_CRITERIA)[number];

const CRITERION_SET = new Set<string>(RATED_CRITERIA);
const ATTENDANCE_TARGET_PCT = 90;
const EXPECTED_CHECKINS_PER_30_DAYS = 8;
const MAX_NOTE = 1000;

router.get(
  "/",
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
          throw new HttpError(403, "You can only view your own progress.");
        }
        await assertCoachOwnsStudent(req.user!.userId, requested);
      }
      targetId = requested;
    } else if (req.user!.role === "coach") {
      throw new HttpError(400, "Provide student_id to view a student's criteria.");
    }

    res.json(await buildCard(targetId));
  })
);

router.put(
  "/",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    const { student_id, note } = req.body || {};
    if (!isUuid(student_id)) {
      throw new HttpError(400, "student_id must be a valid id.");
    }
    await assertCoachOwnsStudent(req.user!.userId, student_id);

    const ratings = pickCriteria(req.body);
    if (Object.keys(ratings).length === 0 && note === undefined) {
      throw new HttpError(
        400,
        `Provide at least one of: ${RATED_CRITERIA.join(", ")} (booleans), or a note.`
      );
    }
    if (note !== undefined && note !== null) {
      if (typeof note !== "string") throw new HttpError(400, "note must be text.");
      if (note.length > MAX_NOTE) {
        throw new HttpError(400, `note must be ${MAX_NOTE} characters or fewer.`);
      }
    }

    const keys = Object.keys(ratings) as RatedCriterion[];
    const columns = [...keys];
    const values: (boolean | string | null)[] = keys.map((k) => ratings[k] as boolean);
    if (note !== undefined) {
      columns.push("note" as RatedCriterion);
      values.push(note === null ? null : String(note));
    }

    // Column names come from the whitelist above, so identifier interpolation
    // here is safe; all values stay parameterized.
    const placeholders = columns.map((_, i) => `$${i + 3}`);
    const assignments = columns.map((c, i) => `${c} = $${i + 3}`).join(", ");

    await pool.query(
      `INSERT INTO criteria_ratings (student_id, rated_by, ${columns.join(", ")}, period)
       VALUES ($1, $2, ${placeholders.join(", ")}, date_trunc('month', CURRENT_DATE)::date)
       ON CONFLICT (student_id, period)
       DO UPDATE SET ${assignments}, rated_by = $2, updated_at = now()`,
      [student_id, req.user!.userId, ...values]
    );

    res.json(await buildCard(student_id));
  })
);

async function buildCard(studentId: string) {
  const ratingResult = await pool.query(
    `SELECT ${RATED_CRITERIA.join(", ")}, note, updated_at
     FROM criteria_ratings
     WHERE student_id = $1 AND period = date_trunc('month', CURRENT_DATE)::date`,
    [studentId]
  );
  const rated = ratingResult.rows[0];

  // Measured against sessions the student's coach actually held. Falls back to
  // an assumed cadence only when no sessions have been scheduled yet, so an
  // empty schedule doesn't read as 0% attendance.
  const attendanceResult = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM sessions s
        JOIN coach_student_links l ON l.coach_id = s.coach_id
        WHERE l.student_id = $1 AND s.starts_at <= now()) AS held,
       (SELECT COUNT(*)::int FROM checkins c
        JOIN sessions s ON s.id = c.session_id
        JOIN coach_student_links l ON l.coach_id = s.coach_id
        WHERE c.user_id = $1 AND l.student_id = $1 AND s.starts_at <= now()) AS attended,
       (SELECT COUNT(*)::int FROM checkins
        WHERE user_id = $1 AND checked_in_at >= now() - interval '30 days') AS recent`,
    [studentId]
  );
  const { held, attended, recent } = attendanceResult.rows[0];

  const attendancePct =
    held > 0
      ? Math.round((attended / held) * 100)
      : Math.min(100, Math.round((recent / EXPECTED_CHECKINS_PER_30_DAYS) * 100));
  const attendanceDetail =
    held > 0
      ? `${attendancePct}% · ${attended} of ${held} session${held === 1 ? "" : "s"}`
      : `${recent} check-in${recent === 1 ? "" : "s"} in 30 days · no sessions scheduled yet`;

  const items = [
    {
      key: "attendance",
      label: "Attendance 90%+",
      met: attendancePct >= ATTENDANCE_TARGET_PCT,
      // Flagged so the UI can show this as measured rather than coach-assigned.
      auto: true,
      detail: attendanceDetail,
    },
    ...RATED_CRITERIA.map((key) => ({
      key,
      label: CRITERION_LABELS[key],
      met: Boolean(rated?.[key]),
      auto: false,
      detail: null as string | null,
    })),
  ];

  return {
    items,
    met_count: items.filter((i) => i.met).length,
    total: items.length,
    attendance_pct: attendancePct,
    note: rated?.note ?? null,
    rated: Boolean(rated),
    updated_at: rated?.updated_at ?? null,
  };
}

const CRITERION_LABELS: Record<RatedCriterion, string> = {
  attitude: "Positive attitude",
  effort: "Effort every session",
  coachability: "Coachability",
  skill: "Skill development",
  character: "Character",
  academics: "Academic responsibility",
};

export function pickCriteria(body: unknown): Partial<Record<RatedCriterion, boolean>> {
  const source = (body ?? {}) as Record<string, unknown>;
  const out: Partial<Record<RatedCriterion, boolean>> = {};
  for (const [key, value] of Object.entries(source)) {
    if (CRITERION_SET.has(key) && typeof value === "boolean") {
      out[key as RatedCriterion] = value;
    }
  }
  return out;
}

export default router;
