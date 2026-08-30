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
// Character Points: ZenFit check-ins earn points because kids won't volunteer how
// they feel, so we reward the act of checking in rather than the mood reported.
export const POINTS_PER_CHECKIN = 10;
// Roughly one check-in a day for a fortnight.
export const CHARACTER_POINTS_TARGET = 140;

// Effort: mean of the effort scores a coach has attributed from match clips.
export const EFFORT_TARGET = 70;
// Skill Development: how much the athlete is improving across all four companions,
// rather than any single raw score. Each companion contributes up to 25 points.
export const SKILL_TARGET = 60;
const COMPANIONS = ["nutrition", "primefit", "zenfit", "soccer"] as const;
const POINTS_PER_COMPANION = 100 / COMPANIONS.length;

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
    const { student_id, note, character_override, effort_override, skill_override } =
      req.body || {};
    if (!isUuid(student_id)) {
      throw new HttpError(400, "student_id must be a valid id.");
    }
    await assertCoachOwnsStudent(req.user!.userId, student_id);

    // true/false forces a tick either way; null hands control back to the score.
    const OVERRIDES = [
      ["character_override", character_override],
      ["effort_override", effort_override],
      ["skill_override", skill_override],
    ] as const;
    const supplied = OVERRIDES.filter(([, v]) => v !== undefined);
    for (const [name, value] of supplied) {
      if (value !== null && typeof value !== "boolean") {
        throw new HttpError(400, `${name} must be true, false, or null.`);
      }
    }
    const hasOverride = supplied.length > 0;

    const ratings = pickCriteria(req.body);
    if (Object.keys(ratings).length === 0 && note === undefined && !hasOverride) {
      throw new HttpError(
        400,
        `Provide at least one of: ${RATED_CRITERIA.join(", ")} (booleans), a note, or an override.`
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
    for (const [name, value] of supplied) {
      columns.push(name as RatedCriterion);
      values.push(value === null ? null : Boolean(value));
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
    `SELECT ${RATED_CRITERIA.join(", ")}, character_override, effort_override, skill_override, note, updated_at
     FROM criteria_ratings
     WHERE student_id = $1 AND period = date_trunc('month', CURRENT_DATE)::date`,
    [studentId]
  );
  const rated = ratingResult.rows[0];

  // Points accrue over the month this card covers, matching the period the
  // coach's ratings apply to.
  const pointsResult = await pool.query(
    `SELECT COUNT(*)::int AS checkins
     FROM zenfit_checkins
     WHERE user_id = $1
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
    [studentId]
  );
  const checkins = pointsResult.rows[0]?.checkins ?? 0;
  const characterPoints = checkins * POINTS_PER_CHECKIN;
  const pointsEarnCharacter = characterPoints >= CHARACTER_POINTS_TARGET;

  // Effort comes straight from the soccer analyser: the mean of every effort score
  // the coach has attributed to this student.
  const effortResult = await pool.query(
    `SELECT round(avg(effort))::int AS avg_effort, COUNT(*)::int AS clips
     FROM soccer_results WHERE user_id = $1`,
    [studentId]
  );
  const effortScore: number | null = effortResult.rows[0]?.avg_effort ?? null;
  const effortClips = effortResult.rows[0]?.clips ?? 0;

  // Skill Development measures improvement across all four companions rather than
  // any one raw score: a rising trend earns the full share, holding steady earns
  // half, and declining or unmeasured earns nothing.
  const { loadTrends } = await import("./trends");
  const trends = await loadTrends(studentId, 28).catch(() => []);
  const byCompanion = new Map(trends.map((t) => [t.companion, t]));
  let skillScore = 0;
  const skillParts: { companion: string; direction: string; points: number }[] = [];
  for (const companion of COMPANIONS) {
    const t = byCompanion.get(companion);
    const direction = t?.direction ?? "unknown";
    const points =
      direction === "improving"
        ? POINTS_PER_COMPANION
        : direction === "steady"
        ? POINTS_PER_COMPANION / 2
        : 0;
    skillScore += points;
    skillParts.push({ companion, direction, points: Math.round(points) });
  }
  skillScore = Math.round(skillScore);

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
        WHERE c.user_id = $1 AND l.student_id = $1 AND s.starts_at <= now()
          AND c.status = 'present') AS attended,
       (SELECT COUNT(*)::int FROM checkins c
        JOIN sessions s ON s.id = c.session_id
        JOIN coach_student_links l ON l.coach_id = s.coach_id
        WHERE c.user_id = $1 AND l.student_id = $1 AND s.starts_at <= now()
          AND c.status = 'excused') AS excused,
       (SELECT COUNT(*)::int FROM checkins
        WHERE user_id = $1 AND checked_in_at >= now() - interval '30 days') AS recent`,
    [studentId]
  );
  const { held, attended, excused, recent } = attendanceResult.rows[0];

  // Excused sessions leave the denominator so a student with a note isn't
  // penalised. Must match the roster endpoint or the two screens disagree.
  const countable = Math.max(held - excused, 0);
  const attendancePct =
    countable > 0
      ? Math.round((attended / countable) * 100)
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
    ...RATED_CRITERIA.map((key) => {
      if (key === "effort") {
        const override = rated?.effort_override as boolean | null | undefined;
        const auto = override === null || override === undefined;
        const met = auto ? effortScore !== null && effortScore >= EFFORT_TARGET : override;
        return {
          key,
          label: CRITERION_LABELS[key],
          met,
          auto,
          detail: auto
            ? effortScore === null
              ? "No match clips scored yet"
              : `Effort score ${effortScore} of 100 · target ${EFFORT_TARGET} · ${effortClips} clip${
                  effortClips === 1 ? "" : "s"
                }`
            : `Set by coach${effortScore !== null ? ` · effort score ${effortScore}` : ""}`,
        };
      }
      if (key === "skill") {
        const override = rated?.skill_override as boolean | null | undefined;
        const auto = override === null || override === undefined;
        const met = auto ? skillScore >= SKILL_TARGET : override;
        const rising = skillParts.filter((p) => p.direction === "improving").length;
        return {
          key,
          label: CRITERION_LABELS[key],
          met,
          auto,
          detail: auto
            ? `Development score ${skillScore} of 100 · target ${SKILL_TARGET} · ${rising} of 4 companions improving`
            : `Set by coach · development score ${skillScore}`,
        };
      }
      if (key === "character") {
        // An explicit coach override always wins; otherwise points decide, and the
        // stored tick is the fallback for students with no check-ins.
        const override = rated?.character_override as boolean | null | undefined;
        // Points decide unless the coach has explicitly overridden. The legacy
        // `character` tick is deliberately NOT a fallback: honouring it would let a
        // stale manual tick satisfy the criterion at zero points, which defeats the
        // purpose of earning them.
        const met =
          override !== null && override !== undefined ? override : pointsEarnCharacter;
        return {
          key,
          label: CRITERION_LABELS[key],
          met,
          auto: override === null || override === undefined,
          detail:
            override !== null && override !== undefined
              ? `Set by coach · ${characterPoints} points earned`
              : `${characterPoints} of ${CHARACTER_POINTS_TARGET} Character Points`,
        };
      }
      return {
        key,
        label: CRITERION_LABELS[key],
        met: Boolean(rated?.[key]),
        auto: false,
        detail: null as string | null,
      };
    }),
  ];

  return {
    items,
    met_count: items.filter((i) => i.met).length,
    total: items.length,
    attendance_pct: attendancePct,
    character_points: characterPoints,
    effort_score: effortScore,
    effort_target: EFFORT_TARGET,
    effort_clips: effortClips,
    skill_score: skillScore,
    skill_target: SKILL_TARGET,
    skill_breakdown: skillParts,
    character_points_target: CHARACTER_POINTS_TARGET,
    zenfit_checkins: checkins,
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
