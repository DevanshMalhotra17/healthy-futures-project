import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errors";

const router = Router();

export const AI_EMAIL = "assistant@healthyfutures.app";

const MAX_CONTENT = 4000;

router.get(
  "/threads",
  requireAuth,
  asyncHandler(async (req, res) => {
    const email = await emailForUser(req.user!.userId);
    if (!email) throw new HttpError(404, "User not found.");

    const result = await pool.query(
      `SELECT
         CASE WHEN sender_email = $1 THEN receiver_email ELSE sender_email END AS with_email,
         MAX(created_at) AS last_at,
         (array_agg(content ORDER BY created_at DESC))[1] AS last_content,
         COUNT(*) FILTER (WHERE receiver_email = $1 AND read = false)::int AS unread_count
       FROM direct_messages
       WHERE sender_email = $1 OR receiver_email = $1
       GROUP BY with_email
       ORDER BY last_at DESC`,
      [email]
    );
    res.json({ threads: result.rows });
  })
);

router.get(
  "/thread",
  requireAuth,
  asyncHandler(async (req, res) => {
    const withEmail = req.query.with;
    if (typeof withEmail !== "string" || !withEmail.trim()) {
      throw new HttpError(400, "Query param 'with' is required.");
    }

    const email = await emailForUser(req.user!.userId);
    if (!email) throw new HttpError(404, "User not found.");

    await pool.query(
      `UPDATE direct_messages SET read = true
       WHERE receiver_email = $1 AND sender_email = $2 AND read = false`,
      [email, withEmail]
    );

    const result = await pool.query(
      `SELECT id, sender_email, receiver_email, content, read, created_at
       FROM direct_messages
       WHERE (sender_email = $1 AND receiver_email = $2)
          OR (sender_email = $2 AND receiver_email = $1)
       ORDER BY created_at ASC
       LIMIT 200`,
      [email, withEmail]
    );
    res.json({ messages: result.rows });
  })
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { content, to } = req.body || {};
    const body = String(content ?? "").trim();
    if (!body) {
      throw new HttpError(400, "content is required.");
    }
    if (body.length > MAX_CONTENT) {
      throw new HttpError(400, `Message must be ${MAX_CONTENT} characters or fewer.`);
    }
    if (to !== undefined && to !== null && typeof to !== "string") {
      throw new HttpError(400, "'to' must be an email address.");
    }

    const senderEmail = await emailForUser(req.user!.userId);
    if (!senderEmail) throw new HttpError(404, "User not found.");

    let receiverEmail: string | undefined = (to as string | undefined)?.trim() || undefined;
    if (!receiverEmail) {
      receiverEmail = (await defaultRecipient(req.user!.userId, req.user!.role)) ?? undefined;
      if (!receiverEmail) {
        throw new HttpError(400, "Could not determine recipient. Please provide 'to'.");
      }
    }

    const allowed = await canMessage(req.user!.userId, req.user!.role, receiverEmail);
    if (!allowed) {
      throw new HttpError(
        403,
        "You can only message the assistant or someone you're linked with."
      );
    }

    const result = await pool.query(
      `INSERT INTO direct_messages (sender_email, receiver_email, content)
       VALUES ($1, $2, $3)
       RETURNING id, sender_email, receiver_email, content, read, created_at`,
      [senderEmail, receiverEmail, body]
    );
    const message = result.rows[0];

    if (receiverEmail === AI_EMAIL) {
      // A failure here must not lose the user's own message, which is already
      // committed — so the assistant reply is best-effort.
      try {
        const { generateAiReply } = await import("../services/ai");
        const reply = await generateAiReply(senderEmail, req.user!.role, body);
        await pool.query(
          `INSERT INTO direct_messages (sender_email, receiver_email, content)
           VALUES ($1, $2, $3)`,
          [AI_EMAIL, senderEmail, reply]
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("Assistant reply failed:", detail);
        await pool
          .query(
            `INSERT INTO direct_messages (sender_email, receiver_email, content)
             VALUES ($1, $2, $3)`,
            [
              AI_EMAIL,
              senderEmail,
              "Sorry — I couldn't process that just now. Please try again.",
            ]
          )
          .catch(() => undefined);
      }
    }

    res.json({ message });
  })
);

// Messaging is limited to the AI assistant and the sender's own coach/student
// links, so no one can cold-DM an arbitrary account in the system.
async function canMessage(
  userId: string,
  role: string,
  receiverEmail: string
): Promise<boolean> {
  if (receiverEmail === AI_EMAIL) return true;

  const sql =
    role === "coach"
      ? `SELECT 1 FROM coach_student_links l
         JOIN users u ON u.id = l.student_id
         WHERE l.coach_id = $1 AND u.email = $2`
      : `SELECT 1 FROM coach_student_links l
         JOIN users u ON u.id = l.coach_id
         WHERE l.student_id = $1 AND u.email = $2`;
  const r = await pool.query(sql, [userId, receiverEmail]);
  return r.rows.length > 0;
}

async function emailForUser(userId: string): Promise<string | null> {
  const r = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
  return r.rows[0]?.email ?? null;
}

async function defaultRecipient(userId: string, role: string): Promise<string | null> {
  if (role === "student") {
    const r = await pool.query(
      `SELECT u.email FROM coach_student_links l
       JOIN users u ON u.id = l.coach_id
       WHERE l.student_id = $1`,
      [userId]
    );
    return r.rows[0]?.email ?? null;
  }
  return null;
}

export default router;
