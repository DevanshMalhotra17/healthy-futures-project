export type PrimeFitOption = { label: string; score: number };
export type PrimeFitQuestion = {
  area: string;
  areaLabel: string;
  prompt: string;
  options: PrimeFitOption[];
};

// Ported from the real Healthy Futures / TachyonLeap PrimeFit "teen" pathway
// (13-17 years) — same questions, scoring, and copy used in production.
export const PRIMEFIT_TEEN_QUESTIONS: PrimeFitQuestion[] = [
  {
    area: "activity",
    areaLabel: "Activity",
    prompt:
      "In a normal week, how regularly are you active through sport, exercise, dance, cycling or other physical activity?",
    options: [
      { label: "Active on most days", score: 3 },
      { label: "Active three or four days per week", score: 2 },
      { label: "Active only once or twice per week", score: 1 },
      { label: "Rarely active", score: 0 },
    ],
  },
  {
    area: "strength",
    areaLabel: "Strength",
    prompt:
      "How comfortable are you with activities such as squatting, climbing, jumping or supporting your own body weight?",
    options: [
      { label: "Comfortable", score: 3 },
      { label: "Mild difficulty", score: 2 },
      { label: "Clear difficulty", score: 1 },
      { label: "Avoids or cannot perform them", score: 0 },
    ],
  },
  {
    area: "stamina",
    areaLabel: "Stamina",
    prompt: "Can you participate in games, sport or exercise without tiring much earlier than others?",
    options: [
      { label: "Yes, comfortably", score: 3 },
      { label: "Usually, with some tiredness", score: 2 },
      { label: "Frequently tires earlier", score: 1 },
      { label: "Cannot keep up or stops quickly", score: 0 },
    ],
  },
  {
    area: "mobility",
    areaLabel: "Mobility",
    prompt: "Do stiffness or poor flexibility affect the way you move?",
    options: [
      { label: "No restriction", score: 3 },
      { label: "Occasional restriction", score: 2 },
      { label: "Frequent restriction", score: 1 },
      { label: "Significant restriction", score: 0 },
    ],
  },
  {
    area: "confidence",
    areaLabel: "Confidence",
    prompt: "Do you feel comfortable joining sports and physical activities?",
    options: [
      { label: "Very comfortable", score: 3 },
      { label: "Generally comfortable", score: 2 },
      { label: "Sometimes lacks confidence", score: 1 },
      { label: "Usually avoids participation", score: 0 },
    ],
  },
];

export const PRIMEFIT_TEEN_RECOMMENDATIONS: Record<string, string> = {
  activity: "PrimeFit Teen Activation",
  strength: "PrimeFit Youth Strength",
  stamina: "PrimeFit Teen Endurance",
  mobility: "PrimeFit Mobility Foundation",
  confidence: "PrimeFit Movement Confidence",
};

export const PRIMEFIT_TEEN_GOOD_SCORE_RECOMMENDATION = "PrimeFit Teen Activation";

export type WacClass = { name: string; day: string; time: string; instructor: string };

// Real Windsor Athletic Club class slots, same source data as the production quiz.
export const WAC_PROGRAMS: Record<string, WacClass[]> = {
  mobility: [
    { name: "Mat Pilates", day: "Mondays", time: "7–8 AM", instructor: "Sharon" },
    { name: "Vinyasa Flow", day: "Fridays", time: "9–10 AM", instructor: "Johanna" },
  ],
  cardio: [
    { name: "Cardio Blast", day: "Saturdays", time: "8–9 AM", instructor: "Mark" },
    { name: "HIIT Boot Camp", day: "Sundays", time: "9–10 AM", instructor: "Liza" },
  ],
  strength: [
    { name: "Total Body Strength", day: "Tuesdays", time: "7:30–8:30 AM", instructor: "Lisa P." },
    { name: "Tabata Strength", day: "Wednesdays", time: "9–10 AM", instructor: "Pat" },
  ],
  youth: [
    { name: "Kids Power Hour", day: "Tuesdays", time: "6–7 PM", instructor: "Donna" },
    { name: "Kids Hula Hoop Fit", day: "Thursdays", time: "7–8 PM", instructor: "Angela" },
  ],
  total: [
    { name: "Strong 30", day: "Sundays", time: "11–11:30 AM", instructor: "Maria" },
    { name: "Zumba®", day: "Sundays", time: "10–11 AM", instructor: "Maria" },
  ],
};

export function getWacProgram(areaLabel: string): WacClass[] {
  const label = areaLabel.toLowerCase();
  let key = "total";
  if (label.includes("mobility")) key = "mobility";
  else if (label.includes("stamina") || label.includes("activity")) key = "cardio";
  else if (label.includes("strength")) key = "strength";
  else if (label.includes("confidence")) key = "youth";
  return WAC_PROGRAMS[key] || WAC_PROGRAMS.total;
}

export function getScoreInterpretation(total: number): string {
  if (total >= 13) return "Strong foundation";
  if (total >= 10) return "Selected improvement opportunity";
  if (total >= 7) return "Structured PrimeFit support recommended";
  if (total >= 4) return "Individualised support recommended";
  return "Specialist assessment may be required";
}

export type PrimeFitAnswer = { area: string; areaLabel: string; answer: string; score: number };

export type PrimeFitResult = {
  totalScore: number; // raw 0-15
  displayScore: number; // rescaled 0-100
  interpretation: string;
  strongestArea: string;
  weakestArea: string;
  recommendation: string;
  wacClasses: WacClass[];
  summary: string;
};

// Same aggregation algorithm as the production quiz: sum raw scores (0-15),
// rescale to a 0-100 display score, and recommend based on the weakest area
// unless the answers were strong throughout.
export function scorePrimeFitAnswers(answers: PrimeFitAnswer[]): PrimeFitResult {
  const totalScore = answers.reduce((sum, a) => sum + a.score, 0);
  const sorted = answers.slice().sort((a, b) => a.score - b.score);
  const lowest = sorted[0];
  const strongest = sorted[sorted.length - 1];

  const isStrongThroughout = totalScore >= 13;
  const recommendation = isStrongThroughout
    ? PRIMEFIT_TEEN_GOOD_SCORE_RECOMMENDATION
    : PRIMEFIT_TEEN_RECOMMENDATIONS[lowest.area] || PRIMEFIT_TEEN_GOOD_SCORE_RECOMMENDATION;

  const interpretation = getScoreInterpretation(totalScore);
  const displayScore = Math.round((totalScore / 15) * 100);
  const wacClasses = getWacProgram(lowest.areaLabel);

  const summary =
    `Your PrimeFit score is ${displayScore} out of 100 for the Teen Pathway (${interpretation}). ` +
    `You appear to be doing well in ${strongest.areaLabel}. The area that may benefit most from ` +
    `attention is ${lowest.areaLabel}. The most relevant starting point would be ${recommendation}.`;

  return {
    totalScore,
    displayScore,
    interpretation,
    strongestArea: strongest.areaLabel,
    weakestArea: lowest.areaLabel,
    recommendation,
    wacClasses,
    summary,
  };
}
