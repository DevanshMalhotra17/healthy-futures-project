import { pool } from "../db/pool";

// Where a nudge lands when tapped. Screen names match RootTabParamList in the
// app, so a nudge about a companion opens that companion, not a generic tab.
export type NudgeTarget =
  | { screen: "Routine"; params?: { focus?: string } }
  | { screen: "Companions"; params?: { open?: "soccer" | "nutrition" | "primefit" | "zenfit" } }
  | { screen: "Schedule" }
  | { screen: "Messages" }
  | { screen: "Home" };

export type Nudge = {
  kind: string;
  title: string;
  body: string;
  target: NudgeTarget;
  // Higher wins when more nudges are eligible than the cap allows.
  priority: number;
};

export const MAX_PER_DAY = 10;
// Minimum gap between two nudges, so a burst of eligible rules doesn't arrive
// as a stack of notifications.
export const MIN_GAP_MINUTES = 45;
// A session is sacred: nothing fires from this long before it starts until it
// ends. This is the rule that keeps a buzz out of the middle of a drill.
const SESSION_QUIET_BEFORE_MIN = 10;

type DayLog = Record<string, boolean>;

export type NudgeContext = {
  userId: string;
  hour: number;
  today: DayLog;
  yesterday: DayLog;
  streakDays: number;
  fitnessDaysThisWeek: number;
  attendancePct: number | null;
  criteriaMetCount: number;
  daysSinceLastLog: number | null;
  daysSinceNutrition: number | null;
  lastNutritionScore: number | null;
  minutesToNextSession: number | null;
  minutesSinceSessionEnd: number | null;
  newSoccerResult: boolean;
  consecutiveShortSleep: number;
  // Companion score trends, so a nudge can react to a slide before it becomes a
  // habit rather than only to a single bad score.
  decliningCompanion: { companion: string; changePct: number } | null;
  improvingCompanion: { companion: string; changePct: number } | null;
};

const FITNESS = ["active_play", "ball_control", "touches", "stretch"] as const;

function fitnessDone(day: DayLog): number {
  return FITNESS.filter((f) => day[f]).length;
}

