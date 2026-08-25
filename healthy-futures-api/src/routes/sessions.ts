import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, isUuid, HttpError } from "../middleware/errors";

const router = Router();

const MAX_TITLE = 160;
const MAX_LOCATION = 200;

// Students see their coach's schedule; a coach sees the one they own.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const coachId =
      req.user!.role === "coach" ? req.user!.userId : await coachOf(req.user!.userId);

    if (!coachId) {
      res.json({ sessions: [] });
      return;
    }

    const result = await pool.query(
      `SELECT s.id, s.title, s.location, s.starts_at, s.ends_at,
              COUNT(c.id)::int AS present_count,
              BOOL_OR(c.user_id = $2) AS viewer_present
       FROM sessions s
       LEFT JOIN checkins c ON c.session_id = s.id
       WHERE s.coach_id = $1
       GROUP BY s.id, s.title, s.location, s.starts_at, s.ends_at
       ORDER BY s.starts_at DESC`,
      [coachId, req.user!.userId]
    );

    res.json({
      sessions: result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        location: r.location,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        presentCount: r.present_count,
        viewerPresent: Boolean(r.viewer_present),
      })),
    });
  })
);

router.post(
  "/",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    const input = parseSessionInput(req.body);
    const result = await pool.query(
      `INSERT INTO sessions (coach_id, title, location, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, location, starts_at, ends_at`,
      [req.user!.userId, input.title, input.location, input.startsAt, input.endsAt]
    );
    res.json({ session: shape(result.rows[0]) });
  })
);

router.put(
  "/:id",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "Invalid session id.");
    const input = parseSessionInput(req.body);

    const result = await pool.query(
      `UPDATE sessions
       SET title = $3, location = $4, starts_at = $5, ends_at = $6
       WHERE id = $1 AND coach_id = $2
       RETURNING id, title, location, starts_at, ends_at`,
      [req.params.id, req.user!.userId, input.title, input.location, input.startsAt, input.endsAt]
    );
    if (result.rows.length === 0) {
      throw new HttpError(404, "Session not found.");
    }
    res.json({ session: shape(result.rows[0]) });
  })
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "Invalid session id.");
    const result = await pool.query(
      "DELETE FROM sessions WHERE id = $1 AND coach_id = $2 RETURNING id",
      [req.params.id, req.user!.userId]
    );
    if (result.rows.length === 0) {
      throw new HttpError(404, "Session not found.");
    }
    res.json({ deleted: result.rows[0].id });
  })
);

// The coach's attendance sheet for one session: every roster student, with
// whether they've been marked present.
router.get(
  "/:id/attendance",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "Invalid session id.");
    await assertOwnsSession(req.user!.userId, req.params.id);

    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, c.id IS NOT NULL AS present
       FROM coach_student_links l
       JOIN users u ON u.id = l.student_id
       LEFT JOIN checkins c ON c.user_id = u.id AND c.session_id = $2
       WHERE l.coach_id = $1
       ORDER BY u.full_name`,
      [req.user!.userId, req.params.id]
    );

    res.json({
      attendance: result.rows.map((r) => ({
        studentId: r.id,
        fullName: r.full_name,
        email: r.email,
        present: Boolean(r.present),
      })),
    });
  })
);

router.put(
  "/:id/attendance",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "Invalid session id.");
    const { student_id, present } = req.body || {};
    if (!isUuid(student_id)) throw new HttpError(400, "student_id must be a valid id.");
    if (typeof present !== "boolean") throw new HttpError(400, "present must be true or false.");

    const session = await assertOwnsSession(req.user!.userId, req.params.id);

    const link = await pool.query(
      "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
      [req.user!.userId, student_id]
    );
    if (link.rows.length === 0) {
      throw new HttpError(403, "That student is not on your roster.");
    }

    if (present) {
      // The unique index makes a repeat tap idempotent rather than an error.
      await pool.query(
        `INSERT INTO checkins (user_id, session_id, session_label, checked_in_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, session_id) WHERE session_id IS NOT NULL
         DO NOTHING`,
        [student_id, req.params.id, session.title, session.starts_at]
      );
    } else {
      await pool.query("DELETE FROM checkins WHERE user_id = $1 AND session_id = $2", [
        student_id,
        req.params.id,
      ]);
    }

    res.json({ studentId: student_id, present });
  })
);

async function assertOwnsSession(coachId: string, sessionId: string) {
  const result = await pool.query(
    "SELECT id, title, starts_at FROM sessions WHERE id = $1 AND coach_id = $2",
    [sessionId, coachId]
  );
  if (result.rows.length === 0) {
    throw new HttpError(404, "Session not found.");
  }
  return result.rows[0];
}

function parseSessionInput(body: unknown) {
  const src = (body ?? {}) as Record<string, unknown>;

  const title = String(src.title ?? "").trim();
  if (!title) throw new HttpError(400, "title is required.");
  if (title.length > MAX_TITLE) {
    throw new HttpError(400, `title must be ${MAX_TITLE} characters or fewer.`);
  }

  const location = src.location === undefined || src.location === null
    ? null
    : String(src.location).trim().slice(0, MAX_LOCATION) || null;

  const startsAt = parseDate(src.startsAt ?? src.starts_at, "startsAt");
  const endsAtRaw = src.endsAt ?? src.ends_at;
  const endsAt =
    endsAtRaw === undefined || endsAtRaw === null || endsAtRaw === ""
      ? null
      : parseDate(endsAtRaw, "endsAt");

  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new HttpError(400, "The session can't end before it starts.");
  }

  return { title, location, startsAt, endsAt };
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new HttpError(400, `${field} is required.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `${field} must be a valid date and time.`);
  }
  return parsed;
}

function shape(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    presentCount: 0,
    viewerPresent: false,
  };
}

async function coachOf(studentId: string): Promise<string | null> {
  const r = await pool.query(
    "SELECT coach_id FROM coach_student_links WHERE student_id = $1",
    [studentId]
  );
  return r.rows[0]?.coach_id ?? null;
}

export default router;
