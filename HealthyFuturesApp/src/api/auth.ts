import { apiGet, apiPost } from "./client";

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
