import Anthropic from "@anthropic-ai/sdk";
import { pool } from "../db/pool";
import { getClient, isConfigured, MODEL } from "./anthropic";
import { analyzeRecipe, summarizeForChat } from "./nutrition";
import {
  ROUTINE_FIELDS,
  RoutineField,
  pickFields,
  upsertToday,
  summarize,
} from "../routes/routines";
import { RATED_CRITERIA } from "../routes/criteria";

const FITNESS_DAYS_TARGET = 3;
const EXPECTED_CHECKINS_PER_30_DAYS = 8;

// Enough turns for the model to chain a couple of tool calls and still answer.
const MAX_TURNS = 6;
// How much prior conversation to send back as context.
const HISTORY_LIMIT = 20;

const NOT_CONFIGURED =
  "The assistant isn't configured yet — an ANTHROPIC_API_KEY needs to be set on the " +
  "server. Once it is, you can ask me about nutrition, your routine, and your progress.";

export async function generateAiReply(
  userEmail: string,
  role: "coach" | "student",
  message: string
): Promise<string> {
  if (!isConfigured()) return NOT_CONFIGURED;

  const client = getClient();
  if (!client) return NOT_CONFIGURED;

  const context = await gatherContext(userEmail, role);
  if (!context.userId) {
    return "I couldn't load your account just now. Please try again.";
  }

  // Prior turns let the model resolve follow-ups like "what about the second one?".
  const history = await loadHistory(userEmail);
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: message },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(role, context),
      thinking: { type: "adaptive" },
      tools: getTools(role),
      messages,
    });

    if (response.stop_reason === "refusal") {
      return "I can't help with that one. Ask me about nutrition, your routine, or your progress.";
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    // No tool calls means this is the final answer.
    if (toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || "I'm not sure how to help with that one.";
    }

    // Echo the assistant turn verbatim (tool_use blocks included), then return
    // one tool_result per tool_use in a single user message.
    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      try {
        const output = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          role,
          context
        );
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: output });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`Tool ${toolUse.name} failed:`, detail);
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `That action failed: ${detail}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return "That took more steps than I can handle in one go — try asking for one thing at a time.";
}

// The assistant's own thread is the transcript, so history comes from there.
async function loadHistory(userEmail: string): Promise<Anthropic.MessageParam[]> {
  const AI_EMAIL = "assistant@healthyfutures.app";
  const result = await pool.query(
    `SELECT sender_email, content FROM direct_messages
     WHERE (sender_email = $1 AND receiver_email = $2)
        OR (sender_email = $2 AND receiver_email = $1)
     ORDER BY created_at DESC
     LIMIT $3`,
    [userEmail, AI_EMAIL, HISTORY_LIMIT]
  );

  const turns: Anthropic.MessageParam[] = result.rows
    .reverse()
    .map((r) => ({
      role: r.sender_email === AI_EMAIL ? ("assistant" as const) : ("user" as const),
      content: r.content as string,
    }));

  // The API requires the first message to be from the user.
  while (turns.length > 0 && turns[0].role === "assistant") turns.shift();
  return turns;
}

function getTools(role: "coach" | "student"): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [
    {
      name: "analyze_food",
      description:
        "Analyze a food, meal, or recipe for nutritional value and get a health score " +
        "for a young athlete. Call this whenever the user mentions something they ate, " +
        "are planning to eat, or asks whether a food is a good choice.",
      input_schema: {
        type: "object",
        properties: {
          food: {
            type: "string",
            description: "The food, meal, or recipe to analyze, e.g. 'veggie soup'",
          },
        },
        required: ["food"],
      },
    },
    {
      name: "get_progress",
      description:
        "Get attendance and level-up criteria progress. Call this when the user asks " +
        "how they (or, for a coach, a named student) are doing overall.",
      input_schema: {
        type: "object",
        properties: {
          student_name: {
            type: "string",
            description: "Student to look up. Coaches only; omit for the caller's own progress.",
          },
        },
      },
    },
  ];

  if (role === "student") {
    tools.push(
      {
        name: "log_routine",
        description:
          "Record at-home routine items for today. Fitness: active_play (30-45 min), " +
          "ball_control (20 min), touches (50-100 per foot), stretch. Habits: " +
          "fruits_veggies, water, breakfast, sleep (8-10 hours). Pass false to un-mark " +
          "something the user says they did not do.",
        input_schema: {
          type: "object",
          properties: Object.fromEntries(
            ROUTINE_FIELDS.map((f) => [f, { type: "boolean" }])
          ),
        },
      },
      {
        name: "get_routine",
        description:
          "Get today's at-home routine progress, weekly fitness days, and habit streak.",
        input_schema: { type: "object", properties: {} },
      }
    );
  }

  if (role === "coach") {
    tools.push(
      {
        name: "get_roster",
        description: "List the coach's students.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "mark_attendance",
        description:
          "Mark a student present for a session. Coach-only — students cannot mark " +
          "their own attendance. Attendance counts toward the level-up criteria.",
        input_schema: {
          type: "object",
          properties: {
            student_name: { type: "string" },
            session: {
              type: "string",
              description: "Which session, e.g. 'Soccer Training' or 'Thursday'",
            },
          },
          required: ["student_name", "session"],
        },
      },
      {
        name: "rate_criterion",
        description:
          "Rate a student on one level-up criterion. Attendance is computed from " +
          "sessions attended and cannot be set here.",
        input_schema: {
          type: "object",
          properties: {
            student_name: { type: "string" },
            criterion: { type: "string", enum: [...RATED_CRITERIA] },
            met: { type: "boolean" },
          },
          required: ["student_name", "criterion", "met"],
        },
      },
      {
        name: "get_student_routine",
        description: "See how consistently a student is doing their at-home routine.",
        input_schema: {
          type: "object",
          properties: { student_name: { type: "string" } },
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
  role: "coach" | "student",
  context: UserContext
): Promise<string> {
  switch (name) {
    case "analyze_food": {
      const food = String(input.food || "").trim();
      if (!food) return "No food was provided to analyze.";
      const analysis = await analyzeRecipe(food);
      return summarizeForChat(analysis, food);
    }
    case "get_progress":
      return getProgress(role, input.student_name as string | undefined, context);
    case "log_routine":
      return logRoutine(role, pickFields(input), context);
    case "get_routine":
      return describeRoutine(context.userId, context.fullName);
    case "get_roster":
      return getRoster(context);
    case "mark_attendance":
      return markAttendance(
        role,
        String(input.student_name || ""),
        String(input.session || ""),
        context
      );
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
    default:
      return `Unknown tool: ${name}`;
  }
}

type UserContext = {
  userId: string;
  fullName: string;
  roster: { id: string; full_name: string; email: string }[];
};

async function gatherContext(email: string, role: string): Promise<UserContext> {
  const userResult = await pool.query(
    "SELECT id, full_name FROM users WHERE email = $1",
    [email]
  );
  const user = userResult.rows[0];
  if (!user) return { userId: "", fullName: "", roster: [] };

  let roster: UserContext["roster"] = [];
  if (role === "coach") {
    const rosterResult = await pool.query(
      `SELECT u.id, u.full_name, u.email FROM coach_student_links l
       JOIN users u ON u.id = l.student_id WHERE l.coach_id = $1`,
      [user.id]
    );
    roster = rosterResult.rows;
  }

  return { userId: user.id, fullName: user.full_name, roster };
}

function buildSystemPrompt(role: "coach" | "student", context: UserContext): string {
  const program = `You are the Healthy Futures assistant for a youth soccer and wellness program.

