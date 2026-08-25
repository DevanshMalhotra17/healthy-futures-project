import { pool } from "../db/pool";

export type Companion = "nutrition" | "primefit" | "zenfit" | "soccer";

// Activity logging is observability, not the user's work product. A failure here
// must never fail the companion request that triggered it.
export async function logCompanionUse(
  userId: string,
  companion: Companion,
  opts: { score?: number | null; detail?: string | null } = {}
): Promise<void> {
  try {
    const score =
      opts.score === undefined || opts.score === null || !Number.isFinite(opts.score)
        ? null
        : Math.max(0, Math.min(100, Math.round(opts.score)));

    await pool.query(
      `INSERT INTO companion_activity (user_id, companion, score, detail)
       VALUES ($1, $2, $3, $4)`,
      [userId, companion, score, opts.detail?.slice(0, 300) ?? null]
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Companion activity log failed:", detail);
  }
}
