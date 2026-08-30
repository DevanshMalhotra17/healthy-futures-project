import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, isUuid, HttpError } from "../middleware/errors";

const router = Router();

const MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED_MIME = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);

// Kept outside the source tree so a redeploy can't wipe uploads and so the
// files are never reachable as static assets — playback goes through the
// auth-gated stream route below.
const STORAGE_DIR = path.resolve(
  process.env.VIDEO_STORAGE_DIR || path.join(process.cwd(), "..", "video-storage")
);

fs.mkdirSync(STORAGE_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORAGE_DIR),
    filename: (_req, file, cb) => {
      // Random name: a student-supplied name could collide or contain traversal.
      const ext = ALLOWED_MIME.has(file.mimetype) && file.mimetype === "video/quicktime" ? ".mov" : ".mp4";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    // Rejecting via an error here makes multer tear down the request mid-body,
    // which the client sees as a dropped connection rather than a 400. Instead
    // flag it and let the route handler answer properly.
    if (!ALLOWED_MIME.has(file.mimetype)) {
      (req as unknown as { rejectedMime?: string }).rejectedMime = file.mimetype;
      cb(null, false);
      return;
    }
    cb(null, true);
  },
});

// Guards against a crafted filename escaping the storage directory.
function resolveStoredPath(filename: string): string {
  const full = path.resolve(STORAGE_DIR, filename);
  if (path.dirname(full) !== STORAGE_DIR) {
    throw new HttpError(400, "Invalid file reference.");
  }
  return full;
}

// Students only: a coach has no reason to upload a practice clip of themselves.
router.post(
  "/",
  requireAuth,
  upload.single("video"),
  asyncHandler(async (req, res) => {
    const rejectedMime = (req as unknown as { rejectedMime?: string }).rejectedMime;
    if (rejectedMime) {
      throw new HttpError(400, "Only MP4 or MOV clips can be sent.");
    }

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      throw new HttpError(400, "Attach a clip as the 'video' field.");
    }

    if (req.user!.role !== "student") {
      // The file is already on disk at this point, so clean up before rejecting.
      await fs.promises.unlink(file.path).catch(() => undefined);
      throw new HttpError(403, "Only students can send practice clips.");
    }

    const caption =
      typeof req.body?.caption === "string" && req.body.caption.trim()
        ? req.body.caption.trim().slice(0, 300)
        : null;

    const result = await pool.query(
      `INSERT INTO practice_videos (user_id, filename, caption, byte_size, mime_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, caption, byte_size, mime_type, created_at`,
      [req.user!.userId, file.filename, caption, file.size, file.mimetype]
    );

    const row = result.rows[0];
    res.status(201).json({
      video: {
        id: row.id,
        caption: row.caption,
        created_at: row.created_at,
        byte_size: Number(row.byte_size),
        streamPath: `/videos/${row.id}/stream`,
      },
    });
  })
);

// A student sees their own clips; a coach sees one roster student's clips via
// ?student_id=. Anything else is refused rather than silently returning nothing.
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const studentId = (req.query.student_id as string | undefined)?.trim();
    let targetId = req.user!.userId;

    if (studentId) {
      if (!isUuid(studentId)) {
        throw new HttpError(400, "student_id must be a valid id.");
      }
      if (studentId !== req.user!.userId) {
        if (req.user!.role !== "coach") {
          throw new HttpError(403, "You can only see your own clips.");
        }
        const linked = await pool.query(
          "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
          [req.user!.userId, studentId]
        );
        if (linked.rowCount === 0) {
          throw new HttpError(403, "That student isn't on your roster.");
        }
      }
      targetId = studentId;
    }

    const result = await pool.query(
      `SELECT v.id, v.caption, v.byte_size, v.created_at, v.viewed_at, u.full_name
       FROM practice_videos v
       JOIN users u ON u.id = v.user_id
       WHERE v.user_id = $1
       ORDER BY v.created_at DESC
       LIMIT 50`,
      [targetId]
    );

    res.json({
      videos: result.rows.map((r) => ({
        id: r.id,
        caption: r.caption,
        created_at: r.created_at,
        viewed_at: r.viewed_at,
        byte_size: Number(r.byte_size),
        student_name: r.full_name,
        streamPath: `/videos/${r.id}/stream`,
      })),
    });
  })
);

// Everything a coach hasn't watched yet, across their whole roster. This is what
// makes "they'll see it in Messages" actually true.
router.get(
  "/inbox",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "coach") {
      throw new HttpError(403, "Coaches only.");
    }

    const result = await pool.query(
      `SELECT v.id, v.caption, v.byte_size, v.created_at, v.viewed_at,
              u.id AS student_id, u.full_name
       FROM practice_videos v
       JOIN users u ON u.id = v.user_id
       JOIN coach_student_links l ON l.student_id = v.user_id
       WHERE l.coach_id = $1
       ORDER BY v.viewed_at IS NOT NULL, v.created_at DESC
       LIMIT 100`,
      [req.user!.userId]
    );

    res.json({
      videos: result.rows.map((r) => ({
        id: r.id,
        caption: r.caption,
        created_at: r.created_at,
        viewed_at: r.viewed_at,
        byte_size: Number(r.byte_size),
        student_id: r.student_id,
        student_name: r.full_name,
        streamPath: `/videos/${r.id}/stream`,
      })),
      unwatched: result.rows.filter((r) => !r.viewed_at).length,
    });
  })
);