The at-home routine is 4 fitness items (30-45 min active play, 20 min ball control,
50-100 touches each foot, stretching) done 3-5 days a week, plus 4 daily habits
(fruits & vegetables, water over sugary drinks, healthy breakfast, 8-10 hours sleep).

The 7 level-up criteria are attendance (90%+, computed from sessions attended), positive
attitude, effort, coachability, skill development, character, and academic responsibility.`;

  const rules =
    role === "coach"
      ? `You are talking to Coach ${context.fullName}. You may mark attendance and rate the
6 non-attendance criteria for students on their roster.
Roster: ${context.roster.length ? context.roster.map((s) => s.full_name).join(", ") : "no students yet"}.`
      : `You are talking to ${context.fullName}, a student athlete. Only their coach can mark
attendance or rate criteria — if they ask you to, explain that and suggest they message
their coach. You can log their at-home routine and look up their own progress.`;

  return `${program}

${rules}

Use your tools rather than guessing at numbers — never invent an attendance figure, a
streak, or a nutrition score. When a tool reports something, relay it faithfully.

Keep replies to 1-3 short sentences unless asked for detail. You are talking to a young
athlete or their coach: be encouraging, avoid medical or dietary claims, and never
diagnose or prescribe.`;
}

async function getProgress(
  role: string,
  studentTerm: string | undefined,
  context: UserContext
): Promise<string> {
  let targetId = context.userId;
  let targetName = context.fullName;

  if (studentTerm && role === "coach") {
    const student = findStudent(studentTerm, context);
    if (!student) {
      return `"${studentTerm}" isn't on your roster. Your students: ${
        context.roster.length ? context.roster.map((s) => s.full_name).join(", ") : "none yet"
      }.`;
    }
    targetId = student.id;
    targetName = student.full_name;
  }

  const attendance = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM sessions s
        JOIN coach_student_links l ON l.coach_id = s.coach_id
        WHERE l.student_id = $1 AND s.starts_at <= now()) AS held,
       (SELECT COUNT(*)::int FROM checkins c
        JOIN sessions s ON s.id = c.session_id
        WHERE c.user_id = $1 AND s.starts_at <= now()) AS attended,
       (SELECT COUNT(*)::int FROM checkins
        WHERE user_id = $1 AND checked_in_at >= now() - interval '30 days') AS recent`,
    [targetId]
  );
  const { held, attended, recent } = attendance.rows[0];

  const criteria = await pool.query(
    `SELECT (attitude::int + effort::int + coachability::int + skill::int
             + character::int + academics::int) AS met
     FROM criteria_ratings
     WHERE student_id = $1 AND period = date_trunc('month', CURRENT_DATE)::date`,
    [targetId]
  );
  const ratedMet = criteria.rows[0]?.met ?? 0;

  const attendanceLine =
    held > 0
      ? `${Math.round((attended / held) * 100)}% (${attended} of ${held} sessions)`
      : `${recent} check-in${recent === 1 ? "" : "s"} in 30 days; no sessions scheduled yet`;

  return `${targetName}: attendance ${attendanceLine}. Coach-rated criteria met: ${ratedMet}/6.`;
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
    return "The at-home routine is logged by students, not coaches.";
  }
  const keys = Object.keys(updates) as RoutineField[];
  if (keys.length === 0) {
    return "No routine items were specified.";
  }

  await upsertToday(context.userId, updates);
  const summary = await summarize(context.userId);
  const marked = keys.filter((k) => updates[k]).map((k) => ROUTINE_LABELS[k]);
  const cleared = keys.filter((k) => !updates[k]).map((k) => ROUTINE_LABELS[k]);

  const parts: string[] = [];
  if (marked.length) parts.push(`logged ${marked.join(", ")}`);
  if (cleared.length) parts.push(`un-marked ${cleared.join(", ")}`);

  return (
    `${parts.join("; ")}. Fitness days this week: ${summary.fitness_days_this_week}/` +
    `${FITNESS_DAYS_TARGET}. Habit streak: ${summary.habit_streak} day` +
    `${summary.habit_streak === 1 ? "" : "s"}.`
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

  const done = today ? ROUTINE_FIELDS.filter((f) => today[f]) : [];
  const left = today
    ? ROUTINE_FIELDS.filter((f) => !today[f])
    : [...ROUTINE_FIELDS];

  return (
    `${name} today: ${done.length}/${ROUTINE_FIELDS.length} done` +
    (done.length ? ` (${done.map((f) => ROUTINE_LABELS[f]).join(", ")})` : "") +
    (left.length ? `; remaining: ${left.map((f) => ROUTINE_LABELS[f]).join(", ")}` : "") +
    `. Fitness days this week: ${summary.fitness_days_this_week}/${FITNESS_DAYS_TARGET}. ` +
    `Habit streak: ${summary.habit_streak} day${summary.habit_streak === 1 ? "" : "s"}.`
  );
}

