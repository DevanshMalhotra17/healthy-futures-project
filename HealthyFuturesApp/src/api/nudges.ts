import { apiGet, apiPost, apiPut } from "./client";

export type NudgePrefs = {
  enabled: boolean;
  quiet_start: number;
  quiet_end: number;
};

export type SentNudge = {
  kind: string;
  title: string;
  body: string;
  screen: string | null;
  params: Record<string, unknown> | null;
  sent_at: string;
  opened_at: string | null;
};

export async function registerPushToken(
  token: string,
  platform: string,
  authToken?: string | null
): Promise<void> {
  await apiPost("/nudges/register", { token, platform }, authToken);
}

export async function unregisterPushToken(
  token: string,
  authToken?: string | null
): Promise<void> {
  await apiPost("/nudges/unregister", { token }, authToken);
}

export async function getNudgePrefs(
  authToken?: string | null
): Promise<{ prefs: NudgePrefs; maxPerDay: number }> {
  return apiGet("/nudges/prefs", authToken);
}

export async function saveNudgePrefs(
  prefs: Partial<NudgePrefs>,
  authToken?: string | null
): Promise<{ prefs: NudgePrefs }> {
  return apiPut("/nudges/prefs", prefs, authToken);
}

export async function getTodaysNudges(
  authToken?: string | null
): Promise<{ sent: SentNudge[]; remaining: number }> {
  return apiGet("/nudges/today", authToken);
}

// Fire-and-forget: knowing which wording pulls students back matters, but it
// must never delay opening the screen they tapped through to.
export function reportNudgeOpened(kind: string, authToken?: string | null): void {
  apiPost("/nudges/opened", { kind }, authToken).catch(() => undefined);
}
