import { apiGet, apiPost } from "./client";

export type Checkin = { id: string; session_label: string; checked_in_at: string };

export async function postCheckin(sessionLabel: string, token?: string | null): Promise<Checkin> {
  const data = await apiPost<{ checkin: Checkin }>(
    "/checkins",
    { session_label: sessionLabel },
    token
  );
  return data.checkin;
}

export async function getCheckinSummary(
  token?: string | null
): Promise<{ count_last_30_days: number; recent: Checkin[] }> {
  return apiGet<{ count_last_30_days: number; recent: Checkin[] }>("/checkins/summary", token);
}
