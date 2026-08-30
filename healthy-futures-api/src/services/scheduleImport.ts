import { getClient, isConfigured, MODEL } from "./anthropic";

export type ExtractedSession = {
  title: string;
  location: string | null;
  // Local wall-clock strings, deliberately not UTC: a photographed schedule says
  // "Tuesday 4:30pm", which only means something in the reader's own timezone.
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM, 24h
  endTime: string | null;
  confidence: "high" | "medium" | "low";
};

export type ExtractionResult = {
  sessions: ExtractedSession[];
  note: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sessions", "note"],
  properties: {
    sessions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "location", "date", "startTime", "endTime", "confidence"],
        properties: {
          title: {
            type: "string",
            description:
              "Short name for the session, e.g. 'Practice', 'Scrimmage', 'Team meeting'. If the image gives no name, use 'Practice'.",
          },
          location: {
            type: ["string", "null"],
            description: "Venue exactly as written, or null if not shown.",
          },
          date: {
            type: "string",
            description:
              "Calendar date as YYYY-MM-DD. Resolve weekday names against the reference date supplied in the prompt.",
          },
          startTime: {
            type: "string",
            description: "24-hour start time as HH:MM.",
          },
          endTime: {
            type: ["string", "null"],
            description: "24-hour end time as HH:MM, or null if not shown.",
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "How legible this row was. Use 'low' for handwriting you had to guess at, so the coach knows to double-check it.",
          },
        },
      },
    },
    note: {
      type: ["string", "null"],
      description:
        "One short sentence if something was unclear or ambiguous, otherwise null.",
    },
  },
} as const;

const NOT_CONFIGURED = "Schedule import isn't available — the server has no AI key configured.";

// Reads a photographed or screenshotted schedule and returns candidate sessions.
// Nothing is written to the database here: the coach confirms first, because a
// misread time would send students to practice at the wrong hour.
export async function extractSchedule(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
  referenceDate: string
): Promise<ExtractionResult> {
  if (!isConfigured()) throw new Error(NOT_CONFIGURED);
  const client = getClient();
  if (!client) throw new Error(NOT_CONFIGURED);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: [
              "This is a youth soccer team's training schedule, photographed or screenshotted by their coach.",
              "Extract every training session, practice, scrimmage, game or meeting you can see.",
              "",
              `Today's date is ${referenceDate}. Use it to resolve relative references:`,
              "- A bare weekday like 'Tuesday' means the next occurrence on or after today.",
              "- A date with no year belongs to the year that keeps it closest to today.",
              "- Ignore rows that are clearly not sessions (headers, notes, phone numbers).",
              "",
              "Times: convert to 24-hour HH:MM. '4:30' on a youth schedule means 16:30, not 04:30, unless the image clearly says AM.",
              "If a row spans a range like '4:30-6:00', set startTime and endTime.",
              "",
              "Mark confidence 'low' for anything you had to guess at. Do not invent sessions you cannot see.",
            ].join("\n"),
          },
        ],
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("The model returned no schedule data.");
  }

  const parsed = JSON.parse(block.text) as ExtractionResult;
  return {
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions.filter(isPlausible) : [],
    note: parsed.note ?? null,
  };
}

// The schema constrains shape but not sanity; drop anything that couldn't be a
// real session so the coach's confirmation list stays trustworthy.
function isPlausible(s: ExtractedSession): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return false;
  if (!/^\d{2}:\d{2}$/.test(s.startTime)) return false;
  if (s.endTime !== null && !/^\d{2}:\d{2}$/.test(s.endTime)) return false;
  const when = new Date(`${s.date}T${s.startTime}:00`);
  if (Number.isNaN(when.getTime())) return false;
  // A schedule photographed today shouldn't contain sessions years away.
  const yearsOut = Math.abs(when.getTime() - Date.now()) / (365 * 24 * 3600 * 1000);
  return yearsOut <= 2;
}
