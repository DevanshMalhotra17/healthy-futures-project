import { Router } from "express";
import { pool } from "../db/pool";
import multer from "multer";
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


// Schedule photo import. The image is held in memory only — never written to
// disk — since it can contain other students' names and we have no reason to
// keep it once the sessions are extracted.
const scheduleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_MIME.has(file.mimetype)) {
      (req as unknown as { rejectedMime?: string }).rejectedMime = file.mimetype;
      cb(null, false);
      return;
    }
    cb(null, true);
  },
});

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Returns candidate sessions for the coach to confirm. Deliberately does NOT
// write anything: a misread time would send students to practice at the wrong
// hour, so a human approves the list first.
router.post(
  "/import-photo",
  requireAuth,
  requireRole("coach"),
  scheduleUpload.single("image"),
  asyncHandler(async (req, res) => {
    if ((req as unknown as { rejectedMime?: string }).rejectedMime) {
      throw new HttpError(400, "Send a JPEG, PNG, WEBP or GIF image.");
    }
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      throw new HttpError(400, "Attach the schedule photo as the 'image' field.");
    }

    // The coach's own local date, so weekday names resolve the way they expect.
    const reference =
      typeof req.body?.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.today)
        ? req.body.today
        : new Date().toISOString().slice(0, 10);

    const { extractSchedule } = await import("../services/scheduleImport");
    try {
      const result = await extractSchedule(
        file.buffer.toString("base64"),
        file.mimetype as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        reference
      );
      res.json(result);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("Schedule import failed:", detail);
      throw new HttpError(502, "Couldn't read that schedule. Try a clearer photo.");
    }
  })
);

router.post(
  "/",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    const input = parseSessionInput(req.body);
    const occurrences = expandRepeats(
      input,
      req.body?.repeat,
      req.body?.repeatCount
    );

    // Each occurrence is a real row so a coach can edit or cancel one week
    // without touching the rest of the series.
    const created = [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const occ of occurrences) {
        const result = await client.query(
          `INSERT INTO sessions (coach_id, title, location, starts_at, ends_at)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, title, location, starts_at, ends_at`,
          [req.user!.userId, input.title, input.location, occ.startsAt, occ.endsAt]
        );
        created.push(shape(result.rows[0]));
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // `session` stays for older clients; `sessions` carries the whole series.
    res.json({ session: created[0], sessions: created, created: created.length });
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
      `SELECT u.id, u.full_name, u.email, c.status
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
        // "absent" is the absence of a row, so null maps to absent.
        status: (r.status as "present" | "excused" | null) ?? "absent",
        // Kept so an already-installed build still renders something sensible.
        present: r.status === "present",
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
    const { student_id, present, status } = req.body || {};
    if (!isUuid(student_id)) throw new HttpError(400, "student_id must be a valid id.");

    // `status` is the current contract; `present` is still accepted so an older
    // installed build keeps working after this deploy.
    const nextStatus: "present" | "absent" | "excused" =
      status === "present" || status === "absent" || status === "excused"
        ? status
        : typeof present === "boolean"
        ? present
          ? "present"
          : "absent"
        : (() => {
            throw new HttpError(400, "status must be present, absent or excused.");
          })();

    const session = await assertOwnsSession(req.user!.userId, req.params.id);

    const link = await pool.query(
      "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
      [req.user!.userId, student_id]
    );
    if (link.rows.length === 0) {
      throw new HttpError(403, "That student is not on your roster.");
    }

    if (nextStatus === "absent") {
      // Absent is represented by having no row at all.
      await pool.query("DELETE FROM checkins WHERE user_id = $1 AND session_id = $2", [
        student_id,
        req.params.id,
      ]);
    } else {
      // The unique index makes a repeat tap idempotent, and DO UPDATE lets a coach
      // switch between present and excused without deleting first.
      await pool.query(
        `INSERT INTO checkins (user_id, session_id, session_label, checked_in_at, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, session_id) WHERE session_id IS NOT NULL
         DO UPDATE SET status = $5`,
        [student_id, req.params.id, session.title, session.starts_at, nextStatus]
      );
    }

    res.json({
      studentId: student_id,
      status: nextStatus,
      present: nextStatus === "present",
    });
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


type Repeat = "none" | "weekly" | "biweekly" | "monthly";

const MAX_OCCURRENCES = 52;

// Turns one session plus a repeat rule into the list of dates to create.
function expandRepeats(
  input: { startsAt: Date; endsAt: Date | null },
  repeat: unknown,
  repeatCount: unknown
): { startsAt: Date; endsAt: Date | null }[] {
  const rule: Repeat =
    repeat === "weekly" || repeat === "biweekly" || repeat === "monthly" ? repeat : "none";
  if (rule === "none") {
    return [{ startsAt: input.startsAt, endsAt: input.endsAt }];
  }

  const requested = Number(repeatCount);
  const count = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), MAX_OCCURRENCES)
    : 8;

  const start = new Date(input.startsAt);
  const end = input.endsAt ? new Date(input.endsAt) : null;
  const durationMs = end ? end.getTime() - start.getTime() : null;

  const out: { startsAt: Date; endsAt: Date | null }[] = [];
  for (let i = 0; i < count; i++) {
    const s = new Date(start);
    if (rule === "weekly") {
      s.setDate(s.getDate() + 7 * i);
    } else if (rule === "biweekly") {
      s.setDate(s.getDate() + 14 * i);
    } else {
      // setMonth overflows rather than clamping: Jan 31 + 1 month lands in March.
      // Pin to day 1, advance the month, then clamp the day to that month's last.
      const targetDay = start.getDate();
      s.setDate(1);
      s.setMonth(start.getMonth() + i);
      const lastDay = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
      s.setDate(Math.min(targetDay, lastDay));
    }

    out.push({
      startsAt: s,
      endsAt: durationMs !== null ? new Date(s.getTime() + durationMs) : null,
    });
  }
  return out;
}

export default router;
