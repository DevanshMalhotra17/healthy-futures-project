import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, isUuid, HttpError } from "../middleware/errors";

const router = Router();

// A coach's roster is exactly the students with a row in coach_student_links —
// no placeholder rows, no assumed data. A brand-new coach gets an empty array.
router.get(
  "/roster",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    // Check-ins and routine logs are aggregated in separate subqueries: joining
    // both to the same row would multiply them together.
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, l.linked_at,
              COALESCE(ci.recent_count, 0) AS checkins_last_30_days,
              ci.last_checkin_at,
              COALESCE(rl.fitness_days_this_week, 0) AS fitness_days_this_week,
              COALESCE(rl.days_logged_last_7, 0) AS routine_days_last_7,
              cr.student_id IS NOT NULL AS criteria_rated,
              COALESCE(
                (cr.attitude::int + cr.effort::int + cr.coachability::int
                 + cr.skill::int + cr.character::int + cr.academics::int),
                0
              ) AS criteria_met_count
       FROM coach_student_links l
       JOIN users u ON u.id = l.student_id
       LEFT JOIN (
         SELECT user_id,
                COUNT(*) FILTER (WHERE checked_in_at >= now() - interval '30 days')::int
                  AS recent_count,
                MAX(checked_in_at) AS last_checkin_at
         FROM checkins GROUP BY user_id
       ) ci ON ci.user_id = u.id
       LEFT JOIN (
         SELECT user_id,
                COUNT(*) FILTER (
                  WHERE log_date >= date_trunc('week', CURRENT_DATE)::date
                    AND (active_play OR ball_control OR touches OR stretch)
                )::int AS fitness_days_this_week,
                COUNT(*) FILTER (WHERE log_date >= CURRENT_DATE - INTERVAL '6 days')::int
                  AS days_logged_last_7
         FROM routine_logs GROUP BY user_id
       ) rl ON rl.user_id = u.id
       LEFT JOIN criteria_ratings cr
         ON cr.student_id = u.id
        AND cr.period = date_trunc('month', CURRENT_DATE)::date
       WHERE l.coach_id = $1
       ORDER BY l.linked_at DESC`,
      [req.user!.userId]
    );

    // Attendance is measured against sessions this coach actually held, not an
    // assumed cadence, so a coach with no past sessions shows no percentage
    // rather than 0%.
    const heldResult = await pool.query(
      `SELECT COUNT(*)::int AS held FROM sessions
       WHERE coach_id = $1 AND starts_at <= now()`,
      [req.user!.userId]
    );
    const sessionsHeld = heldResult.rows[0].held;

    const attendedResult = await pool.query(
      `SELECT c.user_id,
              COUNT(*) FILTER (WHERE c.status = 'present')::int AS attended,
              COUNT(*) FILTER (WHERE c.status = 'excused')::int AS excused
       FROM checkins c
       JOIN sessions s ON s.id = c.session_id
       WHERE s.coach_id = $1 AND s.starts_at <= now()
       GROUP BY c.user_id`,
      [req.user!.userId]
    );
    const attendedBy = new Map<string, number>(
      attendedResult.rows.map((r) => [r.user_id, r.attended])
    );
    const excusedBy = new Map<string, number>(
      attendedResult.rows.map((r) => [r.user_id, r.excused])
    );
    res.json({
      sessionsHeld,
      students: result.rows.map((r) => {
        const attended = attendedBy.get(r.id) ?? 0;
        const excused = excusedBy.get(r.id) ?? 0;
        // Excused sessions leave the denominator entirely, so a student with a
        // note isn't penalised for one they were told not to attend.
        const countable = Math.max(sessionsHeld - excused, 0);
        return {
          id: r.id,
          fullName: r.full_name,
          email: r.email,
          linkedAt: r.linked_at,
          checkinsLast30Days: r.checkins_last_30_days,
          lastCheckinAt: r.last_checkin_at,
          sessionsAttended: attended,
          sessionsHeld,
          sessionsExcused: excused,
          attendancePct:
            countable > 0 ? Math.round((attended / countable) * 100) : null,
          fitnessDaysThisWeek: r.fitness_days_this_week,
          routineDaysLast7: r.routine_days_last_7,
          criteriaRated: r.criteria_rated,
          // Attendance is the 7th criterion and is derived separately, so this
          // count covers only the 6 coach-rated ones.
          criteriaMetCount: r.criteria_met_count,
        };
      }),
    });
  })
);

// A student's companion history, for the coach. Students read their own via
// each companion's endpoint; this is the cross-companion roll-up.
router.get(
  "/student-activity",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    const studentId = req.query.student_id;
    if (!isUuid(studentId)) {
      throw new HttpError(400, "student_id must be a valid id.");
    }

    const link = await pool.query(
      "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
      [req.user!.userId, studentId]
    );
    if (link.rows.length === 0) {
      throw new HttpError(403, "That student is not on your roster.");
    }

    // The session on the same calendar day is joined in so the coach can see
    // whether a meal was logged before practice, rather than working it out from
    // two timestamps.
    const activity = await pool.query(
      `SELECT a.id, a.companion, a.score, a.detail, a.created_at,
              s.starts_at AS session_starts_at,
              s.title     AS session_title
       FROM companion_activity a
       LEFT JOIN LATERAL (
         SELECT s.starts_at, s.title
         FROM sessions s
         JOIN coach_student_links l ON l.coach_id = s.coach_id
         WHERE l.student_id = a.user_id
           AND s.starts_at::date = (a.created_at AT TIME ZONE 'UTC')::date
         ORDER BY s.starts_at ASC
         LIMIT 1
       ) s ON true
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [studentId]
    );

    // Per-companion rollup so the coach sees engagement at a glance.
    const summary = await pool.query(
      `SELECT companion,
              COUNT(*)::int AS uses,
              ROUND(AVG(score))::int AS avg_score,
              MAX(created_at) AS last_used
       FROM companion_activity
       WHERE user_id = $1
       GROUP BY companion
       ORDER BY last_used DESC`,
      [studentId]
    );

    res.json({
      activity: activity.rows.map((r) => {
        const logged = new Date(r.created_at).getTime();
        const sessionAt = r.session_starts_at ? new Date(r.session_starts_at).getTime() : null;
        return {
          id: r.id,
          companion: r.companion,
          score: r.score,
          detail: r.detail,
          createdAt: r.created_at,
          sessionStartsAt: r.session_starts_at ?? null,
          sessionTitle: r.session_title ?? null,
          // null when there was no session that day. This is the bit the coach
          // actually wants: did the food go in before practice?
          minutesBeforeSession:
            sessionAt === null ? null : Math.round((sessionAt - logged) / 60000),
        };
      }),
      summary: summary.rows.map((r) => ({
        companion: r.companion,
        uses: r.uses,
        avgScore: r.avg_score,
        lastUsed: r.last_used,
      })),
    });
  })
);

export default router;
