import "dotenv/config";
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
import { errorHandler, notFoundHandler } from "./middleware/errors";
import { assertAuthConfig } from "./middleware/auth";
import { pool } from "./db/pool";

assertAuthConfig();

const app = express();
const PORT = process.env.PORT || 8090;

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: corsOrigins() }));
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
app.use("/api/auth", authRoutes);
app.use("/api/coach", coachRoutes);
app.use("/api/messages", messageLimiter, messagesRoutes);
app.use("/api/checkins", checkinsRoutes);
app.use("/api/routines", routinesRoutes);
app.use("/api/criteria", criteriaRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`healthy-futures-api listening on port ${PORT}`);
});

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
