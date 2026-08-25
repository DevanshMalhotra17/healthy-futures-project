import { Request, Response, NextFunction, RequestHandler } from "express";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Thrown by routes to signal a deliberate, client-facing failure.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Without this, any rejected promise inside an async handler escapes Express
// and becomes an unhandled rejection, which terminates the process.
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found." });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // Log only the message — pg error objects carry the failing query and its
  // bound parameters, which can include credentials and other PII.
  const message = err instanceof Error ? err.message : String(err);
  console.error("Unhandled request error:", message);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}
