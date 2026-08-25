import { pool } from "../db/pool";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

// Must match HealthScoreCard's expectation on the client so a student's
// attendance reads the same on the Home screen and from the assistant.
const EXPECTED_CHECKINS_PER_30_DAYS = 8;

export async function generateAiReply(
  userEmail: string,
  role: "coach" | "student",
  message: string
): Promise<string> {
  const context = await gatherContext(userEmail, role);
  if (!context.userId) {
    return "I couldn't load your account just now. Please try again.";
  }
  const systemPrompt = buildSystemPrompt(role, context);

  if (!ANTHROPIC_API_KEY) {
    return handleLocally(message, role, userEmail, context);
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
        tools: getTools(role),
      }),
    });

    if (!res.ok) {
      console.error("Anthropic API error:", res.status, await res.text());
      return handleLocally(message, role, userEmail, context);
    }

    const data = await res.json() as AnthropicResponse;
    return await processResponse(data, userEmail, role, context);
  } catch (error) {
    console.error("AI service error:", error);
    return handleLocally(message, role, userEmail, context);
  }
}

type AnthropicResponse = {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  stop_reason: string;
};

async function processResponse(
  data: AnthropicResponse,
  userEmail: string,
  role: "coach" | "student",
  context: UserContext
): Promise<string> {
  const parts: string[] = [];

  for (const block of data.content) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    }
    if (block.type === "tool_use" && block.name && block.input) {
      const result = await executeTool(block.name, block.input, userEmail, role, context);
      parts.push(result);
    }
  }

  return parts.join("\n\n") || "I'm not sure how to help with that. Try asking about nutrition, your score, or check-ins.";
}

function getTools(role: "coach" | "student") {
  const tools: unknown[] = [
    {
      name: "analyze_recipe",
      description: "Analyze a recipe or food item for nutritional value and health score",
      input_schema: {
        type: "object",
        properties: {
          recipe_text: { type: "string", description: "The recipe or food item to analyze" },
        },
        required: ["recipe_text"],
      },
    },
    {
      name: "get_score",
      description: "Get the user's current score/progress including attendance and criteria",
      input_schema: {
        type: "object",
        properties: {
          student_email: { type: "string", description: "Email of student (coaches only, omit for self)" },
        },
      },
    },
    {
      name: "check_in",
      description: "Check in a student for a session/practice",
      input_schema: {
        type: "object",
        properties: {
          session_label: { type: "string", description: "Name of the session (e.g. 'Soccer Training - Thursday')" },
          student_name: { type: "string", description: "Name of the student to check in (coaches only)" },
        },
        required: ["session_label"],
      },
    },
  ];

  if (role === "coach") {
    tools.push({
      name: "get_roster",
      description: "Get the coach's student roster",
      input_schema: { type: "object", properties: {} },
    });
  }

  return tools;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userEmail: string,
  role: "coach" | "student",
  context: UserContext
): Promise<string> {
  switch (name) {
    case "analyze_recipe":
      return analyzeRecipe(String(input.recipe_text || ""));
    case "get_score":
      return getScore(userEmail, role, input.student_email as string | undefined, context);
    case "check_in":
      return checkIn(
        userEmail,
        role,
        normalizeSessionLabel(input.session_label as string | undefined),
        input.student_name as string | undefined,
        context
      );
    case "get_roster":
      return getRoster(context);
    default:
      return "I don't know how to do that yet.";
  }
}

type UserContext = {
  userId: string;
  fullName: string;
  checkinCount: number;
  recentCheckins: Array<{ session_label: string; checked_in_at: string }>;
  roster: Array<{ id: string; full_name: string; email: string }>;
};

async function gatherContext(email: string, role: string): Promise<UserContext> {
  const userResult = await pool.query(
    "SELECT id, full_name FROM users WHERE email = $1",
    [email]
  );
  const user = userResult.rows[0];
  if (!user) return { userId: "", fullName: "", checkinCount: 0, recentCheckins: [], roster: [] };

  const checkinCount = await pool.query(
    `SELECT COUNT(*)::int AS c FROM checkins
     WHERE user_id = $1 AND checked_in_at >= now() - interval '30 days'`,
    [user.id]
  );

  const recentCheckins = await pool.query(
    `SELECT session_label, checked_in_at FROM checkins
     WHERE user_id = $1 ORDER BY checked_in_at DESC LIMIT 5`,
    [user.id]
  );

  let roster: Array<{ id: string; full_name: string; email: string }> = [];
  if (role === "coach") {
    const rosterResult = await pool.query(
      `SELECT u.id, u.full_name, u.email FROM coach_student_links l
       JOIN users u ON u.id = l.student_id WHERE l.coach_id = $1`,
      [user.id]
    );
    roster = rosterResult.rows;
  }

  return {
    userId: user.id,
    fullName: user.full_name,
    checkinCount: checkinCount.rows[0].c,
    recentCheckins: recentCheckins.rows,
    roster,
  };
}

