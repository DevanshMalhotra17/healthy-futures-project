import { pool } from "../db/pool";
import {
  NudgeContext,
  Nudge,
  evaluate,
  selectDeliverable,
  inSessionWindow,
} from "./nudges";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EMPTY_DAY: Record<string, boolean> = {};

// Pulls every signal the rules need for one student, in as few queries as
// practical. Times are evaluated in the student's local hour where known; the
// program is Trenton-based so a single offset is good enough for now.
async function buildContext(userId: string): Promise<NudgeContext | null> {
  const [days, streak, week, attendance, criteria, nutrition, sessions, soccer] =
    await Promise.all([
      pool.query(
        `SELECT log_date, active_play, ball_control, touches, stretch,
                fruits_veggies, water, breakfast, sleep
         FROM routine_logs
         WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY log_date DESC`,
        [userId]
      ),
      pool.query(
        `SELECT log_date FROM routine_logs
         WHERE user_id = $1
           AND (active_play OR ball_control OR touches OR stretch)
         ORDER BY log_date DESC LIMIT 30`,
        [userId]
      ),
      pool.query(
        `SELECT count(*)::int AS days FROM routine_logs
         WHERE user_id = $1
           AND log_date >= date_trunc('week', CURRENT_DATE)
           AND (active_play OR ball_control OR touches OR stretch)`,
        [userId]
      ),
      pool.query(
        `SELECT
           (SELECT count(*) FROM sessions s
             JOIN coach_student_links sc ON sc.coach_id = s.coach_id
            WHERE sc.student_id = $1 AND s.starts_at < now())::int AS held,
           (SELECT count(*) FROM checkins WHERE user_id = $1 AND status = 'present')::int AS attended,
           (SELECT count(*) FROM checkins c JOIN sessions s ON s.id = c.session_id
             WHERE c.user_id = $1 AND s.starts_at < now() AND c.status = 'excused')::int AS excused`,
        [userId]
      ),
      pool.query(
        `SELECT attitude, effort, coachability, skill, character, academics
         FROM criteria_ratings WHERE student_id = $1
         ORDER BY period DESC LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT score, created_at FROM companion_activity
         WHERE user_id = $1 AND companion = 'nutrition'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT s.starts_at, s.ends_at FROM sessions s
         JOIN coach_student_links sc ON sc.coach_id = s.coach_id
         WHERE sc.student_id = $1
           AND s.starts_at BETWEEN now() - INTERVAL '4 hours' AND now() + INTERVAL '4 hours'
         ORDER BY s.starts_at ASC LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT created_at FROM soccer_results
         WHERE user_id = $1 AND created_at > now() - INTERVAL '24 hours'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
    ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const rowFor = (offset: number) => {
    const target = new Date();
    target.setDate(target.getDate() - offset);
    const iso = target.toISOString().slice(0, 10);
    return (
      days.rows.find((r) => new Date(r.log_date).toISOString().slice(0, 10) === iso) ??
      EMPTY_DAY
    );
  };

  const today = rowFor(0);
  const yesterday = rowFor(1);

  // Consecutive days ending yesterday where sleep was not logged as met.
  let consecutiveShortSleep = 0;
  for (let i = 1; i <= 5; i++) {
    const row = rowFor(i);
    if (row === EMPTY_DAY) break;
    if (row.sleep) break;
    consecutiveShortSleep++;
  }

  // Streak of consecutive days (ending today or yesterday) with any fitness item.
  let streakDays = 0;
  const logged = new Set(
    streak.rows.map((r) => new Date(r.log_date).toISOString().slice(0, 10))
  );
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (logged.has(iso)) streakDays++;
    else if (!(i === 0 && iso === todayIso)) break;
  }

  const lastLogIso = streak.rows[0]
    ? new Date(streak.rows[0].log_date).toISOString().slice(0, 10)
    : null;
  const daysSinceLastLog = lastLogIso
    ? Math.round(
        (Date.parse(todayIso) - Date.parse(lastLogIso)) / 86_400_000
      )
    : null;

  const held = attendance.rows[0]?.held ?? 0;
  const attended = attendance.rows[0]?.attended ?? 0;
  const excused = attendance.rows[0]?.excused ?? 0;
  // Excused sessions leave the denominator, matching the criteria endpoint so a
  // nudge can't claim attendance is low when the app shows it as fine.
  const countableHeld = Math.max(held - excused, 0);
  const attendancePct =
    countableHeld > 0 ? Math.round((attended / countableHeld) * 100) : null;

  const c = criteria.rows[0];
  const criteriaMetCount = c
    ? [c.attitude, c.effort, c.coachability, c.skill, c.character, c.academics].filter(
        Boolean
      ).length + (attendancePct !== null && attendancePct >= 90 ? 1 : 0)
    : 0;

  const nutritionRow = nutrition.rows[0];
  const daysSinceNutrition = nutritionRow
    ? Math.floor((Date.now() - new Date(nutritionRow.created_at).getTime()) / 86_400_000)
    : null;

  const session = sessions.rows[0];
  const minutesToNextSession = session
    ? Math.round((new Date(session.starts_at).getTime() - Date.now()) / 60_000)
    : null;
  const endsAt = session?.ends_at ? new Date(session.ends_at).getTime() : null;
  const minutesSinceSessionEnd = endsAt
    ? Math.round((Date.now() - endsAt) / 60_000)
    : null;

  // Reuse the same trend maths the graphs use, so a nudge never contradicts what
  // the student sees on screen.
  const { loadTrends } = await import("../routes/trends");
  const trends = await loadTrends(userId, 14).catch(() => []);
  const declining = trends
    .filter((t) => t.direction === "declining" && t.changePct !== null)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))[0];
  const improving = trends
    .filter((t) => t.direction === "improving" && t.changePct !== null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))[0];

  return {
    userId,
    hour: new Date().getHours(),
    today,
    yesterday,
    streakDays,
    fitnessDaysThisWeek: week.rows[0]?.days ?? 0,
    attendancePct,
    criteriaMetCount,
    daysSinceLastLog,
    daysSinceNutrition,
    lastNutritionScore: nutritionRow?.score ?? null,
    minutesToNextSession:
      minutesToNextSession !== null && minutesToNextSession >= 0
        ? minutesToNextSession
        : null,
    minutesSinceSessionEnd,
    newSoccerResult: (soccer.rowCount ?? 0) > 0,
    consecutiveShortSleep,
    decliningCompanion: declining
      ? { companion: declining.companion, changePct: declining.changePct as number }
      : null,
    improvingCompanion: improving
      ? { companion: improving.companion, changePct: improving.changePct as number }
      : null,
  };
}

async function sendPush(
  tokens: string[],
  nudge: Nudge
): Promise<{ ok: boolean; detail?: string }> {
  if (tokens.length === 0) return { ok: false, detail: "no device tokens" };

  const messages = tokens.map((to) => ({
    to,
    title: nudge.title,
    body: nudge.body,
    sound: "default",
    // The app reads these on tap to route to the right screen.
    data: {
      kind: nudge.kind,
      screen: nudge.target.screen,
      params: "params" in nudge.target ? nudge.target.params ?? {} : {},
    },
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      return { ok: false, detail: `expo returned ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

// Evaluates one student and sends at most one nudge. Returns what was sent, or
// null. Exported so a coach-facing preview endpoint can dry-run it.
export async function runForUser(
  userId: string,
  dryRun = false
): Promise<Nudge | null> {
  const ctx = await buildContext(userId);
  if (!ctx) return null;

  if (inSessionWindow(ctx.minutesToNextSession, ctx.minutesSinceSessionEnd)) {
    return null;
  }

  const candidates = evaluate(ctx);
  const [chosen] = await selectDeliverable(ctx, candidates);
  if (!chosen) return null;
  if (dryRun) return chosen;

  const tokens = await pool.query(
    `SELECT token FROM push_tokens WHERE user_id = $1`,
    [userId]
  );
  const result = await sendPush(
    tokens.rows.map((r) => r.token as string),
    chosen
  );

  // Logged either way: an unsent nudge that isn't recorded would be retried on
  // the next tick and could spam once delivery recovers.
  await pool.query(
    `INSERT INTO nudge_log (user_id, kind, title, body, screen, params)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      chosen.kind,
      chosen.title,
      chosen.body,
      chosen.target.screen,
      JSON.stringify("params" in chosen.target ? chosen.target.params ?? {} : {}),
    ]
  );

  if (!result.ok) {
    console.error(`Nudge push failed for ${userId}: ${result.detail}`);
  }
  return chosen;
}

// Sweeps every student who has at least one registered device.
export async function runAll(): Promise<number> {
  const students = await pool.query(
    `SELECT DISTINCT u.id FROM users u
     JOIN push_tokens pt ON pt.user_id = u.id
     WHERE u.role = 'student'`
  );

  let sent = 0;
  for (const row of students.rows) {
    try {
      const nudge = await runForUser(row.id as string);
      if (nudge) sent++;
    } catch (error) {
      // One student's failure must not stop the sweep.
      console.error(
        `Nudge run failed for ${row.id}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  return sent;
}
