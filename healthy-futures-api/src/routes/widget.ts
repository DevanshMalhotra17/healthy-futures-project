import { Router } from "express";
import { pool } from "../db/pool";
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

// ---------------------------------------------------------------------------
// The Health Score
// ---------------------------------------------------------------------------
// This is the single number the athlete sees on the Home tab. It used to be
// computed in HealthScoreCard.tsx, in JavaScript, from three calls the app made
// itself — which was fine while the app was the only thing that showed it. A
// home-screen widget and a watch app can't run the app's JavaScript, so the
// choice was to reimplement the formula in Swift and in the widget's own JS
// (three copies to keep in step) or to move it here. It moved here.
//
// The weights are unchanged from the app: PrimeFit 0.4, attendance 0.35, soccer
// activity 0.25, renormalised over whichever inputs exist.
export const WELLNESS_WEIGHTS = { primefit: 0.4, attendance: 0.35, soccer: 0.25 };

// Roughly 2 sessions/week is the program's expected pace (Cooper Field + WAC),
// so ~8 check-ins in 30 days is "full attendance". Mirrors the app's
// EXPECTED_CHECKINS_PER_30_DAYS.
const EXPECTED_CHECKINS_PER_30_DAYS = 8;

export type WellnessComponentKey = "primefit" | "attendance" | "soccer";

export type WellnessComponent = {
  key: WellnessComponentKey;
  label: string;
  value: number | null;
  weight: number;
};

export type Wellness = {
  score: number | null;
  band: Band | null;
  label: string;
  components: WellnessComponent[];
};

// The same three bands and the same wording the Home card uses, so the widget
// and the watch aren't inventing their own vocabulary.
function wellnessBand(score: number | null): Band | null {
  if (score === null) return null;
  if (score >= 75) return "green";
  if (score >= 50) return "amber";
  return "red";
}

function wellnessLabel(score: number | null): string {
  if (score === null) return "Nothing to show yet";
  if (score >= 75) return "Looking strong";
  if (score >= 50) return "Building momentum";
  return "Let's build this up together";
}

export async function loadWellness(userId: string): Promise<Wellness> {
  const [primefit, checkins] = await Promise.all([
    pool.query(
      `SELECT score FROM primefit_results
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    ),
    // A rolling 30-day window off now(), not a date subtraction, so this one is
    // timezone-independent by construction.
    pool.query(
      `SELECT COUNT(*)::int AS n FROM checkins
       WHERE user_id = $1 AND checked_in_at >= now() - interval '30 days'`,
      [userId]
    ),
  ]);

  const primefitScore =
    primefit.rows.length > 0 && primefit.rows[0].score !== null
      ? Number(primefit.rows[0].score)
      : null;

  // Zero check-ins is an answer, not a gap: the athlete has a record and it says
  // they haven't been in. So attendance always carries weight.
  const attendancePct = Math.min(
    100,
    Math.round(((checkins.rows[0]?.n ?? 0) / EXPECTED_CHECKINS_PER_30_DAYS) * 100)
  );

  // The app's third input is listTraceSessions(), which calls /trace/sessions —
  // a route this API has never mounted, so it 404s and the component has never
  // counted for anyone. Left in the shape rather than deleted: the weight and
  // the label are what the app used, so the day that data exists the widget and
  // the watch pick it up without a new field or a new build.
  const soccerValue: number | null = null;

  const components: WellnessComponent[] = [
    {
      key: "primefit",
      label: "PrimeFit",
      value: primefitScore,
      weight: WELLNESS_WEIGHTS.primefit,
    },
    {
      key: "attendance",
      label: "Attendance",
      value: attendancePct,
      weight: WELLNESS_WEIGHTS.attendance,
    },
    {
      key: "soccer",
      label: "Soccer activity",
      value: soccerValue,
      weight: WELLNESS_WEIGHTS.soccer,
    },
  ];

  // Renormalising over the inputs that exist means a missing PrimeFit result
  // stops counting rather than scoring zero — an athlete who hasn't taken the
  // quiz yet shouldn't be told they're doing badly.
  const present = components.filter((c) => c.value !== null);
  let score: number | null = null;
  if (present.length > 0) {
    const totalWeight = present.reduce((sum, c) => sum + c.weight, 0);
    score = Math.round(
      present.reduce((sum, c) => sum + (c.value as number) * c.weight, 0) / totalWeight
    );
  }

  return {
    score,
    band: wellnessBand(score),
    label: wellnessLabel(score),
    components,
  };
}

router.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;

    // A coach has no personal scorecard, so the widget shows nothing for them
    // rather than inventing numbers.
    if (req.user!.role !== "student") {
      res.json({ role: req.user!.role, scores: [], overall: null, wellness: null });
      return;
    }

    const [card, trends, wellness] = await Promise.all([
      buildCard(userId),
      loadTrends(userId, TREND_DAYS),
      loadWellness(userId),
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
      wellness,
      character_points: card.character_points ?? null,
      character_points_target: card.character_points_target ?? null,
      criteria_met: card.met_count ?? null,
      criteria_total: card.total ?? null,
    });
  })
);

// Just the Health Score. /summary runs the whole criteria card and a 14-day
// trend query; the home-screen widget only ever draws one number, and a widget
// that is slow gets killed by the OS rather than shown late. Two small queries
// instead of the full card is the difference between the widget rendering and
// the widget being a blank rectangle.
router.get(
  "/score",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "student") {
      res.json({ role: req.user!.role, wellness: null });
      return;
    }
    res.json({ role: "student", wellness: await loadWellness(req.user!.userId) });
  })
);

export default router;
