import { pool } from "../db/pool";

// The at-home routine used to be eight checkboxes a student ticked themselves.
// Self-reporting was the weak link: a tick cost nothing and proved nothing. Each
// item is now earned from evidence the app already collects.
//
//   exercise  Apple Health exercise minutes
//   stretch   Apple Health exercise recorded close to that day's session
//   sleep     Apple Health sleep hours
//   practice  a practice clip sent to the coach (ball control / touches)
//   meals     a nutrition photo scored by the companion
//   breakfast a nutrition photo logged before that day's session
//
// Water was dropped: nothing measures it, so it could only ever be self-reported.

export const ACTIVE_MINUTES_TARGET = 30;
export const SLEEP_HOURS_TARGET = 8;
// Exercise counts toward the session when it lands within this window either
// side of kickoff. Wide enough for a warm-up beforehand or a cool-down after.
export const SESSION_WINDOW_MIN = 120;

export type DerivedItem = {
  key: "exercise" | "stretch" | "sleep" | "practice" | "meals" | "breakfast";
  label: string;
  met: boolean;
  // Shown to the student so they can see why it counted, not just that it did.
  detail: string;
};

export type DerivedDay = {
  items: DerivedItem[];
  met_count: number;
  total: number;
  active_minutes: number | null;
  sleep_hours: number | null;
  session_title: string | null;
  session_starts_at: string | null;
};

function hoursLabel(h: number): string {
  return `${Math.round(h * 10) / 10} h`;
}

export async function loadDerivedDay(userId: string): Promise<DerivedDay> {
  // Health figures for today, written by PUT /routines/health-sync.
  const health = await pool.query(
    `SELECT active_minutes, sleep_hours, exercise_at
     FROM routine_logs
     WHERE user_id = $1 AND log_date = CURRENT_DATE`,
    [userId]
  );
  const row = health.rows[0];
  const activeMinutes: number | null = row?.active_minutes ?? null;
  const sleepHours: number | null =
    row?.sleep_hours === null || row?.sleep_hours === undefined
      ? null
      : Number(row.sleep_hours);
  const exerciseAt: Date | null = row?.exercise_at ? new Date(row.exercise_at) : null;

  // That day's session, if the coach scheduled one.
  const session = await pool.query(
    `SELECT s.starts_at, s.title
     FROM sessions s
     JOIN coach_student_links l ON l.coach_id = s.coach_id
     WHERE l.student_id = $1 AND s.starts_at::date = CURRENT_DATE
     ORDER BY s.starts_at ASC
     LIMIT 1`,
    [userId]
  );
  const sessionStartsAt: Date | null = session.rows[0]
    ? new Date(session.rows[0].starts_at)
    : null;
  const sessionTitle: string | null = session.rows[0]?.title ?? null;

  // A practice clip sent today covers the at-home ball work.
  const clip = await pool.query(
    `SELECT caption FROM practice_videos
     WHERE user_id = $1 AND created_at::date = CURRENT_DATE
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  // Nutrition photos logged today, with the earliest time so breakfast-before-
  // practice can be judged.
  const meals = await pool.query(
    `SELECT count(*)::int AS n, min(created_at) AS first_at
     FROM companion_activity
     WHERE user_id = $1 AND companion = 'nutrition'
       AND created_at::date = CURRENT_DATE`,
    [userId]
  );
  const mealCount: number = meals.rows[0]?.n ?? 0;
  const firstMealAt: Date | null = meals.rows[0]?.first_at
    ? new Date(meals.rows[0].first_at)
    : null;

  const items: DerivedItem[] = [];

  // 1. Exercise — straight from Apple Health.
  items.push({
    key: "exercise",
    label: "Exercise",
    met: activeMinutes !== null && activeMinutes >= ACTIVE_MINUTES_TARGET,
    detail:
      activeMinutes === null
        ? "Waiting for Apple Health"
        : `${activeMinutes} min of ${ACTIVE_MINUTES_TARGET} from Apple Health`,
  });

  // 2. Warm-up / cool-down — exercise recorded near the session. On a day with
  // no session any exercise counts, so training on your own still earns it.
  let stretchMet = false;
  let stretchDetail: string;
  if (activeMinutes === null || activeMinutes <= 0) {
    stretchDetail = "Waiting for Apple Health";
  } else if (!sessionStartsAt) {
    stretchMet = true;
    stretchDetail = "Exercise recorded — no session scheduled today";
  } else if (exerciseAt) {
    const gapMin = Math.abs(exerciseAt.getTime() - sessionStartsAt.getTime()) / 60000;
    stretchMet = gapMin <= SESSION_WINDOW_MIN;
    stretchDetail = stretchMet
      ? `Exercise ${Math.round(gapMin)} min from ${sessionTitle ?? "practice"}`
      : `Exercise was ${Math.round(gapMin / 60)} h from ${sessionTitle ?? "practice"}`;
  } else {
    // Minutes but no timestamp (older client): credit it rather than punish.
    stretchMet = true;
    stretchDetail = "Exercise recorded from Apple Health";
  }
  items.push({
    key: "stretch",
    label: "Around practice",
    met: stretchMet,
    detail: stretchDetail,
  });

  // 3. Sleep — straight from Apple Health.
  items.push({
    key: "sleep",
    label: "Sleep",
    met: sleepHours !== null && sleepHours >= SLEEP_HOURS_TARGET,
    detail:
      sleepHours === null
        ? "Waiting for Apple Health"
        : `${hoursLabel(sleepHours)} of ${SLEEP_HOURS_TARGET} h from Apple Health`,
  });

  // 4. At-home ball work — proven by a clip, not a tick.
  const clipCaption: string | null = clip.rows[0]?.caption ?? null;
  items.push({
    key: "practice",
    label: "Practice clip",
    met: clip.rows.length > 0,
    detail:
      clip.rows.length > 0
        ? clipCaption
          ? `Sent: ${clipCaption.slice(0, 40)}`
          : "Clip sent to your coach"
        : "Send a clip of your ball work",
  });

  // 5. Meals — proven by a scored photo.
  items.push({
    key: "meals",
    label: "Meals logged",
    met: mealCount > 0,
    detail:
      mealCount > 0
        ? `${mealCount} photo${mealCount === 1 ? "" : "s"} scored today`
        : "Snap a meal in the Nutrition companion",
  });

  // 6. Fuelled before practice — a meal logged ahead of kickoff.
  let breakfastMet = false;
  let breakfastDetail: string;
  if (!firstMealAt) {
    breakfastDetail = "No meal logged yet";
  } else if (!sessionStartsAt) {
    breakfastMet = true;
    breakfastDetail = "Meal logged — no session scheduled today";
  } else if (firstMealAt.getTime() <= sessionStartsAt.getTime()) {
    breakfastMet = true;
    const mins = Math.round(
      (sessionStartsAt.getTime() - firstMealAt.getTime()) / 60000
    );
    breakfastDetail = `Ate ${mins} min before ${sessionTitle ?? "practice"}`;
  } else {
    breakfastDetail = `First meal was after ${sessionTitle ?? "practice"} started`;
  }
  items.push({
    key: "breakfast",
    label: "Fuelled up",
    met: breakfastMet,
    detail: breakfastDetail,
  });

  return {
    items,
    met_count: items.filter((i) => i.met).length,
    total: items.length,
    active_minutes: activeMinutes,
    sleep_hours: sleepHours,
    session_title: sessionTitle,
    session_starts_at: sessionStartsAt ? sessionStartsAt.toISOString() : null,
  };
}
