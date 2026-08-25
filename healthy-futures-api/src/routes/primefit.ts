import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/errors";

const router = Router();

const MAX_TEXT = 1000;

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { source, score, strongestArea, weakestArea, recommendation, summary } =
      req.body || {};

    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      throw new HttpError(400, "score must be a number between 0 and 100.");
    }
    const sourceLabel = String(source ?? "").trim() || "primefit-quiz";

    const text = (value: unknown): string | null => {
      if (value === undefined || value === null) return null;
      const s = String(value).trim();
      if (!s) return null;
      if (s.length > MAX_TEXT) {
        throw new HttpError(400, `Fields must be ${MAX_TEXT} characters or fewer.`);
      }
      return s;
    };

    const result = await pool.query(
      `INSERT INTO primefit_results
         (user_id, source, score, strongest_area, weakest_area, recommendation, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, source, score, strongest_area, weakest_area, recommendation, summary, created_at`,
      [
        req.user!.userId,
        sourceLabel,
        Math.round(numericScore),
        text(strongestArea),
        text(weakestArea),
        text(recommendation),
        text(summary),
      ]
    );

    const row = result.rows[0];
    res.json({
      success: true,
      record: {
        id: row.id,
        source: row.source,
        score: row.score,
        strongestArea: row.strongest_area,
        weakestArea: row.weakest_area,
        recommendation: row.recommendation,
        summary: row.summary,
        createdAt: row.created_at,
      },
    });
  })
);

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, source, score, strongest_area, weakest_area, recommendation, summary, created_at
       FROM primefit_results
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user!.userId]
    );
    res.json({
      results: result.rows.map((r) => ({
        id: r.id,
        source: r.source,
        score: r.score,
        strongestArea: r.strongest_area,
        weakestArea: r.weakest_area,
        recommendation: r.recommendation,
        summary: r.summary,
        createdAt: r.created_at,
      })),
    });
  })
);

export default router;
