import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { pool } from "../db/pool";
import { signToken, requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errors";
import { AI_EMAIL } from "./messages";

const router = Router();

// Basic shape check only — real deliverability is proven by a verification
// email, which this API does not send yet.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Addresses the system speaks as. Nobody may register these, or they would
// receive other users' assistant conversations.
const RESERVED_EMAILS = new Set([AI_EMAIL]);

const MAX_EMAIL = 254;
const MAX_NAME = 120;

function generateInviteCode(): string {
  // 6 chars, uppercase alphanumeric, unambiguous character set (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return code;
}

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
  const { email, password, fullName, role, inviteCode } = req.body || {};

  if (!email || !password || !fullName || !role) {
    throw new HttpError(400, "email, password, fullName, and role are required.");
  }
  if (role !== "coach" && role !== "student") {
    throw new HttpError(400, "role must be 'coach' or 'student'.");
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  if (normalizedEmail.length > MAX_EMAIL || !EMAIL_RE.test(normalizedEmail)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  if (RESERVED_EMAILS.has(normalizedEmail)) {
    throw new HttpError(400, "That email address isn't available.");
  }
  const name = String(fullName).trim();
  if (!name || name.length > MAX_NAME) {
    throw new HttpError(400, `Full name must be 1–${MAX_NAME} characters.`);
  }
  if (String(password).length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM users WHERE email = $1", [
      normalizedEmail,
    ]);
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    // Students must supply a valid coach invite code to sign up at all —
    // there is no "student with no coach" account creation path. This is
    // the enforcement point for "students shouldn't be able to do anything
    // coach-gated unless affiliated with a coach."
    let coachId: string | null = null;
    if (role === "student") {
      if (!inviteCode || !String(inviteCode).trim()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "A coach invite code is required to sign up as a student." });
      }
      const coachLookup = await client.query(
        "SELECT user_id FROM coach_profiles WHERE invite_code = $1",
        [String(inviteCode).trim().toUpperCase()]
      );
      if (coachLookup.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "That invite code doesn't match any coach." });
      }
      coachId = coachLookup.rows[0].user_id;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, role`,
      [normalizedEmail, passwordHash, name, role]
    );
    const user = userResult.rows[0];

    if (role === "coach") {
      let code = generateInviteCode();
      // Extremely unlikely, but guard against a collision anyway.
      for (let attempt = 0; attempt < 5; attempt++) {
        const clash = await client.query("SELECT 1 FROM coach_profiles WHERE invite_code = $1", [code]);
        if (clash.rows.length === 0) break;
        code = generateInviteCode();
      }
      await client.query("INSERT INTO coach_profiles (user_id, invite_code) VALUES ($1, $2)", [
        user.id,
        code,
      ]);
    } else if (role === "student" && coachId) {
      await client.query(
        "INSERT INTO coach_student_links (coach_id, student_id) VALUES ($1, $2)",
        [coachId, user.id]
      );
    }

    await client.query("COMMIT");

    const token = signToken({ userId: user.id, role: user.role });
    res.json({ token, user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      throw new HttpError(400, "email and password are required.");
    }

    const result = await pool.query(
      "SELECT id, email, password_hash, full_name, role FROM users WHERE email = $1",
      [String(email).toLowerCase().trim()]
    );
    if (result.rows.length === 0) {
      throw new HttpError(401, "Incorrect email or password.");
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) {
      throw new HttpError(401, "Incorrect email or password.");
    }

    const token = signToken({ userId: user.id, role: user.role });
    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      "SELECT id, email, full_name, role FROM users WHERE id = $1",
      [req.user!.userId]
    );
    if (result.rows.length === 0) {
      throw new HttpError(404, "User not found.");
    }
    const user = result.rows[0];

    // The coach's email is included because messaging is addressed by email —
    // without it a student has no way to open a thread with their coach.
    let coach: { id: string; fullName: string; email: string } | null = null;
    let inviteCode: string | null = null;

    if (user.role === "student") {
      const link = await pool.query(
        `SELECT u.id, u.full_name, u.email FROM coach_student_links l
         JOIN users u ON u.id = l.coach_id
         WHERE l.student_id = $1`,
        [user.id]
      );
      if (link.rows.length > 0) {
        coach = {
          id: link.rows[0].id,
          fullName: link.rows[0].full_name,
          email: link.rows[0].email,
        };
      }
    } else if (user.role === "coach") {
      const profile = await pool.query(
        "SELECT invite_code FROM coach_profiles WHERE user_id = $1",
        [user.id]
      );
      inviteCode = profile.rows[0]?.invite_code ?? null;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        coach,
        inviteCode,
      },
    });
  })
);

const RESET_TTL_MINUTES = 30;
const RESET_MIN_PASSWORD = 8;

function hashResetCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Step 1: ask for a code. The response is deliberately identical whether or not
// the email exists — otherwise this endpoint becomes a way to enumerate which
// students have accounts.
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const generic = {
      sent: true,
      message: "If that email has an account, a reset code is on its way.",
    };

    if (!email) {
      throw new HttpError(400, "Enter your email address.");
    }

    const { sendPasswordResetEmail, isEmailConfigured } = await import("../services/email");
    // Checked before the account lookup: if this depended on whether the email
    // exists, the differing status codes would reveal who has an account.
    if (!isEmailConfigured()) {
      throw new HttpError(
        503,
        "Password reset isn't available yet — ask your coach to help you get back in."
      );
    }

    const found = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
    const user = found.rows[0];
    if (!user) {
      res.json(generic);
      return;
    }

    // 6 digits is enough given the 30-minute expiry, single use, and rate limit
    // on this route; it's also short enough to read off a phone screen.
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);

    // Any earlier code for this user stops working the moment a new one is asked
    // for, so a leaked older email can't be used later.
    await pool.query("DELETE FROM password_resets WHERE user_id = $1", [user.id]);
    await pool.query(
      "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [hashResetCode(code), user.id, expiresAt]
    );

    const result = await sendPasswordResetEmail(email, code, RESET_TTL_MINUTES);
    if (!result.ok) {
      console.error("Password reset email failed:", result.error);
      throw new HttpError(502, "Couldn't send the reset email. Try again in a minute.");
    }

    res.json(generic);
  })
);

// Step 2: redeem the code and set a new password.
router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !code) {
      throw new HttpError(400, "Enter your email and the code from your email.");
    }
    if (password.length < RESET_MIN_PASSWORD) {
      throw new HttpError(400, `Password must be at least ${RESET_MIN_PASSWORD} characters.`);
    }

    const match = await pool.query(
      `SELECT r.token_hash, r.user_id, r.expires_at
       FROM password_resets r
       JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = $1 AND lower(u.email) = $2`,
      [hashResetCode(code), email]
    );
    const row = match.rows[0];
    // Same message for a wrong code and an unknown email, so neither can be
    // probed independently.
    if (!row) {
      throw new HttpError(400, "That code isn't valid. Request a new one.");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await pool.query("DELETE FROM password_resets WHERE token_hash = $1", [row.token_hash]);
      throw new HttpError(400, "That code has expired. Request a new one.");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        passwordHash,
        row.user_id,
      ]);
      // Single use.
      await client.query("DELETE FROM password_resets WHERE user_id = $1", [row.user_id]);
      // Whoever knew the old password loses their sessions too.
      await client.query("DELETE FROM push_tokens WHERE user_id = $1", [row.user_id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({ reset: true });
  })
);

// Permanent account deletion. Apple requires any app offering sign-up to offer
// in-app deletion too, and for minors' data it is the right default regardless.
// Most tables cascade from users(id), but two things do not: direct_messages is
// keyed by email with no FK, and practice clips exist as files on disk.
router.delete(
  "/account",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { password } = req.body ?? {};
    if (typeof password !== "string" || !password) {
      throw new HttpError(400, "Enter your password to confirm deletion.");
    }

    const found = await pool.query(
      "SELECT email, password_hash FROM users WHERE id = $1",
      [req.user!.userId]
    );
    const user = found.rows[0];
    if (!user) {
      throw new HttpError(404, "That account no longer exists.");
    }

    // Re-authenticate: a stolen token alone should not be enough to erase data.
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      throw new HttpError(403, "That password doesn't match.");
    }

    // Collect filenames before the rows cascade away.
    const clips = await pool.query(
      "SELECT filename FROM practice_videos WHERE user_id = $1",
      [req.user!.userId]
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Not FK-linked, so the cascade won't reach these.
      await client.query(
        "DELETE FROM direct_messages WHERE sender_email = $1 OR receiver_email = $1",
        [user.email]
      );
      // Everything else cascades from this single row.
      await client.query("DELETE FROM users WHERE id = $1", [req.user!.userId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // Files last: the rows are already gone, so a failure here leaves orphans
    // for the retention sweep to collect rather than broken references.
    if (clips.rowCount) {
      const { unlinkStoredVideo } = await import("./videos");
      for (const row of clips.rows) {
        await unlinkStoredVideo(row.filename as string);
      }
    }

    res.json({ deleted: true });
  })
);

export default router;