// Every rule that can fire. Ordering here doesn't matter; `priority` decides.
export function evaluate(ctx: NudgeContext): Nudge[] {
  const out: Nudge[] = [];
  const t = ctx.today;
  const add = (n: Nudge) => out.push(n);

  // ---- Session-anchored: highest value because they're time-critical -------
  if (ctx.minutesToNextSession !== null) {
    const m = ctx.minutesToNextSession;
    if (m > 80 && m <= 100) {
      add({
        kind: "pre_session_fuel",
        title: "Practice soon",
        body: "Eat something now, not fifteen minutes before you start.",
        target: { screen: "Schedule" },
        priority: 90,
      });
    }
    if (m > 50 && m <= 70 && !t.water) {
      add({
        kind: "pre_session_water",
        title: "Water before you go",
        body: "You can't catch up on hydration once you're out there.",
        target: { screen: "Routine", params: { focus: "water" } },
        priority: 95,
      });
    }
    if (m > 20 && m <= 35) {
      add({
        kind: "pre_session_bottle",
        title: "Grab your bottle",
        body: "See you out there.",
        target: { screen: "Schedule" },
        priority: 70,
      });
    }
  }

  if (ctx.minutesSinceSessionEnd !== null) {
    const m = ctx.minutesSinceSessionEnd;
    if (m >= 15 && m <= 40 && !t.stretch) {
      add({
        kind: "post_session_stretch",
        title: "Stretch while you're warm",
        body: "Ten minutes now saves you tomorrow.",
        target: { screen: "Routine", params: { focus: "stretch" } },
        priority: 92,
      });
    }
    if (m > 40 && m <= 75 && !t.stretch) {
      add({
        kind: "post_session_stretch_late",
        title: "Still worth stretching",
        body: "Tomorrow-you will notice.",
        target: { screen: "Routine", params: { focus: "stretch" } },
        priority: 60,
      });
    }
    if (m >= 45 && m <= 90) {
      add({
        kind: "post_session_refuel",
        title: "Refuel window",
        body: "Protein and something real. Snap it and I'll score it.",
        target: { screen: "Companions", params: { open: "nutrition" } },
        priority: 80,
      });
    }
  }

  // ---- Morning ------------------------------------------------------------
  if (ctx.hour >= 7 && ctx.hour < 10 && !t.breakfast) {
    add({
      kind: "breakfast_morning",
      title: "Breakfast in?",
      body: "Log it through the Nutrition bot and I'll score it.",
      target: { screen: "Companions", params: { open: "nutrition" } },
      priority: 75,
    });
  }
  if (ctx.hour >= 8 && ctx.hour < 11 && t.breakfast && !t.sleep) {
    add({
      kind: "sleep_check",
      title: "How'd you sleep?",
      body: "Eight to ten hours is the target. Tap to log last night.",
      target: { screen: "Routine", params: { focus: "sleep" } },
      priority: 40,
    });
  }
  if (ctx.consecutiveShortSleep >= 2) {
    add({
      kind: "sleep_streak_warning",
      title: "Two short nights",
      body: "Sleep is when your legs actually rebuild. Try for eight tonight.",
      target: { screen: "Routine", params: { focus: "sleep" } },
      priority: 65,
    });
  }

  // ---- Habits, only when still missing ------------------------------------
  if (ctx.hour >= 13 && ctx.hour < 16 && !t.water) {
    add({
      kind: "water_midday",
      title: "Water check",
      body: "Halfway through the day — had enough yet?",
      target: { screen: "Routine", params: { focus: "water" } },
      priority: 55,
    });
  }
  if (ctx.hour >= 17 && ctx.hour < 20 && !t.water) {
    add({
      kind: "water_evening",
      title: "Still no water logged",
      body: "Even two glasses now helps you tomorrow.",
      target: { screen: "Routine", params: { focus: "water" } },
      priority: 58,
    });
  }
  if (ctx.hour >= 18 && ctx.hour < 21 && !t.fruits_veggies) {
    add({
      kind: "produce_evening",
      title: "Any fruit or veg today?",
      body: "Snap your dinner and the Nutrition bot will score it.",
      target: { screen: "Companions", params: { open: "nutrition" } },
      priority: 62,
    });
  }
  if (ctx.hour >= 19 && ctx.hour < 21 && fitnessDone(t) === 0) {
    add({
      kind: "nothing_logged",
      title: "Nothing logged today",
      body: "Twenty minutes of touches still counts. Start there.",
      target: { screen: "Routine" },
      priority: 72,
    });
  }

  // ---- Streaks and recovery ----------------------------------------------
  if (ctx.streakDays >= 3 && ctx.hour >= 19 && ctx.hour < 21 && fitnessDone(t) === 0) {
    add({
      kind: "streak_at_risk",
      title: `${ctx.streakDays} days straight`,
      body: "Don't break it tonight — one item keeps it alive.",
      target: { screen: "Routine" },
      priority: 96,
    });
  }
  if (ctx.daysSinceLastLog !== null && ctx.daysSinceLastLog >= 2) {
    add({
      kind: "welcome_back",
      title: "Missed you",
      body: "One thing today, that's all. Pick the easiest one.",
      target: { screen: "Routine" },
      priority: 68,
    });
  }
  if (ctx.fitnessDaysThisWeek === 2 && ctx.hour >= 10) {
    add({
      kind: "week_target_close",
      title: "One more session this week",
      body: "That's your three days hit.",
      target: { screen: "Routine" },
      priority: 50,
    });
  }
  if (fitnessDone(t) === 4 && Object.values(t).filter(Boolean).length === 8) {
    add({
      kind: "perfect_day",
      title: "Perfect day",
      body: "All eight items. That's the standard.",
      target: { screen: "Home" },
      priority: 45,
    });
  }
  if (ctx.streakDays >= 6) {
    add({
      kind: "rest_reminder",
      title: "Six days on",
      body: "Rest is training too. Take today easy if you need it.",
      target: { screen: "Home" },
      priority: 30,
    });
  }

  // ---- Level up ----------------------------------------------------------
  if (ctx.attendancePct !== null && ctx.attendancePct < 90) {
    add({
      kind: "attendance_low",
      title: "Attendance under ninety percent",
      body: "The next session counts toward levelling up.",
      target: { screen: "Schedule" },
      priority: 85,
    });
  }
  if (ctx.criteriaMetCount === 5 || ctx.criteriaMetCount === 6) {
    add({
      kind: "criteria_close",
      title: `${ctx.criteriaMetCount} of seven met`,
      body: "You're close to levelling up. Check what's left.",
      target: { screen: "Home" },
      priority: 52,
    });
  }

  // ---- Companion-driven --------------------------------------------------
  if (ctx.lastNutritionScore !== null && ctx.lastNutritionScore < 50) {
    add({
      kind: "nutrition_low_score",
      title: "Last meal scored low",
      body: "Want a better option for today? Ask the Nutrition bot.",
      target: { screen: "Companions", params: { open: "nutrition" } },
      priority: 48,
    });
  }
  if (ctx.daysSinceNutrition !== null && ctx.daysSinceNutrition >= 3) {
    add({
      kind: "nutrition_stale",
      title: "No meals logged lately",
      body: "Snap your next one — it takes a few seconds.",
      target: { screen: "Companions", params: { open: "nutrition" } },
      priority: 42,
    });
  }
  if (ctx.newSoccerResult) {
    add({
      kind: "soccer_result_ready",
      title: "Your effort score is in",
      body: "Your coach logged a result from a match clip.",
      target: { screen: "Companions", params: { open: "soccer" } },
      priority: 78,
    });
  }

  // ---- Trend-driven: react to direction, not just the last score ----------
  const LABEL: Record<string, string> = {
    nutrition: "nutrition",
    primefit: "fitness",
    zenfit: "wellbeing",
    soccer: "match effort",
  };

  if (ctx.decliningCompanion) {
    const { companion, changePct } = ctx.decliningCompanion;
    const label = LABEL[companion] ?? companion;
    add({
      kind: `trend_down_${companion}`,
      title: `Your ${label} scores are slipping`,
      body: `Down about ${Math.abs(changePct)} percent lately. Want to look at what changed?`,
      target:
        companion === "soccer"
          ? { screen: "Companions", params: { open: "soccer" } }
          : companion === "primefit"
          ? { screen: "Companions", params: { open: "primefit" } }
          : companion === "zenfit"
          ? { screen: "Companions", params: { open: "zenfit" } }
          : { screen: "Companions", params: { open: "nutrition" } },
      priority: 88,
    });
  }

  if (ctx.improvingCompanion) {
    const { companion, changePct } = ctx.improvingCompanion;
    const label = LABEL[companion] ?? companion;
    add({
      kind: `trend_up_${companion}`,
      title: `Your ${label} is trending up`,
      body: `Up about ${changePct} percent. Whatever you changed, keep doing it.`,
      target: { screen: "Home" },
      priority: 44,
    });
  }

  return out;
}

