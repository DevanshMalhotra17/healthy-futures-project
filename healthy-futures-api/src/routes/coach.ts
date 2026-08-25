import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errors";

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
    res.json({
      students: result.rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        linkedAt: r.linked_at,
        checkinsLast30Days: r.checkins_last_30_days,
        lastCheckinAt: r.last_checkin_at,
        fitnessDaysThisWeek: r.fitness_days_this_week,
        routineDaysLast7: r.routine_days_last_7,
        criteriaRated: r.criteria_rated,
        // Attendance is the 7th criterion and is computed client-side from
        // checkinsLast30Days, so this count covers the 6 coach-rated ones.
        criteriaMetCount: r.criteria_met_count,
      })),
    });
  })
);

export default router;
