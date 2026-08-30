import { apiDelete, apiGet, API_BASE_URL, ApiError } from "./client";

export type PracticeVideo = {
  id: string;
  caption: string | null;
  created_at: string;
  viewed_at?: string | null;
  byte_size: number;
  student_id?: string;
  student_name?: string;
  // Relative to the API base; build a playable url with streamUrl().
  streamPath: string;
};

// The server rejects anything larger, so fail before spending the upload time.
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export function streamUrl(video: PracticeVideo): string {
  return `${API_BASE_URL}${video.streamPath}`;
}

// The clip is posted straight to our API as multipart. There is no presigned-url
// step: the file lands on the API host and is served back only through the
// auth-gated stream route, so no public url to a minor's video ever exists.
export async function uploadPracticeVideo(
  file: { uri: string; name?: string; mimeType?: string | null },
  caption: string,
  token?: string | null
): Promise<PracticeVideo> {
  const form = new FormData();
  // React Native's FormData takes this shape for file parts; the assertion is
  // needed because the DOM lib types expect a Blob.
  form.append("video", {
    uri: file.uri,
    name: file.name || "practice.mp4",
    type: file.mimeType || "video/mp4",
  } as unknown as Blob);
  if (caption.trim()) {
    form.append("caption", caption.trim());
  }

  // Content-Type is intentionally unset so the runtime supplies the multipart
  // boundary.
  const res = await fetch(`${API_BASE_URL}/videos`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (!res.ok) {
    let message = `Upload failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error page (e.g. a proxy rejecting the body size).
    }
    throw new ApiError(message, res.status);
  }

  const data = (await res.json()) as { video: PracticeVideo };
  return data.video;
}

export async function listMyVideos(token?: string | null): Promise<PracticeVideo[]> {
  const data = await apiGet<{ videos: PracticeVideo[] }>("/videos", token);
  return data.videos || [];
}

export async function listStudentVideos(
  studentId: string,
  token?: string | null
): Promise<PracticeVideo[]> {
  const data = await apiGet<{ videos: PracticeVideo[] }>(
    `/videos?student_id=${encodeURIComponent(studentId)}`,
    token
  );
  return data.videos || [];
}

// Everything across a coach's roster, unwatched first.
export async function listCoachInbox(
  token?: string | null
): Promise<{ videos: PracticeVideo[]; unwatched: number }> {
  return apiGet("/videos/inbox", token);
}

export async function deleteVideo(id: string, token?: string | null): Promise<void> {
  await apiDelete(`/videos/${encodeURIComponent(id)}`, token);
}
