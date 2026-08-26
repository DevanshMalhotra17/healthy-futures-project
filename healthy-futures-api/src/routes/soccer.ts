import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler, isUuid, HttpError } from "../middleware/errors";
import { logCompanionUse } from "../services/activity";

const router = Router();

const EMBEDDING_DIM = 512;
const MAX_SESSION_REF = 64;

// --- face enrolment ---------------------------------------------------------
// The embedding is computed on the device and posted here; the photo itself is
// never uploaded or stored. That keeps the raw biometric off our servers while
// still allowing matching.

router.get(
  "/face",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      "SELECT consent_by, consent_at, created_at FROM face_enrollments WHERE user_id = $1",
      [req.user!.userId]
    );
    res.json({
      enrolled: result.rows.length > 0,
      enrollment: result.rows[0] ?? null,
    });
  })
);

router.put(
  "/face",
  requireAuth,
  requireRole("student"),
  asyncHandler(async (req, res) => {
    const { embedding, consent_by } = req.body || {};

    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
      throw new HttpError(400, `embedding must be an array of ${EMBEDDING_DIM} numbers.`);
    }
    const vec = embedding.map((v) => Number(v));
    if (vec.some((v) => !Number.isFinite(v))) {
      throw new HttpError(400, "embedding must contain only finite numbers.");
    }

    // Consent is a hard requirement, not a checkbox we can default.
    const consent = String(consent_by ?? "").trim();
    if (!consent) {
      throw new HttpError(
        400,
        "consent_by is required — a parent or guardian must be named to enable face matching."
      );
    }
    if (consent.length > 120) {
      throw new HttpError(400, "consent_by must be 120 characters or fewer.");
    }

    await pool.query(
      `INSERT INTO face_enrollments (user_id, embedding, consent_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET embedding = $2, consent_by = $3, consent_at = now()`,
      [req.user!.userId, vec, consent]
    );

    res.json({ enrolled: true });
  })
);

router.delete(
  "/face",
  requireAuth,
  asyncHandler(async (req, res) => {
    await pool.query("DELETE FROM face_enrollments WHERE user_id = $1", [req.user!.userId]);
    res.json({ enrolled: false });
  })
);

// The face DB handed to the analyzer for one clip: only the coach's own roster,
// and only students who enrolled with consent.
router.get(
  "/face-db",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT f.user_id, f.embedding
       FROM face_enrollments f
       JOIN coach_student_links l ON l.student_id = f.user_id
       WHERE l.coach_id = $1`,
      [req.user!.userId]
    );
    res.json({
      faces: result.rows.map((r) => ({
        student_id: r.user_id,
        embedding: r.embedding,
      })),
    });
  })
);

// --- attributing a clip result to a student --------------------------------

router.post(
  "/results",
  requireAuth,
  requireRole("coach"),
  asyncHandler(async (req, res) => {
    const {
      student_id,
      session_ref,
      effort,
      distance_m,
      top_speed_ms,
      sprints,
      rank_in_clip,
      players_in_clip,
      identified_by,
    } = req.body || {};

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

    const effortValue = Number(effort);
    if (!Number.isFinite(effortValue) || effortValue < 0 || effortValue > 100) {
      throw new HttpError(400, "effort must be between 0 and 100.");
    }
    const ref = String(session_ref ?? "").trim();
    if (!ref || ref.length > MAX_SESSION_REF) {
      throw new HttpError(400, "session_ref is required.");
    }

    const num = (v: unknown): number | null => {
      if (v === undefined || v === null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const result = await pool.query(
      `INSERT INTO soccer_results
         (user_id, session_ref, effort, distance_m, top_speed_ms, sprints,
          rank_in_clip, players_in_clip, identified_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [
        student_id,
        ref,
        Math.round(effortValue),
        num(distance_m),
        num(top_speed_ms),
        num(sprints),
        num(rank_in_clip),
        num(players_in_clip),
        identified_by ? String(identified_by).slice(0, 20) : null,
      ]
    );

    const detail =
      rank_in_clip && players_in_clip
        ? `Ranked ${rank_in_clip} of ${players_in_clip}`
        : distance_m
        ? `${Math.round(Number(distance_m))}m covered`
        : null;
    await logCompanionUse(student_id, "soccer", { score: effortValue, detail });

    res.json({ id: result.rows[0].id, createdAt: result.rows[0].created_at });
  })
);

// A student's own soccer history; a coach may read their roster's.
router.get(
  "/results",
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
          throw new HttpError(403, "You can only view your own results.");
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

    const result = await pool.query(
      `SELECT id, session_ref, effort, distance_m, top_speed_ms, sprints,
              rank_in_clip, players_in_clip, identified_by, created_at
       FROM soccer_results
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [targetId]
    );
    res.json({ results: result.rows });
  })
);

export default router;