// Applies the cap, the spacing rule, and once-per-day-per-kind. Returns the
// nudges that should actually be sent right now, highest priority first.
export async function selectDeliverable(
  ctx: NudgeContext,
  candidates: Nudge[]
): Promise<Nudge[]> {
  if (candidates.length === 0) return [];

  const prefs = await pool.query(
    `SELECT enabled, quiet_start, quiet_end FROM nudge_prefs WHERE user_id = $1`,
    [ctx.userId]
  );
  const pref = prefs.rows[0];
  if (pref && pref.enabled === false) return [];

  const quietStart = pref?.quiet_start ?? 21;
  const quietEnd = pref?.quiet_end ?? 7;
  // Quiet hours wrap midnight, so the comparison is an OR not an AND.
  const inQuietHours =
    quietStart > quietEnd
      ? ctx.hour >= quietStart || ctx.hour < quietEnd
      : ctx.hour >= quietStart && ctx.hour < quietEnd;
  if (inQuietHours) return [];

  const sentToday = await pool.query(
    `SELECT kind, sent_at FROM nudge_log
     WHERE user_id = $1 AND sent_at >= date_trunc('day', now())
     ORDER BY sent_at DESC`,
    [ctx.userId]
  );

  if (sentToday.rowCount !== null && sentToday.rowCount >= MAX_PER_DAY) return [];

  const lastSentAt = sentToday.rows[0]?.sent_at as Date | undefined;
  if (lastSentAt) {
    const gapMin = (Date.now() - new Date(lastSentAt).getTime()) / 60000;
    if (gapMin < MIN_GAP_MINUTES) return [];
  }

  const alreadySent = new Set(sentToday.rows.map((r) => r.kind as string));
  const fresh = candidates
    .filter((n) => !alreadySent.has(n.kind))
    .sort((a, b) => b.priority - a.priority);

  // One at a time: spacing is enforced on the next run, so sending a batch here
  // would defeat it.
  return fresh.slice(0, 1);
}

// True when a session is under way (or about to be), meaning nothing should fire.
export function inSessionWindow(
  minutesToNextSession: number | null,
  minutesSinceSessionEnd: number | null
): boolean {
  if (
    minutesToNextSession !== null &&
    minutesToNextSession >= 0 &&
    minutesToNextSession <= SESSION_QUIET_BEFORE_MIN
  ) {
    return true;
  }
  // Negative "since end" means the session hasn't ended yet.
  return minutesSinceSessionEnd !== null && minutesSinceSessionEnd < 0;
}
