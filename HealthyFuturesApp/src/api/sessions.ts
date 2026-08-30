import { apiDelete, apiGet, apiPost, apiPut, API_BASE_URL, ApiError } from "./client";

export type TrainingSession = {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  presentCount: number;
  viewerPresent: boolean;
};

export type RepeatRule = "none" | "weekly" | "biweekly" | "monthly";

export type SessionInput = {
  title: string;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
  // The server expands a repeat into individual sessions, so one can be edited
  // or cancelled without affecting the rest of the series.
  repeat?: RepeatRule;
  repeatCount?: number;
};

export type AttendanceStatus = "present" | "absent" | "excused";

export type AttendanceRow = {
  studentId: string;
  fullName: string;
  email: string;
  // "excused" is left out of the attendance percentage entirely, so a student
  // with a note isn't penalised for a session they were told to miss.
  status: AttendanceStatus;
  present: boolean;
};

export async function listSessions(token?: string | null): Promise<TrainingSession[]> {
  const data = await apiGet<{ sessions: TrainingSession[] }>("/sessions", token);
  return data.sessions || [];
}

export async function createSession(
  input: SessionInput,
  token?: string | null
): Promise<{ sessions: TrainingSession[]; created: number }> {
  const data = await apiPost<{
    session: TrainingSession;
    sessions?: TrainingSession[];
    created?: number;
  }>("/sessions", input, token);
  const sessions = data.sessions ?? (data.session ? [data.session] : []);
  return { sessions, created: data.created ?? sessions.length };
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
  status: AttendanceStatus,
  token?: string | null
): Promise<void> {
  await apiPut(
    `/sessions/${sessionId}/attendance`,
    { student_id: studentId, status },
    token
  );
}

export type ExtractedSession = {
  title: string;
  location: string | null;
  date: string;
  startTime: string;
  endTime: string | null;
  confidence: "high" | "medium" | "low";
};

// Sends a photo of a schedule and gets back candidate sessions. Nothing is saved
// until the coach confirms, so a misread time can't put students in the wrong place.
export async function importScheduleFromPhoto(
  photo: { uri: string; name?: string; mimeType?: string | null },
  token?: string | null
): Promise<{ sessions: ExtractedSession[]; note: string | null }> {
  const form = new FormData();
  form.append("image", {
    uri: photo.uri,
    name: photo.name || "schedule.jpg",
    type: photo.mimeType || "image/jpeg",
  } as unknown as Blob);
  // The coach's own date, so weekday names resolve in their timezone.
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  form.append("today", local);

  const res = await fetch(`${API_BASE_URL}/sessions/import-photo`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (!res.ok) {
    let message = `Couldn't read that schedule (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error page
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as { sessions: ExtractedSession[]; note: string | null };
}

// Turns a confirmed extraction row into the shape createSession expects.
export function extractedToInput(e: ExtractedSession): SessionInput {
  const startsAt = new Date(`${e.date}T${e.startTime}:00`).toISOString();
  const endsAt = e.endTime ? new Date(`${e.date}T${e.endTime}:00`).toISOString() : null;
  return { title: e.title, location: e.location, startsAt, endsAt };
}
