import { apiGet } from "./client";

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