async function markAttendance(
  role: string,
  studentName: string,
  session: string,
  context: UserContext
): Promise<string> {
  if (role !== "coach") {
    return "Only a coach can mark attendance.";
  }
  const student = findStudent(studentName, context);
  if (!student) {
    return `"${studentName}" isn't on your roster. Your students: ${
      context.roster.length ? context.roster.map((s) => s.full_name).join(", ") : "none yet"
    }.`;
  }

  const matched = await matchSession(context.userId, session);
  if (matched) {
    await pool.query(
      `INSERT INTO checkins (user_id, session_id, session_label, checked_in_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, session_id) WHERE session_id IS NOT NULL DO NOTHING`,
      [student.id, matched.id, matched.title, matched.starts_at]
    );
    return `${student.full_name} marked present for "${matched.title}" on ${new Date(
      matched.starts_at
    ).toLocaleDateString()}.`;
  }

  await pool.query("INSERT INTO checkins (user_id, session_label) VALUES ($1, $2)", [
    student.id,
    session || "Training Session",
  ]);
  return (
    `${student.full_name} marked present for "${session}", but no scheduled session ` +
    `matched, so it won't count toward the attendance percentage. Add the session on ` +
    `the Schedule tab to track it.`
  );
}

// Nearest session matching the label, else the closest one in time.
async function matchSession(coachId: string, label: string) {
  const cleaned = label.replace(/^Training Session\s*—\s*/i, "").trim();
  const result = await pool.query(
    `SELECT id, title, starts_at FROM sessions
     WHERE coach_id = $1
       AND ($2 = '' OR title ILIKE '%' || $2 || '%'
            OR to_char(starts_at, 'FMDay') ILIKE $2 || '%')
     ORDER BY ABS(EXTRACT(EPOCH FROM (starts_at - now())))
     LIMIT 1`,
    [coachId, cleaned]
  );
  return result.rows[0] ?? null;
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
    return "Attendance is computed from sessions attended, so it can't be set by hand.";
  }
  if (!(RATED_CRITERIA as readonly string[]).includes(criterion)) {
    return `Not a valid criterion. Options: ${RATED_CRITERIA.join(", ")}.`;
  }

  const student = findStudent(studentName, context);
  if (!student) {
    return `"${studentName}" isn't on your roster. Your students: ${
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

  return (
    `${student.full_name}: ${criterion} set to ${met ? "met" : "not yet"}. ` +
    `${card.rows[0]?.met_count ?? 0}/6 coach-rated criteria met this month.`
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
    return `"${studentName}" isn't on your roster. Your students: ${
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
    return "The roster is empty. Students join by signing up with the coach's invite code.";
  }
  return `${context.roster.length} student${
    context.roster.length === 1 ? "" : "s"
  }: ${context.roster.map((s) => `${s.full_name} (${s.email})`).join(", ")}`;
}
