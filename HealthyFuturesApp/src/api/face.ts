import { apiDelete, apiGet, apiPut } from "./client";
import { SOCCER_API_BASE } from "./soccer";

export type FaceEnrollment = {
  enrolled: boolean;
  enrollment: { consent_by: string; consent_at: string; created_at: string } | null;
};

export class FaceError extends Error {}

// The photo goes to the analyzer only to be converted into an embedding; it is
// held in memory there and never written to disk, and only the embedding is
// stored against the account.
export async function embedFace(photo: {
  uri: string;
  name: string;
  mimeType?: string | null;
}): Promise<number[]> {
  const form = new FormData();
  form.append("photo", {
    uri: photo.uri,
    name: photo.name || "face.jpg",
    type: photo.mimeType || "image/jpeg",
  } as unknown as Blob);

  const res = await fetch(`${SOCCER_API_BASE}/api/soccer/embed-face`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    try {
      const parsed = JSON.parse(body) as { detail?: string };
      if (parsed.detail) throw new FaceError(parsed.detail);
    } catch (e) {
      if (e instanceof FaceError) throw e;
    }
    throw new FaceError(`Couldn't process that photo (${res.status}).`);
  }

  const data = (await res.json()) as { embedding?: number[] };
  if (!data.embedding?.length) {
    throw new FaceError("That photo didn't produce a usable result.");
  }
  return data.embedding;
}

export async function getFaceEnrollment(token?: string | null): Promise<FaceEnrollment> {
  return apiGet<FaceEnrollment>("/soccer/face", token);
}

export async function saveFaceEnrollment(
  embedding: number[],
  consentBy: string,
  token?: string | null
): Promise<void> {
  await apiPut("/soccer/face", { embedding, consent_by: consentBy }, token);
}

export async function deleteFaceEnrollment(token?: string | null): Promise<void> {
  await apiDelete("/soccer/face", token);
}
