import Constants from "expo-constants";

const API_PORT = 3000;
const REQUEST_TIMEOUT_MS = 15_000;

// In Expo Go the packager host is the dev machine's LAN IP, which is also where
// healthy-futures-api runs — so deriving it beats hardcoding an address that
// changes with DHCP. Set EXPO_PUBLIC_API_BASE_URL to point somewhere else
// (staging, a tunnel, or production).
function resolveBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, "");

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  const host = hostUri?.split("?")[0]?.split(":")[0];
  if (host) return `http://${host}:${API_PORT}/api`;

  return `http://localhost:${API_PORT}/api`;
}

export const API_BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Without a timeout an unreachable API (wrong LAN IP, server down) leaves the
// UI spinning indefinitely rather than surfacing an error.
async function request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError(`Couldn't reach the server at ${API_BASE_URL}.`, 0);
    }
    throw new ApiError(`Couldn't reach the server at ${API_BASE_URL}.`, 0);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(text || `Request failed with status ${res.status}`, res.status);
  }

  return (await res.json()) as TResponse;
}

export async function apiPost<TResponse>(
  path: string,
  body: unknown,
  token?: string | null
): Promise<TResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return request<TResponse>(path, { method: "POST", headers, body: JSON.stringify(body) });
}

export async function apiPut<TResponse>(
  path: string,
  body: unknown,
  token?: string | null
): Promise<TResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  return request<TResponse>(path, { method: "PUT", headers, body: JSON.stringify(body) });
}

export async function apiDelete<TResponse>(
  path: string,
  token?: string | null
): Promise<TResponse> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  return request<TResponse>(path, { method: "DELETE", headers });
}

export async function apiGet<TResponse>(path: string, token?: string | null): Promise<TResponse> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  return request<TResponse>(path, { headers });
}
