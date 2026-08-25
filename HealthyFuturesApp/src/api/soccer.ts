// Talks directly to the soccer-ai-api service (YOLO video analysis), which is
// deployed separately from healthy-futures-api and takes no auth of its own.
// Override for local testing with EXPO_PUBLIC_SOCCER_API_BASE.
export const SOCCER_API_BASE = (
  process.env.EXPO_PUBLIC_SOCCER_API_BASE || "https://tachyonleap-api.demo.gomllabs.com"
).replace(/\/$/, "");

// Mirrors ALLOWED_MODES on the deployed analyzer (verified against the running
// container). Analytics modes come first — they produce the numbers a player
// actually wants; the detection modes below are visualisation only.
export const SOCCER_MODES = [
  { key: "SPEED_AND_DISTANCE", label: "Speed & distance", hint: "Sprint speeds and distance covered" },
  { key: "RADAR", label: "Radar", hint: "Overhead tactical view with player positions" },
  { key: "SPEED", label: "Speed", hint: "Per-player speed overlay" },
  { key: "DISTANCE", label: "Distance", hint: "Distance covered per player" },
  { key: "PASS_NETWORK", label: "Pass network", hint: "Who passed to whom" },
  { key: "DIRECTION", label: "Direction", hint: "Movement direction of each player" },
  { key: "PLAYER_TRACKING", label: "Player tracking", hint: "Follow players through the clip" },
  { key: "TEAM_CLASSIFICATION", label: "Teams", hint: "Split players by kit colour" },
  { key: "PLAYER_DETECTION", label: "Players", hint: "Box every player" },
  { key: "BALL_DETECTION", label: "Ball", hint: "Track the ball" },
  { key: "PITCH_DETECTION", label: "Pitch", hint: "Detect pitch lines and keypoints" },
  { key: "ALL", label: "Everything", hint: "Every overlay at once — slowest" },
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
