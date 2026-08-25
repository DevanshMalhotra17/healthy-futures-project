import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthedUser = {
  userId: string;
  role: "coach" | "student";
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

const MIN_SECRET_LENGTH = 32;

// Secrets that shipped in the repo or read as obvious guesses. A forged token
// grants any user's identity, so these must never reach a deployed instance.
const KNOWN_WEAK_SECRETS = new Set([
  "healthyfutures",
  "secret",
  "changeme",
  "development",
  "test",
]);

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set.");
  }
  return secret;
}

// Called once at startup so a misconfigured deploy fails immediately and
// loudly, rather than issuing forgeable tokens for a month.
export function assertAuthConfig(): void {
  const secret = getJwtSecret();
  const isProduction = process.env.NODE_ENV === "production";
  const weak =
    KNOWN_WEAK_SECRETS.has(secret.toLowerCase()) || secret.length < MIN_SECRET_LENGTH;

  if (!weak) return;

  const detail =
    `JWT_SECRET is weak (needs ${MIN_SECRET_LENGTH}+ chars and must not be a known default). ` +
    `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;

  if (isProduction) {
    throw new Error(detail);
  }
  console.warn(`WARNING: ${detail}`);
}

export function signToken(user: AuthedUser): string {
  return jwt.sign(user, getJwtSecret(), { expiresIn: "30d" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header." });
  }
  const token = header.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthedUser;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

export function requireRole(role: "coach" | "student") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: `This action requires a ${role} account.` });
    }
    next();
  };
}
