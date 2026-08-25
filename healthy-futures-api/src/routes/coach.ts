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
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, l.linked_at,
              COUNT(c.id) FILTER (WHERE c.checked_in_at >= now() - interval '30 days')::int
                AS checkins_last_30_days,
              MAX(c.checked_in_at) AS last_checkin_at
       FROM coach_student_links l
       JOIN users u ON u.id = l.student_id
       LEFT JOIN checkins c ON c.user_id = u.id
       WHERE l.coach_id = $1
       GROUP BY u.id, u.full_name, u.email, l.linked_at
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
      })),
    });
  })
);

export default router;
