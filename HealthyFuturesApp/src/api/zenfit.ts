import { apiGet, apiPost } from "./client";

export const MOODS = [
  { key: "great", label: "Great" },
  { key: "good", label: "Good" },
  { key: "ok", label: "OK" },
  { key: "stressed", label: "Stressed" },
  { key: "tired", label: "Tired" },
  { key: "down", label: "Down" },
] as const;

export type Mood = (typeof MOODS)[number]["key"];

export type ZenCheckin = {
  id: string;
  mood: Mood;
  energy: number;
  note: string | null;
  reply: string | null;
  created_at: string;
};

export async function getZenHistory(
  token?: string | null
): Promise<{ checkins: ZenCheckin[]; count_last_7_days: number }> {
  return apiGet("/zenfit", token);
}

export type ZenCheckinResult = {
  checkin: ZenCheckin;
  // Character Points reward the act of checking in, so students get credit for
  // showing up rather than for reporting a particular mood.
  characterPoints: number;
  pointsEarned: number;
  characterPointsTarget: number;
  characterMet: boolean;
};

export async function submitZenCheckin(
  input: { mood: Mood; energy: number; note?: string },
  token?: string | null
): Promise<ZenCheckinResult> {
  return apiPost<ZenCheckinResult>("/zenfit", input, token);
}
