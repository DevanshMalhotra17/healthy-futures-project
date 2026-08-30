import { getClient, MODEL } from "./anthropic";

// Mirrors the RecipeCompatibilityResponse the Nutrition companion already
// expects, so the same service backs the companion panel and the assistant.
export type MealType = "breakfast" | "brunch" | "lunch" | "dinner" | "snack";

export type RecipeAnalysis = {
  // 0-100. The client renders this as "/ 100", so both ends must agree.
  health_score: number | null;
  nutrition: Record<string, string | number | null> | null;
  recommended_portion: string | null;
  timing_note: string | null;
  // Swaps a young athlete could actually make — the practical takeaway, not just
  // a score. Kept deliberately: this is the coaching value of the companion.
  ingredient_substitutions: string[];
  // Why the good parts of this meal are good — teaches the pattern rather than
  // just grading it.
  ingredient_benefits: { ingredient: string; benefits: string[] }[];
  // Short at-a-glance tags, e.g. "high protein", "good pre-training".
  health_labels: string[];
  warnings: string[];
  summary: string | null;
};

const SCHEMA = {
  type: "object",
  properties: {
    health_score: {
      type: "integer",
      description:
        "Overall healthiness for a young athlete on a 0-100 scale, where 0 is very " +
        "poor and 100 is excellent. Use the full range: deep-fried fast food belongs " +
        "near 25-40, a balanced whole-food meal near 75-90. Do not cluster scores.",
    },
    nutrition: {
      type: "object",
      description: "Rough per-serving estimates",
      properties: {
        calories: { type: "string" },
        protein: { type: "string" },
        carbohydrates: { type: "string" },
        fat: { type: "string" },
        fiber: { type: "string" },
      },
      required: ["calories", "protein", "carbohydrates", "fat", "fiber"],
      additionalProperties: false,
    },
    recommended_portion: { type: "string" },
    timing_note: {
      type: "string",
      description:
        "One sentence on whether this suits the stated meal and time — e.g. too heavy " +
        "close to bedtime, or good pre-training fuel. Empty string if no meal was given.",
    },
    ingredient_benefits: {
      type: "array",
      description:
        "Up to three ingredients actually visible in the meal, each with one or two " +
        "short reasons it helps a young athlete. Empty if nothing stands out.",
      items: {
        type: "object",
        properties: {
          ingredient: { type: "string" },
          benefits: { type: "array", items: { type: "string" } },
        },
        required: ["ingredient", "benefits"],
        additionalProperties: false,
      },
    },
    health_labels: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to four two-or-three-word tags describing the meal, e.g. 'high protein', " +
        "'good recovery fuel', 'low fibre'. Empty when nothing is notable.",
    },
    ingredient_substitutions: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to three concrete swaps that would raise the score, each phrased as a " +
        "single short sentence a young athlete could act on today — e.g. " +
        "'Swap the white roll for wholegrain to keep energy steadier'. Empty when " +
        "the meal is already a strong choice.",
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Allergens or cautions. Empty when there are none.",
    },
    summary: {
      type: "string",
      description: "Two encouraging sentences a young athlete would understand",
    },
  },
  required: [
    "health_score",
    "nutrition",
    "recommended_portion",
    "timing_note",
    "ingredient_substitutions",
    "ingredient_benefits",
    "health_labels",
    "warnings",
    "summary",
  ],
  additionalProperties: false,
} as const;

const SYSTEM = `You analyze food for a youth soccer and wellness program.

Estimate nutrition for one serving and score it 0-100 for a young athlete in training.
Spread scores across the range rather than clustering them: deep-fried or heavily
processed items belong in the 25-40 band, mixed meals in the 50-70 band, and balanced
whole-food meals in the 75-90 band. Reserve above 90 for genuinely excellent choices.

When a meal type and time are given, judge the food in that context — a heavy fried
meal late at night is worse than the same food at lunch, and a snack close to training
should be light and carb-forward.

When a Timing line gives the gap to that day's session, let it move the score, not just
the advice. The same food is a different choice at a different hour: something heavy,
greasy or high-fibre eaten under an hour before training should lose roughly 10 to 20
points because it will sit badly during a session, while a light carb-forward choice in
that window should gain a few. After a session, food with real protein and carbs scores
above the same food eaten at an idle moment. Say why in the timing_note so the athlete
learns the pattern rather than just seeing a number move.

Favor whole foods, adequate protein for recovery, and hydration. Be encouraging and
concrete; write for a middle- or high-school reader.

When a photo is provided, the photo is the evidence and any written note is only a
hint. Score what you can actually see on the plate. If the note claims something the
image contradicts — "grilled chicken and salad" over a photo of fried food — score the
food in the picture and say plainly in the summary what you actually see. Never inflate
a score because the words sounded healthy. If the photo is too dark or blurry to judge,
set health_score to null and ask for a clearer picture rather than guessing.

You are not a clinician. Do not diagnose, prescribe diets, or reference specific
medical conditions. If the input is not food, set health_score to null and say so
in the summary.`;


