import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errors";
import { buildCard, EFFORT_TARGET, SKILL_TARGET } from "./criteria";
import { loadTrends, CompanionKey, CompanionTrend } from "./trends";

const router = Router();

// One call, everything a home-screen widget shows. Widgets refresh on a budget
// iOS controls and get killed if they're slow, so three round trips (criteria,
// trends, derived day) is the wrong shape — this collapses them into one.

// Red / amber / green is decided here rather than in Swift so the thresholds
// live next to the scores they describe, and a tweak doesn't need an app update.
export type Band = "green" | "amber" | "red";

function band(value: number | null, target: number): Band | null {
  if (value === null) return null;
  if (value >= target) return "green";
  // Within 75% of target is "nearly there" rather than failing.
  if (value >= target * 0.75) return "amber";
  return "red";
}

const ATTENDANCE_TARGET = 90;
// Matches the Trends screen so the widget and the app never disagree.
const TREND_DAYS = 14;

router.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;

    // A coach has no personal scorecard, so the widget shows nothing for them
    // rather than inventing numbers.
    if (req.user!.role !== "student") {
      res.json({ role: req.user!.role, scores: [], overall: null });
      return;
    }

    const [card, trends] = await Promise.all([
      buildCard(userId),
      loadTrends(userId, TREND_DAYS),
    ]);

    const byCompanion = new Map<CompanionKey, CompanionTrend>(
      trends.map((t) => [t.companion, t])
    );
    const avgOf = (key: CompanionKey): number | null => {
      const avg = byCompanion.get(key)?.average;
      return typeof avg === "number" ? Math.round(avg) : null;
    };

    const scores = [
      {
        key: "nutrition",
        label: "Nutrition",
        value: avgOf("nutrition"),
        target: 70,
      },
      {
        key: "effort",
        label: "Effort",
        value: typeof card.effort_score === "number" ? card.effort_score : null,
        target: EFFORT_TARGET,
      },
      {
        key: "skill",
        label: "Skill",
        value: typeof card.skill_score === "number" ? card.skill_score : null,
        target: SKILL_TARGET,
      },
      {
        key: "zenfit",
        label: "Wellbeing",
        value: avgOf("zenfit"),
        target: 70,
      },
      {
        key: "attendance",
        label: "Attendance",
        value: typeof card.attendance_pct === "number" ? card.attendance_pct : null,
        target: ATTENDANCE_TARGET,
      },
    ].map((s) => ({ ...s, band: band(s.value, s.target) }));

    // The single colour the widget leads with: the worst band that has data, so
    // a red anywhere is visible without opening the app.
    const present = scores.filter((s) => s.band !== null).map((s) => s.band);
    const overall: Band | null = present.includes("red")
      ? "red"
      : present.includes("amber")
      ? "amber"
      : present.length > 0
      ? "green"
      : null;

    res.json({
      role: "student",
      overall,
      scores,
      character_points: card.character_points ?? null,
      character_points_target: card.character_points_target ?? null,
      criteria_met: card.met_count ?? null,
      criteria_total: card.total ?? null,
    });
  })
);

export default router;
