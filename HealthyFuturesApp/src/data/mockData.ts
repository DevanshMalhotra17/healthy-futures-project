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
