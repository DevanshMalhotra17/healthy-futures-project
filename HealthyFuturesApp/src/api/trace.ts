import { apiGet, apiPost } from "./client";

export type TraceSession = {
  id: number;
  home_team: string;
  away_team: string;
  home_color?: string;
  away_color?: string;
  home_score?: number;
  away_score?: number;
  start_time?: string;
  status?: string;
};

export async function listTraceSessions(token?: string | null): Promise<TraceSession[]> {
  const data = await apiGet<{ sessions: TraceSession[] }>("/trace/sessions", token);
  return data.sessions || [];
}

export type TraceChatMessage = { role: "user" | "assistant"; content: string };

export type TraceChatRequest = {
  session_id: number;
  message: string;
  history: TraceChatMessage[];
  player_focus?: string;
};

export async function sendTraceChat(
  request: TraceChatRequest,
  token?: string | null
): Promise<{ reply: string }> {
  return apiPost<{ reply: string }>("/trace/chat", request, token);
}
