import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, isUuid, HttpError } from "../middleware/errors";

const router = Router();

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
// Below this many scored days a "direction" is noise, not a trend.
const MIN_POINTS_FOR_TREND = 4;

export type CompanionKey = "nutrition" | "primefit" | "zenfit" | "soccer";

export type DailyPoint = { date: string; avg: number; count: number };

export type CompanionTrend = {
  companion: CompanionKey;
  points: DailyPoint[];
  average: number | null;
  latest: number | null;
  // Comparison of the most recent half against the earlier half.
  direction: "improving" | "declining" | "steady" | "unknown";
  changePct: number | null;
};

// Daily average score per companion. Days with no entry are omitted rather than
// zero-filled — a zero would read as a terrible score instead of "didn't log".
async function loadTrends(userId: string, days: number): Promise<CompanionTrend[]> {
  const result = await pool.query(
    `SELECT companion,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            round(avg(score))::int AS avg,
            count(*)::int AS count
     FROM companion_activity
     WHERE user_id = $1
       AND score IS NOT NULL
       AND created_at >= now() - ($2 || ' days')::interval
     GROUP BY companion, day
     ORDER BY companion, day ASC`,
    [userId, String(days)]
  );

  const byCompanion = new Map<CompanionKey, DailyPoint[]>();
  for (const row of result.rows) {
    const key = row.companion as CompanionKey;
    if (!byCompanion.has(key)) byCompanion.set(key, []);
    byCompanion.get(key)!.push({
      date: row.day as string,
      avg: Number(row.avg),
      count: Number(row.count),
    });
  }

  const out: CompanionTrend[] = [];
  for (const [companion, points] of byCompanion) {
    const values = points.map((p) => p.avg);
    const average = values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : null;

    let direction: CompanionTrend["direction"] = "unknown";
    let changePct: number | null = null;

    if (points.length >= MIN_POINTS_FOR_TREND) {
      const mid = Math.floor(points.length / 2);
      const earlier = values.slice(0, mid);
      const recent = values.slice(mid);
      const avgEarlier = earlier.reduce((a, b) => a + b, 0) / earlier.length;
      const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
      const delta = avgRecent - avgEarlier;
      changePct = avgEarlier > 0 ? Math.round((delta / avgEarlier) * 100) : null;
      // A few points of drift is normal day to day; only call it a trend past 5%.
      if (changePct !== null && changePct <= -5) direction = "declining";
      else if (changePct !== null && changePct >= 5) direction = "improving";
      else direction = "steady";
    }

    out.push({
      companion,
      points,
      average,
      latest: values.length ? values[values.length - 1] : null,
      direction,
      changePct,
    });
  }

  return out.sort((a, b) => a.companion.localeCompare(b.companion));
}

// A student's own trends.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const requested = Number(req.query.days);
    const days = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), MAX_DAYS)
      : DEFAULT_DAYS;
    res.json({ days, trends: await loadTrends(req.user!.userId, days) });
  })
);

// A coach viewing one roster student's trends.
router.get(
  "/student",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "coach") {
      throw new HttpError(403, "Coaches only.");
    }
    const studentId = req.query.student_id;
    if (!isUuid(studentId)) {
      throw new HttpError(400, "student_id must be a valid id.");
    }
    const link = await pool.query(
      "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
      [req.user!.userId, studentId]
    );
    if (link.rowCount === 0) {
      throw new HttpError(403, "That student isn't on your roster.");
    }

    const requested = Number(req.query.days);
    const days = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), MAX_DAYS)
      : DEFAULT_DAYS;
    res.json({ days, trends: await loadTrends(studentId, days) });
  })
);

export { loadTrends };
export default router;
