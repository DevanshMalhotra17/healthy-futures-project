import Constants from "expo-constants";

const API_PORT = 3000;
// Plenty for a normal CRUD round trip (measured at 130-200ms in production).
const REQUEST_TIMEOUT_MS = 20_000;
// Anything that waits on a model is a different order of magnitude: a vision
// call on a phone photo measured 10-22s against production, so 15s was aborting
// perfectly good requests roughly a third of the time.
const AI_TIMEOUT_MS = 90_000;
// Matched by prefix, so /recipe-recommendation and friends get the long budget.
const AI_PATHS = [
  "/recipe-recommendation",
  "/zenfit",
  "/messages",
  "/sessions/import-photo",
  "/soccer",
];

function timeoutFor(path: string): number {
  return AI_PATHS.some((p) => path.startsWith(p)) ? AI_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

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
  const timer = setTimeout(() => controller.abort(), timeoutFor(path));

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    // A timeout and an unreachable server are different problems, and telling
    // someone to "check your connection" when the request was simply slow sends
    // them chasing the wrong thing.
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError("That took too long to come back. Try again.", 0);
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
  token?: string | null,
  body?: unknown
): Promise<TResponse> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  return request<TResponse>(path, {
    method: "DELETE",
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export async function apiGet<TResponse>(path: string, token?: string | null): Promise<TResponse> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  return request<TResponse>(path, { headers });
}
