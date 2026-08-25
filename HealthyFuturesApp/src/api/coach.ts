import { apiGet, apiPost } from "./client";

export type RosterStudent = {
  id: string;
  fullName: string;
  email: string;
  linkedAt: string;
  checkinsLast30Days: number;
  lastCheckinAt: string | null;
};

export async function getRoster(token?: string | null): Promise<RosterStudent[]> {
  const data = await apiGet<{ students: RosterStudent[] }>("/coach/roster", token);
  return data.students || [];
}

export async function checkInStudent(
  studentId: string,
  sessionLabel: string,
  token?: string | null
): Promise<void> {
  await apiPost("/checkins", { student_id: studentId, session_label: sessionLabel }, token);
}
