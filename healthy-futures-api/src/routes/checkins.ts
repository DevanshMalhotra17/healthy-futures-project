import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, isUuid, HttpError } from "../middleware/errors";

const router = Router();

const MAX_SESSION_LABEL = 200;

// Attendance is taken by the coach, never self-reported: a student marking
// their own attendance would make the figure meaningless, and attendance feeds
// the level-up criteria. Prefer PUT /sessions/:id/attendance, which ties the
// record to a real session; this endpoint covers ad-hoc labels.
router.post(
  "/",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    const { session_label, student_id } = req.body || {};
    const label = String(session_label ?? "").trim();
    if (!label) {
      throw new HttpError(400, "session_label is required.");
    }
    if (label.length > MAX_SESSION_LABEL) {
      throw new HttpError(400, `session_label must be ${MAX_SESSION_LABEL} characters or fewer.`);
    }
    if (!isUuid(student_id)) {
      throw new HttpError(400, "student_id must be a valid id.");
    }

    const link = await pool.query(
      "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
      [req.user!.userId, student_id]
    );
    if (link.rows.length === 0) {
      throw new HttpError(403, "That student is not on your roster.");
    }

    const result = await pool.query(
      `INSERT INTO checkins (user_id, session_label)
       VALUES ($1, $2)
       RETURNING id, session_label, checked_in_at`,
      [student_id, label]
    );
    res.json({ checkin: result.rows[0] });
  })
);

router.get(
  "/summary",
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
          throw new HttpError(403, "You can only view your own check-ins.");
        }
        const link = await pool.query(
          "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
          [req.user!.userId, requested]
        );
        if (link.rows.length === 0) {
          throw new HttpError(403, "That student is not on your roster.");
        }
      }
      targetId = requested;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count_last_30_days FROM checkins
       WHERE user_id = $1 AND checked_in_at >= now() - interval '30 days'`,
      [targetId]
    );
    const recentResult = await pool.query(
      `SELECT id, session_label, checked_in_at FROM checkins
       WHERE user_id = $1
       ORDER BY checked_in_at DESC LIMIT 10`,
      [targetId]
    );
    res.json({
      count_last_30_days: countResult.rows[0].count_last_30_days,
      recent: recentResult.rows,
    });
  })
);

export default router;
