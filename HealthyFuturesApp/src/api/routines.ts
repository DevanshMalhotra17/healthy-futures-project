import { apiGet, apiPut } from "./client";

// The server runs on UTC, so it can't work out which calendar day an evening
// practice belongs to on its own. Sending the device's IANA zone lets it resolve
// "today" the way the athlete experiences it. Guarded because Intl support isn't
// something to assume on every engine — UTC is the server's fallback.
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export type RoutineField =
  | "active_play"
  | "ball_control"
  | "touches"
  | "stretch"
  | "fruits_veggies"
  | "water"
  | "breakfast"
  | "sleep";

export type RoutineDay = Record<RoutineField, boolean> & {
  log_date: string | null;
  // Measured values behind active_play and sleep. "health" means a device supplied
  // it; "manual" means the student set it, and a later sync won't overwrite it.
  active_minutes?: number | null;
  sleep_hours?: number | null;
  active_source?: "health" | "manual" | null;
  sleep_source?: "health" | "manual" | null;
};

export type RoutineSummary = {
  today: RoutineDay;
  fitness_days_this_week: number;
  days_logged_last_28: number;
  habit_streak: number;
};

export type RoutineItem = { key: RoutineField; label: string; hint: string };

// Mirrors the program's printed at-home routine.
export const FITNESS_ITEMS: RoutineItem[] = [
  { key: "active_play", label: "Active play or exercise", hint: "30–45 minutes" },
  { key: "ball_control", label: "Ball control practice", hint: "20 minutes" },
  { key: "touches", label: "Touches with each foot", hint: "50–100 each" },
  { key: "stretch", label: "Stretch before and after", hint: "Every session" },
];

export const HABIT_ITEMS: RoutineItem[] = [
  { key: "fruits_veggies", label: "Fruits and vegetables", hint: "Every day" },
  { key: "water", label: "Water over sugary drinks", hint: "Every day" },
  { key: "breakfast", label: "Healthy breakfast", hint: "Before training" },
  { key: "sleep", label: "8–10 hours of sleep", hint: "Every night" },
];

export const FITNESS_DAYS_TARGET = 3;

export async function getToday(token?: string | null): Promise<RoutineSummary> {
  return apiGet<RoutineSummary>("/routines/today", token);
}

export async function updateToday(
  updates: Partial<Record<RoutineField, boolean>>,
  token?: string | null
): Promise<RoutineSummary> {
  return apiPut<RoutineSummary>("/routines/today", updates, token);
}

export async function getHistory(
  studentId: string | undefined,
  token?: string | null
): Promise<{ days: (RoutineDay & { log_date: string })[] } & Omit<RoutineSummary, "today">> {
  const query = studentId ? `?student_id=${encodeURIComponent(studentId)}` : "";
  return apiGet(`/routines/history${query}`, token);
}

export type HealthSyncResult = {
  today: RoutineDay;
  applied: { active_play: boolean; sleep: boolean };
  skipped_manual: { active_play: boolean; sleep: boolean };
};

// Pushes measured values from the device's health store. The server only flips a
// boolean when the student hasn't already set that item by hand.
export async function syncHealth(
  input: {
    active_minutes?: number | null;
    sleep_hours?: number | null;
    exercise_at?: string | null;
  },
  token?: string | null
): Promise<HealthSyncResult> {
  return apiPut<HealthSyncResult>(
    "/routines/health-sync",
    { ...input, tz: deviceTimeZone() },
    token
  );
}

// Today's items, each earned from evidence rather than a self-reported tick.
export type DerivedItem = {
  key: "exercise" | "stretch" | "sleep" | "practice" | "meals" | "breakfast";
  label: string;
  met: boolean;
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

export async function getDerivedDay(
  token?: string | null,
  studentId?: string
): Promise<DerivedDay> {
  const params = new URLSearchParams();
  if (studentId) params.set("student_id", studentId);
  const tz = deviceTimeZone();
  if (tz) params.set("tz", tz);
  const q = params.toString();
  return apiGet<DerivedDay>(`/routines/derived${q ? `?${q}` : ""}`, token);
}
