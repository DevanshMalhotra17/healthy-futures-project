import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errors";
import { getClient, isConfigured, MODEL } from "../services/anthropic";
import { logCompanionUse } from "../services/activity";

const router = Router();

export const MOODS = ["great", "good", "ok", "stressed", "tired", "down"] as const;
const MOOD_SET = new Set<string>(MOODS);
const MAX_NOTE = 500;

const SYSTEM = `You are the ZenFit check-in for a youth sports and wellness program.

A young athlete has just logged how they're feeling. Reply with 2-3 short sentences:
acknowledge what they said, then give one small, concrete thing they can do today
(a breathing exercise, a walk, an earlier bedtime, talking to their coach).

You are not a therapist or clinician. Never diagnose, never name a mental-health
condition, and never suggest medication. If they mention self-harm, hopelessness, or
being unsafe, gently and directly encourage them to talk to a trusted adult, their
coach, or a crisis line right away, and keep the reply brief and warm.

Be plain-spoken and encouraging. No emoji, no lists, no clinical language.`;

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, mood, energy, note, reply, created_at
       FROM zenfit_checkins
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 14`,
      [req.user!.userId]
    );

    const streak = await pool.query(
      `SELECT COUNT(*)::int AS c FROM zenfit_checkins
       WHERE user_id = $1 AND created_at >= now() - interval '7 days'`,
      [req.user!.userId]
    );

    res.json({
      checkins: result.rows,
      count_last_7_days: streak.rows[0].c,
    });
  })
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { mood, energy, note } = req.body || {};

    const moodValue = String(mood ?? "").trim().toLowerCase();
    if (!MOOD_SET.has(moodValue)) {
      throw new HttpError(400, `mood must be one of: ${MOODS.join(", ")}.`);
    }
    const energyValue = Number(energy);
    if (!Number.isInteger(energyValue) || energyValue < 1 || energyValue > 5) {
      throw new HttpError(400, "energy must be a whole number from 1 to 5.");
    }
    const noteValue = note === undefined || note === null ? null : String(note).trim() || null;
    if (noteValue && noteValue.length > MAX_NOTE) {
      throw new HttpError(400, `note must be ${MAX_NOTE} characters or fewer.`);
    }

    // The check-in is the product; the reply is a bonus. Record it either way so
    // an unconfigured or failing model never costs the user their entry.
    let reply: string | null = null;
    const client = getClient();
    if (client && isConfigured()) {
      try {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 400,
          system: SYSTEM,
          messages: [
            {
              role: "user",
              content:
                `Mood: ${moodValue}. Energy: ${energyValue}/5.` +
                (noteValue ? ` They added: "${noteValue}"` : ""),
            },
          ],
        });
        if (response.stop_reason !== "refusal") {
          reply =
            response.content
              .filter((b): b is { type: "text"; text: string; citations: null } =>
                b.type === "text"
              )
              .map((b) => b.text)
              .join("\n")
              .trim() || null;
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("ZenFit reply failed:", detail);
      }
    }

    const result = await pool.query(
      `INSERT INTO zenfit_checkins (user_id, mood, energy, note, reply)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, mood, energy, note, reply, created_at`,
      [req.user!.userId, moodValue, energyValue, noteValue, reply]
    );

    // Energy is 1-5; scale to 0-100 so the coach view can compare across companions.
    await logCompanionUse(req.user!.userId, "zenfit", {
      score: energyValue * 20,
      detail: `Feeling ${moodValue}, energy ${energyValue}/5`,
    });

    res.json({ checkin: result.rows[0] });
  })
);

export default router;
