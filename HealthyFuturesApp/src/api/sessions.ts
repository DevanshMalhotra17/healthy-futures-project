import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export type TrainingSession = {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  presentCount: number;
  viewerPresent: boolean;
};

export type SessionInput = {
  title: string;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
};

export type AttendanceRow = {
  studentId: string;
  fullName: string;
  email: string;
  present: boolean;
};

export async function listSessions(token?: string | null): Promise<TrainingSession[]> {
  const data = await apiGet<{ sessions: TrainingSession[] }>("/sessions", token);
  return data.sessions || [];
}

export async function createSession(
  input: SessionInput,
  token?: string | null
): Promise<TrainingSession> {
  const data = await apiPost<{ session: TrainingSession }>("/sessions", input, token);
  return data.session;
}

export async function updateSession(
  id: string,
  input: SessionInput,
  token?: string | null
): Promise<TrainingSession> {
  const data = await apiPut<{ session: TrainingSession }>(`/sessions/${id}`, input, token);
  return data.session;
}

export async function deleteSession(id: string, token?: string | null): Promise<void> {
  await apiDelete(`/sessions/${id}`, token);
}

export async function getAttendance(
  sessionId: string,
  token?: string | null
): Promise<AttendanceRow[]> {
  const data = await apiGet<{ attendance: AttendanceRow[] }>(
    `/sessions/${sessionId}/attendance`,
    token
  );
  return data.attendance || [];
}

export async function setAttendance(
  sessionId: string,
  studentId: string,
  present: boolean,
  token?: string | null
): Promise<void> {
  await apiPut(`/sessions/${sessionId}/attendance`, { student_id: studentId, present }, token);
}