// Playback. Supports Range so the player can seek instead of buffering the whole
// file, which matters on a phone over cellular.
router.get(
  "/:id/stream",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) {
      throw new HttpError(400, "Invalid video id.");
    }

    const result = await pool.query(
      "SELECT user_id, filename, mime_type FROM practice_videos WHERE id = $1",
      [id]
    );
    const video = result.rows[0];
    if (!video) {
      throw new HttpError(404, "That clip no longer exists.");
    }

    if (video.user_id !== req.user!.userId) {
      if (req.user!.role !== "coach") {
        throw new HttpError(403, "You can't view that clip.");
      }
      const linked = await pool.query(
        "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
        [req.user!.userId, video.user_id]
      );
      if (linked.rowCount === 0) {
        throw new HttpError(403, "You can't view that clip.");
      }
      // Only a coach viewing marks it watched, and only once.
      await pool
        .query(
          "UPDATE practice_videos SET viewed_at = now() WHERE id = $1 AND viewed_at IS NULL",
          [id]
        )
        .catch(() => undefined);
    }

    const filePath = resolveStoredPath(video.filename);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      throw new HttpError(410, "That clip's file is no longer on the server.");
    }

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (Number.isNaN(start) || start >= stat.size || end >= stat.size || start > end) {
        res.status(416).set("Content-Range", `bytes */${stat.size}`).end();
        return;
      }
      res.status(206).set({
        "Content-Type": video.mime_type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.set({
      "Content-Type": video.mime_type,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(res);
  })
);

// A student can withdraw a clip; a coach can clear one off their roster feed.
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) {
      throw new HttpError(400, "Invalid video id.");
    }

    const result = await pool.query(
      "SELECT user_id, filename FROM practice_videos WHERE id = $1",
      [id]
    );
    const video = result.rows[0];
    if (!video) {
      throw new HttpError(404, "That clip no longer exists.");
    }

    if (video.user_id !== req.user!.userId) {
      if (req.user!.role !== "coach") {
        throw new HttpError(403, "You can't delete that clip.");
      }
      const linked = await pool.query(
        "SELECT 1 FROM coach_student_links WHERE coach_id = $1 AND student_id = $2",
        [req.user!.userId, video.user_id]
      );
      if (linked.rowCount === 0) {
        throw new HttpError(403, "You can't delete that clip.");
      }
    }

    await pool.query("DELETE FROM practice_videos WHERE id = $1", [id]);
    // Row first, file second: an orphaned file is recoverable, a row pointing at
    // a missing file is a broken player.
    await fs.promises
      .unlink(resolveStoredPath(video.filename))
      .catch(() => undefined);

    res.json({ deleted: true });
  })
);

// Removes one stored clip from disk. Used by account deletion, where the rows
// are already gone via cascade and only the files remain.
export async function unlinkStoredVideo(filename: string): Promise<void> {
  try {
    await fs.promises.unlink(resolveStoredPath(filename));
  } catch {
    // Already gone, or outside the storage dir — nothing to do.
  }
}

// Deletes clips past the retention window, file and row together. These are
// videos of minors, so they should not sit on disk indefinitely just because
// nobody got round to clearing them.
export async function purgeExpiredVideos(): Promise<number> {
  const days = Number(process.env.VIDEO_RETENTION_DAYS ?? 90);
  if (!Number.isFinite(days) || days <= 0) return 0;

  // Row is removed first so an interrupted purge can't leave a row pointing at a
  // deleted file; a leftover file is swept on the next pass by the orphan check.
  const expired = await pool.query(
    `DELETE FROM practice_videos
     WHERE created_at < now() - ($1 || ' days')::interval
     RETURNING filename`,
    [String(Math.floor(days))]
  );

  for (const row of expired.rows) {
    try {
      await fs.promises.unlink(resolveStoredPath(row.filename as string));
    } catch {
      // Already gone, or outside the storage dir — nothing to do.
    }
  }

  // Files with no surviving row (from an earlier interrupted purge or a failed
  // upload) would otherwise accumulate silently.
  try {
    const onDisk = await fs.promises.readdir(STORAGE_DIR);
    if (onDisk.length > 0) {
      const known = await pool.query("SELECT filename FROM practice_videos");
      const keep = new Set(known.rows.map((r) => r.filename as string));
      for (const name of onDisk) {
        if (keep.has(name)) continue;
        const full = path.join(STORAGE_DIR, name);
        const stat = await fs.promises.stat(full).catch(() => null);
        // Only sweep files older than a day, so an upload in flight is safe.
        if (stat && Date.now() - stat.mtimeMs > 86_400_000) {
          await fs.promises.unlink(full).catch(() => undefined);
        }
      }
    }
  } catch {
    // Storage dir unreadable; the next pass will retry.
  }

  return expired.rowCount ?? 0;
}

export default router;
