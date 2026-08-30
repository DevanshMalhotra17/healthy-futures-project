import { apiGet } from "./client";

export type CompanionKey = "nutrition" | "primefit" | "zenfit" | "soccer";

export type DailyPoint = { date: string; avg: number; count: number };

export type CompanionTrend = {
  companion: CompanionKey;
  points: DailyPoint[];
  average: number | null;
  latest: number | null;
  direction: "improving" | "declining" | "steady" | "unknown";
  changePct: number | null;
};

export const TREND_LABELS: Record<CompanionKey, string> = {
  nutrition: "Healthy Food",
  primefit: "PrimeFit",
  zenfit: "ZenFit",
  soccer: "Match Effort",
};

export async function getMyTrends(
  days = 14,
  token?: string | null
): Promise<CompanionTrend[]> {
  const data = await apiGet<{ trends: CompanionTrend[] }>(`/trends?days=${days}`, token);
  return data.trends || [];
}

export async function getStudentTrends(
  studentId: string,
  days = 14,
  token?: string | null
): Promise<CompanionTrend[]> {
  const data = await apiGet<{ trends: CompanionTrend[] }>(
    `/trends/student?student_id=${encodeURIComponent(studentId)}&days=${days}`,
    token
  );
  return data.trends || [];
}
