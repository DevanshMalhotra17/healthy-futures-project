import { apiDelete, apiGet, apiPost } from "./client";

export type Role = "coach" | "student";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};

export type AuthResult = { token: string; user: AuthUser };
export type AuthErrorBody = { error: string };

export type MeUser = AuthUser & {
  coach: { id: string; fullName: string; email: string } | null;
  inviteCode: string | null;
};

export type MeResult = { user: MeUser };

export async function signup(
  email: string,
  password: string,
  fullName: string,
  role: Role,
  inviteCode?: string
): Promise<AuthResult> {
  return apiPost<AuthResult>("/auth/signup", {
    email,
    password,
    fullName,
    role,
    ...(role === "student" ? { inviteCode } : {}),
  });
}

export async function login(email: string, password: string): Promise<AuthResult> {
  return apiPost<AuthResult>("/auth/login", { email, password });
}

export async function me(token: string): Promise<MeResult> {
  return apiGet<MeResult>("/auth/me", token);
}

// Sends a 6-digit code. The response is intentionally the same whether or not
// the email has an account, so this can't be used to discover who's registered.
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiPost<{ sent: boolean; message: string }>("/auth/forgot-password", { email });
}

export async function confirmPasswordReset(
  email: string,
  code: string,
  password: string
): Promise<void> {
  await apiPost<{ reset: boolean }>("/auth/reset-password", { email, code, password });
}

// Permanent and irreversible. The password is re-checked server-side so a
// stolen token alone can't erase someone's account.
export async function deleteAccount(password: string, token: string): Promise<void> {
  await apiDelete<{ deleted: boolean }>("/auth/account", token, { password });
}
