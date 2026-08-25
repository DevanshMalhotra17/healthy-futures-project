import { getClient, MODEL } from "./anthropic";

// Mirrors the RecipeCompatibilityResponse the Nutrition companion already
// expects, so the same service backs the companion panel and the assistant.
export type RecipeAnalysis = {
  health_score: number | null;
  nutrition: Record<string, string | number | null> | null;
  recommended_portion: string | null;
  ingredient_benefits: { ingredient: string; benefits: string[] }[];
  ingredient_substitutions: string[];
  health_labels: string[];
  warnings: string[];
  summary: string | null;
};

const SCHEMA = {
  type: "object",
  properties: {
    health_score: {
      type: "integer",
      description: "Overall healthiness for a youth athlete, 1-10",
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
    ingredient_benefits: {
      type: "array",
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
    ingredient_substitutions: { type: "array", items: { type: "string" } },
    health_labels: { type: "array", items: { type: "string" } },
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
    "ingredient_benefits",
    "ingredient_substitutions",
    "health_labels",
    "warnings",
    "summary",
  ],
  additionalProperties: false,
} as const;

const SYSTEM = `You analyze food for a youth soccer and wellness program.

Estimate nutrition for one serving and rate it 1-10 for a young athlete in training.
Favor whole foods, adequate protein for recovery, and hydration. Be encouraging and
concrete; write for a middle- or high-school reader.

You are not a clinician. Do not diagnose, prescribe diets, or reference specific
medical conditions. If the input is not food, set health_score to null and say so
in the summary.`;

export async function analyzeRecipe(
  recipeText: string,
  opts: {
    servings?: number;
    allergies?: string;
    age?: number;
    dietaryPreference?: string;
  } = {}
): Promise<RecipeAnalysis> {
  const client = getClient();
  if (!client) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const details = [
    opts.servings ? `Servings: ${opts.servings}` : null,
    opts.age ? `Athlete's age: ${opts.age}` : null,
    opts.allergies ? `Allergies or foods to avoid: ${opts.allergies}` : null,
    opts.dietaryPreference ? `Dietary preference: ${opts.dietaryPreference}` : null,
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
        content: `Analyze this food:\n${recipeText}${details ? `\n\n${details}` : ""}`,
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
      : `🥗 **${label} — ${a.health_score}/10**`
  );
  if (a.summary) lines.push(a.summary);
  if (a.nutrition?.calories) {
    lines.push(
      `• Per serving: ${a.nutrition.calories} cal · ${a.nutrition.protein} protein · ${a.nutrition.carbohydrates} carbs`
    );
  }
  if (a.recommended_portion) lines.push(`• Portion: ${a.recommended_portion}`);
  if (a.warnings.length > 0) lines.push(`⚠️ ${a.warnings.join("; ")}`);
  return lines.join("\n");
}
