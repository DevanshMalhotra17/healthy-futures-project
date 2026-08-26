import { apiGet, apiPost } from "./client";

export type RosterStudent = {
  id: string;
  fullName: string;
  email: string;
  linkedAt: string;
  checkinsLast30Days: number;
  lastCheckinAt: string | null;
  sessionsAttended: number;
  sessionsHeld: number;
  // null when the coach hasn't held any sessions yet, so the UI can show "—"
  // instead of a misleading 0%.
  attendancePct: number | null;
  fitnessDaysThisWeek: number;
  routineDaysLast7: number;
  criteriaRated: boolean;
  criteriaMetCount: number;
};

export type Roster = { students: RosterStudent[]; sessionsHeld: number };

export async function getRoster(token?: string | null): Promise<Roster> {
  const data = await apiGet<Roster>("/coach/roster", token);
  return { students: data.students || [], sessionsHeld: data.sessionsHeld ?? 0 };
}

export type CompanionName = "nutrition" | "primefit" | "zenfit" | "soccer";

export type ActivityEntry = {
  id: string;
  companion: CompanionName;
  score: number | null;
  detail: string | null;
  createdAt: string;
};

export type ActivitySummary = {
  companion: CompanionName;
  uses: number;
  avgScore: number | null;
  lastUsed: string;
};

export const COMPANION_LABELS: Record<CompanionName, string> = {
  nutrition: "Nutrition",
  primefit: "PrimeFit",
  zenfit: "ZenFit",
  soccer: "Soccer",
};

// Enrolled faces for this coach's roster, passed to the analyzer for tier-2
// matching. Empty when nobody has enrolled.
export async function getFaceDb(
  token?: string | null
): Promise<{ student_id: string; embedding: number[] }[]> {
  const data = await apiGet<{ faces: { student_id: string; embedding: number[] }[] }>(
    "/soccer/face-db",
    token
  );
  return data.faces || [];
}

export async function saveSoccerResult(
  input: {
    student_id: string;
    session_ref: string;
    effort: number;
    distance_m?: number;
    top_speed_ms?: number;
    sprints?: number;
    rank_in_clip?: number;
    players_in_clip?: number;
    identified_by?: string | null;
  },
  token?: string | null
): Promise<void> {
  await apiPost("/soccer/results", input, token);
}

export async function getStudentActivity(
  studentId: string,
  token?: string | null
): Promise<{ activity: ActivityEntry[]; summary: ActivitySummary[] }> {
  return apiGet(
    `/coach/student-activity?student_id=${encodeURIComponent(studentId)}`,
    token
  );
}
