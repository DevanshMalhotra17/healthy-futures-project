export const colors = {
  pitch: "#1F5D40",
  pitchLight: "#2F7D57",
  pitchDark: "#123626",
  gold: "#D9A441",
  goldSoft: "#F3E3C1",
  sky: "#4E8FA6",
  skySoft: "#DCEAEE",
  plum: "#7B6BA8",
  plumSoft: "#E7E2F2",
  paper: "#F4F6F1",
  card: "#FFFFFF",
  ink: "#16241C",
  inkSoft: "#5B6C61",
  line: "#DFE5D9",
  danger: "#C1553D",
  white: "#FFFFFF",
} as const;

export const radius = {
  lg: 26,
  md: 18,
  sm: 12,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 26,
} as const;

// Font family names as registered in App.tsx via useFonts()
export const fonts = {
  display: "Fraunces_600SemiBold",
  displayMedium: "Fraunces_500Medium",
  body: "Manrope_500Medium",
  bodyBold: "Manrope_700Bold",
  bodyExtraBold: "Manrope_800ExtraBold",
  mono: "IBMPlexMono_500Medium",
} as const;

export type Companion = {
  key: "soccer" | "nutrition" | "primefit" | "zenfit";
  name: string;
  blurb: string;
  color: string;
  softColor: string;
  iconColor: string;
};
