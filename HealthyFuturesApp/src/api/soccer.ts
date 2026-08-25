// Talks directly to the soccer-ai-api service (YOLO video analysis), which is
// deployed separately from healthy-futures-api and takes no auth of its own.
// Override for local testing with EXPO_PUBLIC_SOCCER_API_BASE.
export const SOCCER_API_BASE = (
  process.env.EXPO_PUBLIC_SOCCER_API_BASE || "https://tachyonleap-api.demo.gomllabs.com"
).replace(/\/$/, "");

// The service's allowlist. SPEED_AND_DISTANCE exists upstream but is rejected
// here, so it is deliberately absent.
export const SOCCER_MODES = [
  { key: "RADAR", label: "Radar", hint: "Full overhead view with player tracking" },
  { key: "PLAYER_TRACKING", label: "Player tracking", hint: "Follow players through the clip" },
  { key: "PLAYER_DETECTION", label: "Players", hint: "Box every player" },
  { key: "BALL_DETECTION", label: "Ball", hint: "Track the ball" },
  { key: "TEAM_CLASSIFICATION", label: "Teams", hint: "Split players by kit colour" },
  { key: "PITCH_DETECTION", label: "Pitch", hint: "Detect pitch lines and keypoints" },
] as const;

export type SoccerMode = (typeof SOCCER_MODES)[number]["key"];

export type SoccerStatus = "queued" | "running" | "done" | "error";

// The deployed nginx caps the request body at 500 MB; fail before the upload
// rather than after, since a rejection there returns an HTML error page, not
// JSON. Kept below the server limit to leave room for multipart overhead.
export const MAX_VIDEO_BYTES = 450 * 1024 * 1024;

export class SoccerError extends Error {}

export async function uploadClip(
  video: { uri: string; name: string; mimeType?: string | null },
  mode: SoccerMode
): Promise<string> {
  const form = new FormData();
  // React Native's FormData takes this shape for file parts; the type assertion
  // is required because the DOM lib types expect a Blob.
  form.append("video", {
    uri: video.uri,
    name: video.name || "clip.mp4",
    type: video.mimeType || "video/mp4",
  } as unknown as Blob);
  form.append("mode", mode);

  // Content-Type is intentionally unset so the runtime supplies the multipart
  // boundary.
  const res = await fetch(`${SOCCER_API_BASE}/api/soccer/sessions`, {
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

// The result is an MP4 stream, so this URL is handed straight to the player
// rather than downloaded into memory.
export function resultUrl(sessionId: string): string {
  return `${SOCCER_API_BASE}/api/soccer/sessions/${encodeURIComponent(sessionId)}/result`;
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
