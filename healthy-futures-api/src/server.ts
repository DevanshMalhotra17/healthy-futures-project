import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth";
import coachRoutes from "./routes/coach";
import messagesRoutes from "./routes/messages";
import checkinsRoutes from "./routes/checkins";
import routinesRoutes from "./routes/routines";
import criteriaRoutes from "./routes/criteria";
import sessionsRoutes from "./routes/sessions";
import nutritionRoutes from "./routes/nutrition";
import primefitRoutes from "./routes/primefit";
import zenfitRoutes from "./routes/zenfit";
import soccerRoutes from "./routes/soccer";
import nudgesRoutes from "./routes/nudges";
import trendsRoutes from "./routes/trends";
import widgetRoutes from "./routes/widget";
import profileRoutes from "./routes/profile";
import videosRoutes, { purgeExpiredVideos } from "./routes/videos";
import { runAll } from "./services/nudgeRunner";
import { errorHandler, notFoundHandler } from "./middleware/errors";
import { assertAuthConfig } from "./middleware/auth";
import { pool } from "./db/pool";

assertAuthConfig();

const app = express();
const PORT = Number(process.env.PORT) || 8090;

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: corsOrigins() }));
// Meal photos arrive as base64 in the JSON body, so that one route needs a
// bigger ceiling than the 1 MB everything else gets. Registered first so it
// wins for its own path. (Schedule photos use multipart, not this parser.)
app.use("/api/recipe-recommendation", express.json({ limit: "8mb" }));
app.use(express.json({ limit: "1mb" }));

// Credential endpoints are the brute-force target, so they get a tighter
// budget than the rest of the API.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

// The assistant costs real tokens per message, so cap conversational volume.
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're sending messages too quickly. Please slow down." },
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "healthy-futures-api", database: "ok" });
  } catch {
    res.status(503).json({ status: "degraded", service: "healthy-futures-api", database: "down" });
  }
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
// A 6-digit reset code is only safe because guesses are throttled: 10 tries per
// 15 minutes makes brute force impractical inside the 30-minute expiry.
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/coach", coachRoutes);
app.use("/api/messages", messageLimiter, messagesRoutes);
app.use("/api/checkins", checkinsRoutes);
app.use("/api/routines", routinesRoutes);
app.use("/api/criteria", criteriaRoutes);
app.use("/api/sessions", sessionsRoutes);
// The frontend's nutrition client posts to /api/recipe-recommendation.
app.use("/api/recipe-recommendation", messageLimiter, nutritionRoutes);
app.use("/api/primefit-results", primefitRoutes);
app.use("/api/zenfit", messageLimiter, zenfitRoutes);
app.use("/api/soccer", soccerRoutes);
app.use("/api/nudges", nudgesRoutes);
app.use("/api/trends", trendsRoutes);
app.use("/api/widget", widgetRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/videos", videosRoutes);

// Public, unauthenticated: the App Store review team and parents must be able to
// read this without an account. Served from dist/public after build.
app.get(["/privacy", "/privacy.html"], (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "privacy.html"));
});

// Also public: the App Store listing requires a reachable support URL.
app.get(["/support", "/support.html"], (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "support.html"));
});

app.use(notFoundHandler);
app.use(errorHandler);

// In production nginx is the only thing that should reach this process, so bind
// to loopback rather than every interface — defence in depth if a firewall rule
// is ever loosened. Dev keeps the default so a phone on the LAN can connect.
const HOST = process.env.BIND_HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

const server = app.listen(PORT, HOST, () => {
  console.log(`healthy-futures-api listening on ${HOST}:${PORT}`);
});

// Nudge sweep. Rules are time-windowed and the per-kind/per-day guards live in
// the database, so a missed tick is harmless and a duplicate tick is a no-op.
// Set NUDGES_ENABLED=false to silence it (e.g. in local development).
const NUDGE_TICK_MS = 15 * 60 * 1000;
if (process.env.NUDGES_ENABLED !== "false") {
  const tick = setInterval(() => {
    runAll().catch((error) =>
      console.error(
        "Nudge sweep failed:",
        error instanceof Error ? error.message : String(error)
      )
    );
  }, NUDGE_TICK_MS);
  // Don't hold the process open on shutdown.
  tick.unref();
}

// Practice clips are deleted once past VIDEO_RETENTION_DAYS (default 90). Run
// once at boot and then daily, so a long-running server still cleans up.
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const purge = () =>
  purgeExpiredVideos()
    .then((n) => {
      if (n > 0) console.log(`Purged ${n} expired practice clip(s).`);
    })
    .catch((error) =>
      console.error(
        "Video purge failed:",
        error instanceof Error ? error.message : String(error)
      )
    );
purge();
setInterval(purge, PURGE_INTERVAL_MS).unref();

// Expired reset codes are unusable, but leaving them means a stale hash sits in
// the table indefinitely.
const sweepResets = () =>
  pool
    .query("DELETE FROM password_resets WHERE expires_at < now()")
    .catch(() => undefined);
sweepResets();
setInterval(sweepResets, PURGE_INTERVAL_MS).unref();

function corsOrigins() {
  const configured = process.env.CORS_ORIGINS?.trim();
  if (!configured) return true;
  return configured.split(",").map((o) => o.trim()).filter(Boolean);
}

// A crash mid-request would otherwise drop every in-flight connection and
// leak Postgres clients.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received — shutting down.`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason instanceof Error ? reason.message : reason);
});
