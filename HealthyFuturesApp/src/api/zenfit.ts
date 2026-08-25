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

export async function submitZenCheckin(
  input: { mood: Mood; energy: number; note?: string },
  token?: string | null
): Promise<ZenCheckin> {
  const data = await apiPost<{ checkin: ZenCheckin }>("/zenfit", input, token);
  return data.checkin;
}
