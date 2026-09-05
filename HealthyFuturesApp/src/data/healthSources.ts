// Where the app's health guidance comes from.
//
// App Review flagged guideline 1.4.1: the nutrition companion gave health advice
// with no citations. These are the sources behind every number and recommendation
// the app shows — the 30-minute activity target, the 8-hour sleep target, the meal
// scores and the portion advice.
//
// Deliberately a hand-curated constant rather than something the model returns.
// Asking an LLM for its citations invites invented URLs, and a dead link in front
// of a reviewer is worse than no link at all. Every URL below was checked live.

export type SourceTopic = "nutrition" | "sleep" | "activity" | "wellbeing";

export type HealthSource = {
  title: string;
  publisher: string;
  url: string;
  topics: SourceTopic[];
};

export const HEALTH_SOURCES: HealthSource[] = [
  {
    title: "Dietary Guidelines for Americans, 2020–2025",
    publisher: "U.S. Departments of Agriculture and Health and Human Services",
    url: "https://health.gov/our-work/nutrition-physical-activity/dietary-guidelines",
    topics: ["nutrition"],
  },
  {
    title: "MyPlate — food group targets and plate balance",
    publisher: "U.S. Department of Agriculture",
    url: "https://www.myplate.gov/",
    topics: ["nutrition"],
  },
  {
    title: "FoodData Central — reference nutrient values",
    publisher: "USDA Agricultural Research Service",
    url: "https://fdc.nal.usda.gov/",
    topics: ["nutrition"],
  },
  {
    title: "Nutrition for young athletes",
    publisher: "Academy of Nutrition and Dietetics",
    url: "https://www.eatright.org/",
    topics: ["nutrition"],
  },
  {
    title: "Healthy eating for children and teens",
    publisher: "American Academy of Pediatrics (HealthyChildren.org)",
    url: "https://www.healthychildren.org/English/healthy-living/nutrition/Pages/default.aspx",
    topics: ["nutrition"],
  },
  {
    title: "Healthy diet",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet",
    topics: ["nutrition"],
  },
  {
    title: "Recommended sleep duration for children and teens",
    publisher: "American Academy of Sleep Medicine",
    url: "https://aasm.org/advocacy/position-statements/",
    topics: ["sleep"],
  },
  {
    title: "Sleep guidance by age",
    publisher: "American Academy of Pediatrics (HealthyChildren.org)",
    url: "https://www.healthychildren.org/English/healthy-living/sleep/Pages/default.aspx",
    topics: ["sleep"],
  },
  {
    title: "Physical Activity Guidelines for Americans, 2nd edition",
    publisher: "U.S. Department of Health and Human Services",
    url: "https://health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines",
    topics: ["activity"],
  },
  {
    title: "Physical activity",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/physical-activity",
    topics: ["activity"],
  },
  {
    title: "Fitness and exercise for children",
    publisher: "American Academy of Pediatrics (HealthyChildren.org)",
    url: "https://www.healthychildren.org/English/healthy-living/fitness/Pages/default.aspx",
    topics: ["activity"],
  },
  {
    title: "Emotional wellness in children and teens",
    publisher: "American Academy of Pediatrics (HealthyChildren.org)",
    url: "https://www.healthychildren.org/English/healthy-living/emotional-wellness/Pages/default.aspx",
    topics: ["wellbeing"],
  },
  {
    title: "Adolescent mental health",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/adolescent-mental-health",
    topics: ["wellbeing"],
  },
];

// Shown next to the citations everywhere they appear. An athlete here can be nine
// years old, so the wording points at a guardian rather than assuming the reader
// will act on it alone.
export const HEALTH_DISCLAIMER =
  "This is general wellness guidance for young athletes, not medical advice, " +
  "diagnosis or treatment. Talk to a doctor, dietitian or your parent or " +
  "guardian before changing what you eat or how you train — especially if you " +
  "have an allergy, a health condition or an injury.";

export function sourcesFor(...topics: SourceTopic[]): HealthSource[] {
  return HEALTH_SOURCES.filter((s) => s.topics.some((t) => topics.includes(t)));
}
