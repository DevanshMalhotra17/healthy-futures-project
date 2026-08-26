// Talks directly to the soccer-ai-api service (YOLO video analysis), which is
// deployed separately from healthy-futures-api and takes no auth of its own.
// Override for local testing with EXPO_PUBLIC_SOCCER_API_BASE.
export const SOCCER_API_BASE = (
  process.env.EXPO_PUBLIC_SOCCER_API_BASE || "https://tachyonleap-api.demo.gomllabs.com"
).replace(/\/$/, "");

export type SoccerStatus = "queued" | "running" | "done" | "error";

// How a player in the clip was matched to a student. "needs_tap" means neither
// the jersey number nor the face was resolvable, so the coach picks manually.
export type IdentifiedBy = "jersey" | "face" | "needs_tap" | null;

export type AnalyzedPlayer = {
  tracker_id: number;
  effort: number;
  rank: number;
  distance: number;
  top_speed: number;
  avg_speed: number;
  sprints: number;
  seconds_tracked: number;
  team: number | null;
  box: [number, number, number, number] | null;
  identified_by: IdentifiedBy;
  student_id: string | null;
  jersey_number: number | null;
};

export type Analysis = {
  players: AnalyzedPlayer[];
  player_count: number;
  calibrated: boolean;
  pitch_note: string;
  units: string;
  identification: {
    jersey: number;
    face: number;
    needs_tap: number;
    ocr_available: boolean;
    face_available: boolean;
  };
};

// The deployed nginx caps the request body at 500 MB; fail before the upload
// rather than after, since a rejection there returns an HTML error page, not
// JSON. Kept below the server limit to leave room for multipart overhead.
export const MAX_VIDEO_BYTES = 450 * 1024 * 1024;

export class SoccerError extends Error {}

// One full analysis. faceDb is the coach's enrolled roster, used for tier-2
// matching; omit it and the cascade falls through to coach tap.
export async function uploadClip(
  video: { uri: string; name: string; mimeType?: string | null },
  faceDb?: { student_id: string; embedding: number[] }[]
): Promise<string> {
  const form = new FormData();
  // React Native's FormData takes this shape for file parts; the type assertion
  // is required because the DOM lib types expect a Blob.
  form.append("video", {
    uri: video.uri,
    name: video.name || "clip.mp4",
    type: video.mimeType || "video/mp4",
  } as unknown as Blob);
  if (faceDb?.length) {
    form.append("face_db", JSON.stringify(faceDb));
  }

  // Content-Type is intentionally unset so the runtime supplies the multipart
  // boundary.
  const res = await fetch(`${SOCCER_API_BASE}/api/soccer/analyze`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new SoccerError(await describeFailure(res));
  }
  const data = (await res.json()) as { session_id?: string };
  if (!data.session_id) {
    throw new SoccerError("The analyzer didn't return a job id.");
  }
  return data.session_id;
}

export async function getStatus(
  sessionId: string
): Promise<{ status: SoccerStatus; error: string | null }> {
  const res = await fetch(
    `${SOCCER_API_BASE}/api/soccer/sessions/${encodeURIComponent(sessionId)}/status`
  );
  if (!res.ok) {
    throw new SoccerError(
      res.status === 404
        ? "That analysis job expired — the analyzer restarted. Try uploading again."
        : await describeFailure(res)
    );
  }
  return (await res.json()) as { status: SoccerStatus; error: string | null };
}

export async function getAnalysis(sessionId: string): Promise<Analysis> {
  const res = await fetch(
    `${SOCCER_API_BASE}/api/soccer/analyze/${encodeURIComponent(sessionId)}/result`
  );
  if (!res.ok) {
    throw new SoccerError(await describeFailure(res));
  }
  return (await res.json()) as Analysis;
}

// The analyzer returns JSON errors, but nginx returns HTML for things like an
// oversized body — so don't assume the body parses.
async function describeFailure(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    // not JSON
  }
  if (res.status === 413) {
    return "That clip is too large — keep it under 450 MB.";
  }
  return `The analyzer returned an error (${res.status}).`;
}