// Turns the gap to practice into a phrase the model can reason about. Windows are
// what matter for fuelling: eating 30 minutes before a session is a different
// judgment from eating three hours before, even for identical food.
function describeSessionTiming(
  minutesToSession?: number | null,
  sessionTitle?: string | null
): string | null {
  if (minutesToSession === undefined || minutesToSession === null) return null;
  const label = sessionTitle ?? "training";
  const mins = Math.round(minutesToSession);

  if (mins < 0) {
    const after = Math.abs(mins);
    if (after <= 90) {
      return `Timing: eaten ${after} minutes AFTER ${label} finished — judge this as recovery fuel (protein and carbs both matter here).`;
    }
    return `Timing: eaten ${Math.round(after / 60)} hours after ${label}.`;
  }
  if (mins <= 45) {
    return `Timing: eaten only ${mins} minutes BEFORE ${label} — too close to train on anything heavy, fatty or high-fibre. Light and carb-forward is what works.`;
  }
  if (mins <= 180) {
    return `Timing: eaten ${mins} minutes before ${label} — a good pre-training window for a balanced meal.`;
  }
  return `Timing: eaten ${Math.round(mins / 60)} hours before ${label}.`;
}

// When a photo is present the image leads and the caption follows, because the
// model should judge the plate it can see and treat the words as a hint.
function buildContent(
  recipeText: string,
  details: string,
  imageBase64?: string,
  imageMediaType?: string
) {
  const written = recipeText.trim();
  const caption = written
    ? `The athlete's note about this meal: "${written}". Treat it as a hint only — if the photo disagrees, trust the photo and say so.`
    : "The athlete gave no note. Judge only what you can see.";

  if (!imageBase64) {
    return `Analyze this food:\n${written}${details ? `\n\n${details}` : ""}`;
  }

  return [
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: (imageMediaType ?? "image/jpeg") as
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp",
        data: imageBase64,
      },
    },
    {
      type: "text" as const,
      text: `Analyze the food in this photo.\n\n${caption}${details ? `\n\n${details}` : ""}`,
    },
  ];
}

export async function analyzeRecipe(
  recipeText: string,
  opts: {
    servings?: number;
    allergies?: string;
    age?: number;
    dietaryPreference?: string;
    mealType?: MealType;
    snackTime?: string;
    // Minutes until that day's session (negative = already finished). Lets the
    // model judge fuelling against real practice time instead of guessing.
    minutesToSession?: number | null;
    sessionTitle?: string | null;
    // A photo of the actual plate. Scoring from the image is what stops a
    // student typing "salad" and eating chips.
    imageBase64?: string;
    imageMediaType?: string;
  } = {}
): Promise<RecipeAnalysis> {
  const client = getClient();
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const details = [
    opts.mealType
      ? `Meal: ${opts.mealType}${
          opts.mealType === "snack" && opts.snackTime ? ` at ${opts.snackTime}` : ""
        }`
      : null,
    opts.servings ? `Servings: ${opts.servings}` : null,
    opts.age ? `Athlete's age: ${opts.age}` : null,
    opts.allergies ? `Allergies or foods to avoid: ${opts.allergies}` : null,
    opts.dietaryPreference ? `Dietary preference: ${opts.dietaryPreference}` : null,
    describeSessionTiming(opts.minutesToSession, opts.sessionTitle),
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: buildContent(recipeText, details, opts.imageBase64, opts.imageMediaType),
      },
    ],
  });

  // output_config.format guarantees the first text block is valid JSON matching
  // the schema, so no defensive parsing is needed beyond finding that block.
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Nutrition analysis returned no content.");
  }
  return JSON.parse(text.text) as RecipeAnalysis;
}

// Compact rendering for the chat transcript, where a full card doesn't fit.
export function summarizeForChat(a: RecipeAnalysis, label: string): string {
  const lines: string[] = [];
  lines.push(
    a.health_score === null
      ? `🥗 **${label}**`
      : `🥗 **${label} — ${a.health_score}/100**`
  );
  if (a.summary) lines.push(a.summary);
  if (a.nutrition?.calories) {
    lines.push(
      `• Per serving: ${a.nutrition.calories} cal · ${a.nutrition.protein} protein · ${a.nutrition.carbohydrates} carbs`
    );
  }
  if (a.recommended_portion) lines.push(`• Portion: ${a.recommended_portion}`);
  if (a.timing_note) lines.push(`• Timing: ${a.timing_note}`);
  if (a.health_labels.length > 0) lines.push(`• ${a.health_labels.join(" · ")}`);
  for (const b of a.ingredient_benefits.slice(0, 2)) {
    lines.push(`• ${b.ingredient}: ${b.benefits.join(", ")}`);
  }
  for (const swap of a.ingredient_substitutions.slice(0, 3)) {
    lines.push(`• Swap: ${swap}`);
  }
  if (a.warnings.length > 0) lines.push(`⚠️ ${a.warnings.join("; ")}`);
  return lines.join("\n");
}
