import { apiGet, apiPost } from "./client";

export type PracticeVideo = {
  id: string;
  caption: string | null;
  created_at: string;
  viewUrl: string;
};

export async function getUploadUrl(
  contentType: string,
  token?: string | null
): Promise<{ uploadUrl: string; key: string }> {
  return apiPost<{ uploadUrl: string; key: string }>(
    "/videos/upload-url",
    { contentType },
    token
  );
}

// Uploads the file straight to S3 using the presigned url from
// getUploadUrl -- this never goes through our own API server.
export async function uploadVideoFile(
  uploadUrl: string,
  fileUri: string,
  contentType: string
): Promise<void> {
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!putResponse.ok) {
    throw new Error(`Upload failed with status ${putResponse.status}`);
  }
}

export async function recordVideo(
  key: string,
  caption: string,
  token?: string | null
): Promise<PracticeVideo> {
  const data = await apiPost<{ video: PracticeVideo }>(
    "/videos",
    caption ? { key, caption } : { key },
    token
  );
  return data.video;
}

export async function listMyVideos(token?: string | null): Promise<PracticeVideo[]> {
  const data = await apiGet<{ videos: PracticeVideo[] }>("/videos", token);
  return data.videos || [];
}
