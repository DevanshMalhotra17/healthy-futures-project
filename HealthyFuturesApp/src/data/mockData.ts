import { colors, Companion } from "@/theme";

export const companions: Companion[] = [
  {
    key: "soccer",
    name: "Soccer Scorecard",
    blurb: "Saturday's match is ready to upload",
    color: colors.pitch,
    softColor: colors.pitch,
    iconColor: colors.white,
  },
  {
    key: "nutrition",
    name: "Nutrition",
    blurb: "4 of 5 plate goals hit today",
    color: colors.goldSoft,
    softColor: colors.goldSoft,
    iconColor: "#95681B",
  },
  {
    key: "primefit",
    name: "PrimeFit",
    blurb: "20-min ball control due today",
    color: colors.skySoft,
    softColor: colors.skySoft,
    iconColor: "#2C5A69",
  },
  {
    key: "zenfit",
    name: "ZenFit",
    blurb: "Take today's 2-min check-in",
    color: colors.plumSoft,
    softColor: colors.plumSoft,
    iconColor: "#4E3E80",
  },
];

export type AgendaItem = {
  day: string;
  date: string;
  title: string;
  detail: string;
};

export const agenda: AgendaItem[] = [
  {
    day: "SAT",
    date: "Aug 16",
    title: "Soccer Training — Cooper Field",
    detail: "9:00 – 12:00 · 400 Union St, Trenton",
  },
  {
    day: "WED",
    date: "Sep 15+",
    title: "Swim · Fitness · Gym — WAC",
    detail: "4:00 – 8:30 PM · 30 min each, starts Sep 15",
  },
];

export type Criterion = { label: string; met: boolean };

export const criteria: Criterion[] = [
  { label: "Attendance 90%+", met: true },
  { label: "Positive attitude", met: true },
  { label: "Effort every session", met: true },
  { label: "Coachability", met: false },
  { label: "Skill development", met: true },
  { label: "Character", met: true },
  { label: "Academic responsibility", met: false },
];

export const soccerScorecard = {
  opponent: "Aug 9 vs. Ewing Rec",
  meta: "Uploaded from Cooper Field · analyzed in 4 min",
  stats: [
    { label: "Touches", value: "84" },
    { label: "Sprints", value: "22" },
    { label: "Pass acc.", value: "78%" },
  ],
  coachNote:
    "\u201cGreat closing speed on defense \u2014 work on releasing the ball a beat earlier under pressure.\u201d \u2014 Coach D.",
};

export const weekStrip = [
  { label: "M", date: "11", active: false },
  { label: "T", date: "12", active: false },
  { label: "W", date: "13", active: false },
  { label: "T", date: "14", active: false },
  { label: "F", date: "15", active: false },
  { label: "S", date: "16", active: true },
  { label: "S", date: "17", active: false },
];

export const fullSchedule: AgendaItem[] = [
  {
    day: "SAT",
    date: "Aug 16",
    title: "Soccer Training — Cooper Field",
    detail: "9:00 – 12:00 · 400 Union St, Trenton, NJ",
  },
  { day: "WED", date: "Sep 15", title: "Swimming — WAC Pool", detail: "4:00 – 4:30 PM" },
  { day: "WED", date: "Sep 15", title: "Fitness Circuit — WAC", detail: "4:30 – 5:00 PM" },
  { day: "WED", date: "Sep 15", title: "Gym — Basketball, WAC", detail: "5:00 – 5:30 PM" },
];
