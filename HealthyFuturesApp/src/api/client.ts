// healthy-futures-api, once deployed to the box (its own subdomain, its own port).
// Update this once it's actually live — see healthy-futures-api/README.md for deploy steps.
export const API_BASE_URL = "http://10.0.0.87:3000/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiPost<TResponse>(
  path: string,
  body: unknown,
  token?: string | null
): Promise<TResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(text || `Request failed with status ${res.status}`, res.status);
  }

  return (await res.json()) as TResponse;
}

export async function apiGet<TResponse>(path: string, token?: string | null): Promise<TResponse> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { headers });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(text || `Request failed with status ${res.status}`, res.status);
  }

  return (await res.json()) as TResponse;
}
