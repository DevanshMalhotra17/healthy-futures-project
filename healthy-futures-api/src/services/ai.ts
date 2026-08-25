import { pool } from "../db/pool";
import {
  ROUTINE_FIELDS,
  RoutineField,
  pickFields,
  upsertToday,
  summarize,
} from "../routes/routines";
import { RATED_CRITERIA } from "../routes/criteria";

const FITNESS_DAYS_TARGET = 3;

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

  if (role === "student") {
    tools.push(
      {
        name: "log_routine",
        description:
          "Mark at-home routine items done for today. Fitness: active_play (30-45 min), " +
          "ball_control (20 min), touches (50-100 each foot), stretch. " +
          "Habits: fruits_veggies, water, breakfast, sleep (8-10 hours).",
        input_schema: {
          type: "object",
          properties: Object.fromEntries(
            ROUTINE_FIELDS.map((f) => [f, { type: "boolean", description: `Mark ${f} done` }])
          ),
        },
      },
      {
        name: "get_routine",
        description: "Get today's at-home routine progress, weekly fitness days, and habit streak",
        input_schema: { type: "object", properties: {} },
      }
    );
  }

  if (role === "coach") {
    tools.push(
      {
        name: "get_roster",
        description: "Get the coach's student roster",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "rate_criterion",
        description:
          "Rate a student on one level-up criterion. Attendance is computed automatically " +
          "and cannot be set here.",
        input_schema: {
          type: "object",
          properties: {
            student_name: { type: "string", description: "Name of the student" },
            criterion: {
              type: "string",
              enum: [...RATED_CRITERIA],
              description: "Which criterion to rate",
            },
            met: { type: "boolean", description: "Whether the student meets it" },
          },
          required: ["student_name", "criterion", "met"],
        },
      },
      {
        name: "get_student_routine",
        description: "See how consistently a student is doing their at-home routine",
        input_schema: {
          type: "object",
          properties: { student_name: { type: "string", description: "Name of the student" } },
          required: ["student_name"],
        },
      }
    );
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
    case "log_routine":
      return logRoutine(role, pickFields(input), context);
    case "get_routine":
      return describeRoutine(context.userId, context.fullName);
    case "rate_criterion":
      return rateCriterion(
        role,
        String(input.student_name || ""),
        String(input.criterion || ""),
        Boolean(input.met),
        context
      );
    case "get_student_routine":
      return studentRoutine(role, String(input.student_name || ""), context);
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
  const base = `You are the Healthy Futures AI assistant, supporting a youth soccer and wellness program.
You help ${role}s with nutrition questions, attendance, the at-home routine, and level-up criteria.

The at-home routine is 4 fitness items (30-45 min active play, 20 min ball control,
50-100 touches each foot, stretching) done 3-5 days a week, plus 4 daily habits
(fruits & vegetables, water over sugary drinks, healthy breakfast, 8-10 hours sleep).

The 7 level-up criteria are attendance (90%+, computed from check-ins), positive attitude,
effort, coachability, skill development, character, and academic responsibility.
${role === "coach" ? "You may rate the 6 non-attendance criteria." : "Only your coach can rate criteria."}

Be concise, friendly, and encouraging. Keep replies to 1-3 sentences unless asked for detail.
You are talking to a young athlete or their coach, so avoid medical or dietary claims.`;

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

const ROUTINE_LABELS: Record<RoutineField, string> = {
  active_play: "active play",
  ball_control: "ball control",
  touches: "touches",
  stretch: "stretching",
  fruits_veggies: "fruits & veggies",
  water: "water",
  breakfast: "breakfast",
  sleep: "sleep",
};

async function logRoutine(
  role: string,
  updates: Partial<Record<RoutineField, boolean>>,
  context: UserContext
): Promise<string> {
  if (role !== "student") {
    return "The at-home routine is tracked by students. Ask me about a student's routine instead.";
  }
  const keys = Object.keys(updates) as RoutineField[];
  if (keys.length === 0) {
    return 'Tell me which part to log — for example "log 100 touches" or "I stretched and drank water today".';
  }

  await upsertToday(context.userId, updates);
  const summary = await summarize(context.userId);
  const named = keys.map((k) => ROUTINE_LABELS[k]).join(", ");
  const marked = keys.every((k) => updates[k]) ? "Logged" : "Updated";

  return (
    `✅ **${marked}: ${named}**\n` +
    `• Fitness days this week: ${summary.fitness_days_this_week}/${FITNESS_DAYS_TARGET}\n` +
    `• Habit streak: ${summary.habit_streak} day${summary.habit_streak === 1 ? "" : "s"}`
  );
}

async function describeRoutine(userId: string, name: string): Promise<string> {
  const result = await pool.query(
    `SELECT ${ROUTINE_FIELDS.join(", ")} FROM routine_logs
     WHERE user_id = $1 AND log_date = CURRENT_DATE`,
    [userId]
  );
  const today = result.rows[0];
  const summary = await summarize(userId);

  const done = today
    ? ROUTINE_FIELDS.filter((f) => today[f]).map((f) => ROUTINE_LABELS[f])
    : [];
  const remaining = today
    ? ROUTINE_FIELDS.filter((f) => !today[f]).map((f) => ROUTINE_LABELS[f])
    : ROUTINE_FIELDS.map((f) => ROUTINE_LABELS[f]);

  return (
    `🏃 **${name}'s routine today** (${done.length}/${ROUTINE_FIELDS.length})\n` +
    (done.length ? `• Done: ${done.join(", ")}\n` : "• Nothing logged yet today\n") +
    (remaining.length ? `• Left: ${remaining.join(", ")}\n` : "• All done — great work!\n") +
    `• Fitness days this week: ${summary.fitness_days_this_week}/${FITNESS_DAYS_TARGET}\n` +
    `• Habit streak: ${summary.habit_streak} day${summary.habit_streak === 1 ? "" : "s"}`
  );
}

async function rateCriterion(
  role: string,
  studentName: string,
  criterion: string,
  met: boolean,
  context: UserContext
): Promise<string> {
  if (role !== "coach") {
    return "Only a coach can rate the level-up criteria.";
  }
  if (criterion === "attendance") {
    return "Attendance is calculated from check-ins automatically, so I can't set it by hand.";
  }
  if (!(RATED_CRITERIA as readonly string[]).includes(criterion)) {
    return `I can rate: ${RATED_CRITERIA.join(", ")}.`;
  }

  const student = findStudent(studentName, context);
  if (!student) {
    return `I couldn't find "${studentName}" on your roster. Your students: ${
      context.roster.length ? context.roster.map((s) => s.full_name).join(", ") : "none yet"
    }.`;
  }

  // criterion is validated against RATED_CRITERIA above, so it is safe as an
  // identifier here; values stay parameterized.
  await pool.query(
    `INSERT INTO criteria_ratings (student_id, rated_by, ${criterion}, period)
     VALUES ($1, $2, $3, date_trunc('month', CURRENT_DATE)::date)
     ON CONFLICT (student_id, period)
     DO UPDATE SET ${criterion} = $3, rated_by = $2, updated_at = now()`,
    [student.id, context.userId, met]
  );

  const card = await pool.query(
    `SELECT (attitude::int + effort::int + coachability::int + skill::int
             + character::int + academics::int) AS met_count
     FROM criteria_ratings
     WHERE student_id = $1 AND period = date_trunc('month', CURRENT_DATE)::date`,
    [student.id]
  );
  const ratedMet = card.rows[0]?.met_count ?? 0;

  return (
    `✅ **${student.full_name}: ${criterion} ${met ? "met" : "not yet"}**\n` +
    `${ratedMet}/6 coach-rated criteria met this month (attendance counts separately).`
  );
}

async function studentRoutine(
  role: string,
  studentName: string,
  context: UserContext
): Promise<string> {
  if (role !== "coach") return "Only a coach can look up another player's routine.";
  const student = findStudent(studentName, context);
  if (!student) {
    return `I couldn't find "${studentName}" on your roster. Your students: ${
      context.roster.length ? context.roster.map((s) => s.full_name).join(", ") : "none yet"
    }.`;
  }
  return describeRoutine(student.id, student.full_name);
}

function findStudent(name: string, context: UserContext) {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    context.roster.find((s) => s.email.toLowerCase() === needle) ??
    context.roster.find((s) => s.full_name.toLowerCase().includes(needle))
  );
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

  // Routine questions are checked before score because "how's my routine?" also
  // matches the looser score keywords below.
  if (ROUTINE_QUERY.test(lower) && !lower.includes("score")) {
    if (role === "student") {
      return describeRoutine(context.userId, context.fullName);
    }
    const who = message.match(/(?:is|about|for)\s+([\w'-]+)/i)?.[1];
    if (who && !/^(my|the|a|it|there)$/i.test(who)) {
      return studentRoutine(role, who, context);
    }
  }

  // An explicit rating command is matched before the score keywords, since
  // "rate Sam attendance" would otherwise be read as a score lookup.
  if (role === "coach") {
    const rating = parseRatingIntent(message);
    if (rating) {
      return rateCriterion(role, rating.studentName, rating.criterion, rating.met, context);
    }
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

  if (role === "student") {
    const fields = parseRoutineIntent(message);
    if (Object.keys(fields).length > 0) {
      return logRoutine(role, fields, context);
    }
  }

  if (lower.includes("roster") && role === "coach") {
    return Promise.resolve(getRoster(context));
  }

  const help =
    role === "coach"
      ? '• **Check-ins** — "check Marcus in for Thursday"\n' +
        '• **Ratings** — "Marcus meets coachability"\n' +
        '• **Routine** — "how is Marcus doing at home?"\n' +
        '• **Roster** — "show my roster"\n' +
        '• **Score** — "score for Marcus"'
      : '• **Routine** — "log 100 touches" or "I stretched and drank water"\n' +
        '• **Progress** — "how\'s my routine?" or "how\'s my score looking?"\n' +
        '• **Nutrition** — "try veggie soup"\n' +
        '• **Check-ins** — "check me in for Soccer Training"';

  return Promise.resolve(`Hey ${context.fullName}! I can help with:\n${help}\n\nWhat would you like to do?`);
}

const ROUTINE_QUERY = /\b(routine|at home|at-home|streak|habits?)\b/;

// Phrases that map onto a routine field. Ordered longest-first within each
// field so "ball control" isn't swallowed by a looser "ball" match.
const ROUTINE_PHRASES: [RoutineField, RegExp][] = [
  ["ball_control", /\bball\s*control|dribbl/i],
  ["touches", /\btouch(es)?\b|\bjuggl/i],
  ["active_play", /\bactive play\b|\bexercis|\bworked?\s*out\b|\bworkout\b|\bran\b|\brunning\b/i],
  ["stretch", /\bstretch/i],
  ["fruits_veggies", /\bfruit|\bveg(gie|etable)?/i],
  ["water", /\bwater\b|\bhydrat/i],
  ["breakfast", /\bbreakfast\b/i],
  ["sleep", /\bslept\b|\bsleep\b|\bhours? of sleep\b|\bbed(time)?\b/i],
];

const NEGATION = /\b(didn'?t|did not|no|not|skip(ped)?|forgot|missed|haven'?t)\b/i;

// Only fires on statements, and only for phrases actually present, so "how's my
// routine?" reads as a query rather than a write.
function parseRoutineIntent(message: string): Partial<Record<RoutineField, boolean>> {
  const trimmed = message.trim();
  const out: Partial<Record<RoutineField, boolean>> = {};
  if (trimmed.endsWith("?")) return out;

  const negated = NEGATION.test(trimmed);
  for (const [field, pattern] of ROUTINE_PHRASES) {
    if (pattern.test(trimmed)) out[field] = !negated;
  }
  return out;
}

const CRITERION_ALIASES: [string, RegExp][] = [
  // Listed so an explicit rating attempt gets the "this is computed" reply
  // rather than falling through to the score handler.
  ["attendance", /\battendance\b/i],
  ["attitude", /\battitude\b|\brespect/i],
  ["effort", /\beffort\b|\bhustl|\bworks? hard\b/i],
  ["coachability", /\bcoachab|\blistens?\b|\bapplies feedback\b/i],
  ["skill", /\bskill|\btechnical\b|\bimprov/i],
  ["character", /\bcharacter\b|\bsportsmanship\b|\bhonest/i],
  ["academics", /\bacadem|\bschool\b|\bgrades?\b/i],
];

function parseRatingIntent(
  message: string
): { studentName: string; criterion: string; met: boolean } | null {
  const trimmed = message.trim();
  if (trimmed.endsWith("?")) return null;

  const criterion = CRITERION_ALIASES.find(([, re]) => re.test(trimmed))?.[0];
  if (!criterion) return null;

  // "rate Marcus coachable", "Marcus meets effort", "mark Marcus as coachable"
  const name =
    trimmed.match(/\b(?:rate|mark|give|set)\s+([\w'-]+)/i)?.[1] ??
    trimmed.match(/^([\w'-]+)\s+(?:meets|has|shows|is|needs|does)/i)?.[1];
  if (!name) return null;

  return { studentName: name, criterion, met: !NEGATION.test(trimmed) };
}
