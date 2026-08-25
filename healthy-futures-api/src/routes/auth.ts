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

export default router;
