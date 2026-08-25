import { apiGet, apiPut } from "./client";

export type RoutineField =
  | "active_play"
  | "ball_control"
  | "touches"
  | "stretch"
  | "fruits_veggies"
  | "water"
  | "breakfast"
  | "sleep";

export type RoutineDay = Record<RoutineField, boolean> & { log_date: string | null };

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