function buildSystemPrompt(role: "coach" | "student", context: UserContext): string {
  const base = `You are the Healthy Futures AI assistant. You help ${role}s with their health, fitness, and sports program.
You can analyze nutrition/recipes, check attendance scores, and handle session check-ins.
Be concise, friendly, and encouraging. Use short responses (1-3 sentences unless detailed info is requested).`;

  const contextInfo = `
The user's name is ${context.fullName}.
They have ${context.checkinCount} check-ins in the last 30 days.`;

  const rosterInfo = role === "coach" && context.roster.length > 0
    ? `\nTheir roster: ${context.roster.map(s => s.full_name).join(", ")}.`
    : "";

  return base + contextInfo + rosterInfo;
}

async function analyzeRecipe(recipeText: string): Promise<string> {
  const lower = recipeText.toLowerCase();
  let score = 7;
  const notes: string[] = [];

  if (lower.includes("veggie") || lower.includes("vegetable") || lower.includes("salad")) {
    score = 9;
    notes.push("Great vegetable content");
  }
  if (lower.includes("soup") || lower.includes("broth")) {
    score = Math.min(score + 1, 10);
    notes.push("Soups are hydrating and easy to digest");
  }
  if (lower.includes("fried") || lower.includes("chips") || lower.includes("soda")) {
    score = Math.max(score - 3, 2);
    notes.push("High in processed fats/sugars");
  }
  if (lower.includes("protein") || lower.includes("chicken") || lower.includes("fish") || lower.includes("beans")) {
    score = Math.min(score + 1, 10);
    notes.push("Good protein source for recovery");
  }
  if (lower.includes("fruit") || lower.includes("berry") || lower.includes("banana")) {
    score = Math.min(score + 1, 10);
    notes.push("Natural vitamins and energy");
  }

  if (notes.length === 0) notes.push("Looks like a balanced choice");

  return `🥗 **Nutrition Score: ${score}/10**\n${notes.join(". ")}.\n\nFor a young athlete, ${score >= 7 ? "this is a solid choice! Keep it up." : "consider adding more whole foods and vegetables."}`;
}

async function getScore(
  userEmail: string,
  role: string,
  studentTerm: string | undefined,
  context: UserContext
): Promise<string> {
  let targetId = context.userId;
  let targetName = context.fullName;

  // Accept either an email or a name fragment, so "score for Marcus" resolves
  // instead of silently reporting the asker's own score.
  if (studentTerm && role === "coach") {
    const needle = studentTerm.trim().toLowerCase();
    const student =
      context.roster.find((s) => s.email.toLowerCase() === needle) ??
      context.roster.find((s) => s.full_name.toLowerCase().includes(needle));
    if (!student) {
      return `I couldn't find "${studentTerm}" on your roster. Your students: ${
        context.roster.length > 0
          ? context.roster.map((s) => s.full_name).join(", ")
          : "none yet"
      }.`;
    }
    targetId = student.id;
    targetName = student.full_name;
  }

  const checkins = await pool.query(
    `SELECT COUNT(*)::int AS c FROM checkins
     WHERE user_id = $1 AND checked_in_at >= now() - interval '30 days'`,
    [targetId]
  );
  const count = checkins.rows[0].c;
  const attendance = Math.min(100, Math.round((count / EXPECTED_CHECKINS_PER_30_DAYS) * 100));
  const plural = count === 1 ? "check-in" : "check-ins";

  return `📊 **${targetName}'s Score**\n• Attendance: ${attendance}% (${count} ${plural} last 30 days)\n• Status: ${attendance >= 90 ? "Excellent — on track!" : attendance >= 70 ? "Good — keep showing up!" : "Needs improvement — let's get to more sessions!"}`;
}

async function checkIn(
  userEmail: string,
  role: string,
  sessionLabel: string,
  studentName: string | undefined,
  context: UserContext
): Promise<string> {
  let targetId = context.userId;
  let targetName = context.fullName;

  if (studentName && role === "coach") {
    const match = context.roster.find(s =>
      s.full_name.toLowerCase().includes(studentName.toLowerCase())
    );
    if (!match) {
      return `I couldn't find a student named "${studentName}" on your roster. Your students: ${context.roster.map(s => s.full_name).join(", ")}.`;
    }
    targetId = match.id;
    targetName = match.full_name;
  }

  if (role === "student" && studentName) {
    return "Students can only check themselves in.";
  }

  await pool.query(
    "INSERT INTO checkins (user_id, session_label) VALUES ($1, $2)",
    [targetId, sessionLabel]
  );

  return `✅ **Checked in!** ${targetName} is now marked present for "${sessionLabel}".`;
}

