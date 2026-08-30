import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errors";
import { runForUser } from "../services/nudgeRunner";
import { MAX_PER_DAY } from "../services/nudges";

const router = Router();

// Register (or re-register) this device for push. Called on every app launch, so
// it must be idempotent.
router.post(
  "/register",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { token, platform } = req.body ?? {};
    if (typeof token !== "string" || !token.startsWith("ExponentPushToken")) {
      throw new HttpError(400, "A valid Expo push token is required.");
    }

    await pool.query(
      `INSERT INTO push_tokens (token, user_id, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET user_id = $2, platform = $3, updated_at = now()`,
      [token, req.user!.userId, typeof platform === "string" ? platform : null]
    );

    res.json({ registered: true });
  })
);

// Called on logout so a shared phone stops receiving the previous user's nudges.
router.post(
  "/unregister",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { token } = req.body ?? {};
    if (typeof token !== "string") {
      throw new HttpError(400, "A token is required.");
    }
    await pool.query(`DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`, [
      token,
      req.user!.userId,
    ]);
    res.json({ unregistered: true });
  })
);

router.get(
  "/prefs",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT enabled, quiet_start, quiet_end FROM nudge_prefs WHERE user_id = $1`,
      [req.user!.userId]
    );
    res.json({
      prefs: result.rows[0] ?? { enabled: true, quiet_start: 21, quiet_end: 7 },
      maxPerDay: MAX_PER_DAY,
    });
  })
);

router.put(
  "/prefs",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { enabled, quiet_start, quiet_end } = req.body ?? {};

    const hour = (value: unknown, fallback: number): number => {
      if (value === undefined || value === null) return fallback;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 23) {
        throw new HttpError(400, "Quiet hours must be whole numbers from 0 to 23.");
      }
      return n;
    };

    const start = hour(quiet_start, 21);
    const end = hour(quiet_end, 7);
    const on = enabled === undefined ? true : Boolean(enabled);

    await pool.query(
      `INSERT INTO nudge_prefs (user_id, enabled, quiet_start, quiet_end)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET enabled = $2, quiet_start = $3, quiet_end = $4, updated_at = now()`,
      [req.user!.userId, on, start, end]
    );

    res.json({ prefs: { enabled: on, quiet_start: start, quiet_end: end } });
  })
);

// What was sent today, and what the engine would send right now. Useful during
// the pilot to see whether the cadence feels right before students complain.
router.get(
  "/today",
  requireAuth,
  asyncHandler(async (req, res) => {
    const sent = await pool.query(
      `SELECT kind, title, body, screen, params, sent_at, opened_at
       FROM nudge_log
       WHERE user_id = $1 AND sent_at >= date_trunc('day', now())
       ORDER BY sent_at DESC`,
      [req.user!.userId]
    );
    const next = await runForUser(req.user!.userId, true);
    res.json({
      sent: sent.rows,
      remaining: Math.max(0, MAX_PER_DAY - (sent.rowCount ?? 0)),
      wouldSendNow: next,
    });
  })
);

// Marks a nudge as opened, so we can tell which wording actually pulls students
// back in rather than guessing.
router.post(
  "/opened",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { kind } = req.body ?? {};
    if (typeof kind !== "string" || !kind) {
      throw new HttpError(400, "A nudge kind is required.");
    }
    await pool.query(
      `UPDATE nudge_log SET opened_at = now()
       WHERE user_id = $1 AND kind = $2 AND opened_at IS NULL
         AND sent_at >= now() - INTERVAL '2 days'`,
      [req.user!.userId, kind]
    );
    res.json({ recorded: true });
  })
);

export default router;
