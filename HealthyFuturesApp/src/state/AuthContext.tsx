import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { login as apiLogin, signup as apiSignup, me as apiMe, Role } from "@/api/auth";
import { ApiError } from "@/api/client";

const TOKEN_KEY = "healthy_futures_auth_token";
const EMAIL_KEY = "healthy_futures_auth_email";
const FULL_NAME_KEY = "healthy_futures_auth_full_name";
const ROLE_KEY = "healthy_futures_auth_role";

type CoachInfo = { id: string; fullName: string } | null;

type AuthContextValue = {
  token: string | null;
  email: string | null;
  fullName: string | null;
  role: Role | null;
  coach: CoachInfo;
  inviteCode: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    fullName: string,
    role: Role,
    inviteCode?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function messageFromError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "That email or password isn't right.";
    if (e.status === 400 || e.status === 409) {
      try {
        const parsed = JSON.parse(e.message);
        if (parsed?.error) return String(parsed.error);
      } catch {
        // fall through to generic message
      }
      return "Couldn't create that account. Try a different email.";
    }
    return "Something went wrong on the server. Try again in a moment.";
  }
  return "Couldn't reach the server. Check your connection and try again.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [coach, setCoach] = useState<CoachInfo>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback(
    async (result: { token: string; email: string; fullName: string; role: Role }) => {
      await Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, result.token),
        SecureStore.setItemAsync(EMAIL_KEY, result.email),
        SecureStore.setItemAsync(FULL_NAME_KEY, result.fullName),
        SecureStore.setItemAsync(ROLE_KEY, result.role),
      ]);
      setToken(result.token);
      setEmail(result.email);
      setFullName(result.fullName);
      setRole(result.role);
    },
    []
  );

  // Best-effort fetch of the extra profile detail (coach link or invite code)
  // that only /auth/me returns. Never blocks the auth flow itself — if this
  // fails, the user is still logged in with what we already have.
  const refreshMe = useCallback(async (activeToken: string) => {
    try {
      const result = await apiMe(activeToken);
      setCoach(result.user.coach);
      setInviteCode(result.user.inviteCode);
    } catch {
      // Leave coach/inviteCode as-is; the rest of the app still works.
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedEmail, storedFullName, storedRole] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(EMAIL_KEY),
          SecureStore.getItemAsync(FULL_NAME_KEY),
          SecureStore.getItemAsync(ROLE_KEY),
        ]);
        setToken(storedToken);
        setEmail(storedEmail);
        setFullName(storedFullName);
        setRole((storedRole as Role) ?? null);
        if (storedToken) {
          await refreshMe(storedToken);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshMe]);

  const login = useCallback(
    async (loginEmail: string, password: string) => {
      try {
        const result = await apiLogin(loginEmail, password);
        await persist({
          token: result.token,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role,
        });
        await refreshMe(result.token);
      } catch (e) {
        throw new Error(messageFromError(e));
      }
    },
    [persist, refreshMe]
  );

  const signup = useCallback(
    async (
      signupEmail: string,
      password: string,
      signupFullName: string,
      signupRole: Role,
      inviteCodeInput?: string
    ) => {
      try {
        const result = await apiSignup(
          signupEmail,
          password,
          signupFullName,
          signupRole,
          inviteCodeInput
        );
        await persist({
          token: result.token,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role,
        });
        await refreshMe(result.token);
      } catch (e) {
        throw new Error(messageFromError(e));
      }
    },
    [persist, refreshMe]
  );

  const logout = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(EMAIL_KEY),
      SecureStore.deleteItemAsync(FULL_NAME_KEY),
      SecureStore.deleteItemAsync(ROLE_KEY),
    ]);
    setToken(null);
    setEmail(null);
    setFullName(null);
    setRole(null);
    setCoach(null);
    setInviteCode(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, email, fullName, role, coach, inviteCode, loading, login, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