function getRoster(context: UserContext): string {
  if (context.roster.length === 0) {
    return "Your roster is empty. Students join by signing up with your invite code.";
  }
  const list = context.roster.map((s, i) => `${i + 1}. ${s.full_name} (${s.email})`).join("\n");
  const n = context.roster.length;
  return `📋 **Your Roster** (${n} student${n === 1 ? "" : "s"})\n${list}`;
}

const WEEKDAYS = /^(mon|tues|wednes|thurs|fri|satur|sun)day$/i;

// A bare weekday ("Thursday") is a date, not a session name — label it so the
// stored check-in still reads sensibly in attendance history.
function normalizeSessionLabel(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "Training Session";
  if (WEEKDAYS.test(trimmed)) {
    const day = trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase();
    return `Training Session — ${day}`;
  }
  return trimmed;
}

// Recording attendance mutates data that feeds a student's score, so the
// fallback parser only fires on an explicit imperative check-in — never on
// incidental phrasing like "I was checking my information".
const CHECK_IN_PATTERNS: RegExp[] = [
  // "check Marcus in for Thursday" / "check me in"
  /\bcheck\s+([\w'-]+)\s+in\b(?:\s+(?:for|to)\s+(.+))?$/i,
  // "check in for Soccer Training" / "check in"
  /\bcheck[-\s]?in\b(?:\s+(?:for|to)\s+(.+))?$/i,
  // "mark Marcus present for Friday"
  /\bmark\s+([\w'-]+)\s+(?:as\s+)?(?:present|attended)\b(?:\s+(?:for|to)\s+(.+))?$/i,
];

const SELF_REFERENCE = /^(me|myself|i|us|in)$/i;

function parseCheckInIntent(
  message: string
): { studentName?: string; session?: string } | null {
  const trimmed = message.trim();
  // A question is a query, not a command.
  if (trimmed.endsWith("?")) return null;

  for (const [index, pattern] of CHECK_IN_PATTERNS.entries()) {
    const m = trimmed.match(pattern);
    if (!m) continue;

    // The bare "check in" form has no name group.
    const hasNameGroup = index !== 1;
    const rawName = hasNameGroup ? m[1] : undefined;
    const session = (hasNameGroup ? m[2] : m[1])?.trim();
    const studentName =
      rawName && !SELF_REFERENCE.test(rawName) ? rawName : undefined;

    return { studentName, session };
  }
  return null;
}

function handleLocally(
  message: string,
  role: "coach" | "student",
  userEmail: string,
  context: UserContext
): Promise<string> {
  const lower = message.toLowerCase();

  if (lower.includes("recipe") || lower.includes("nutrition") || lower.includes("food") ||
      lower.includes("soup") || lower.includes("meal") || lower.includes("eat")) {
    const foodMatch = message.match(/(?:try|analyze|check|with|about)\s+["']?(.+?)["']?$/i);
    const food = foodMatch?.[1] || message;
    return analyzeRecipe(food);
  }

  if (lower.includes("score") || lower.includes("how am i") || lower.includes("progress") ||
      lower.includes("attendance") || lower.includes("how's my")) {
    // "score for Marcus" / "how is Marcus doing" — coaches may ask about a student.
    const about = role === "coach"
      ? message.match(/(?:for|about|of|is)\s+([\w'-]+)\s*\??$/i)?.[1]
      : undefined;
    const term = about && !/^(me|my|mine|i|us|it|that|today)$/i.test(about) ? about : undefined;
    return getScore(userEmail, role, term, context);
  }

  const checkInIntent = parseCheckInIntent(message);
  if (checkInIntent) {
    return checkIn(
      userEmail,
      role,
      normalizeSessionLabel(checkInIntent.session),
      role === "coach" ? checkInIntent.studentName : undefined,
      context
    );
  }

  if (lower.includes("roster") && role === "coach") {
    return Promise.resolve(getRoster(context));
  }

  return Promise.resolve(
    `Hey ${context.fullName}! I can help you with:\n• **Nutrition** — "try veggie soup" or "analyze chicken stir fry"\n• **Score** — "how's my score looking?"\n• **Check-ins** — "${role === "coach" ? "check Student A in for Thursday" : "check me in for Soccer Training"}"\n${role === "coach" ? '• **Roster** — "show my roster"' : ""}\n\nWhat would you like to do?`
  );
}
