// "Today" is a local question, and this server runs on Etc/UTC.
//
// Every query that asked Postgres for CURRENT_DATE was really asking "what day is
// it in UTC", which is a different day from the athlete's evening. In US Eastern
// (UTC-4) anything after 20:00 local already belongs to tomorrow as far as the
// database is concerned, so evening practice, the meal photo at dinner and the
// practice clip filmed before bed all landed on the wrong day. That is precisely
// when a youth soccer programme happens.
//
// The client sends its IANA zone and the date arithmetic is done in that zone.
// The server still derives the date itself, so a client can't backdate its own
// streak by claiming an arbitrary day.

// Node ships full ICU, so Intl is the authoritative check for whether a zone name
// is real. Postgres accepts the same IANA names via AT TIME ZONE.
function isRealZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_TIME_ZONE = "UTC";

// Accepts whatever arrived on the request and returns a zone safe to interpolate
// into AT TIME ZONE. Anything unrecognised falls back to UTC, which is the old
// behaviour — wrong in the evening, but never an error.
export function resolveTimeZone(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_TIME_ZONE;
  const name = raw.trim();
  if (!name || name.length > 64) return DEFAULT_TIME_ZONE;
  // Cheap structural gate before handing an arbitrary string to ICU.
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(name)) {
    return DEFAULT_TIME_ZONE;
  }
  return isRealZone(name) ? name : DEFAULT_TIME_ZONE;
}
