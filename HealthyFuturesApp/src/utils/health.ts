import { Platform } from "react-native";

// HealthKit is iOS-only and its native module isn't in Expo Go, so the import is
// resolved at runtime. Everything below degrades to "unavailable" rather than
// throwing, which keeps Android and Expo Go on the manual toggles.
type HealthModule = {
  isHealthDataAvailable: () => Promise<boolean>;
  requestAuthorization: (read: string[], write?: string[]) => Promise<boolean>;
  queryStatisticsForQuantity: (
    identifier: string,
    options: Record<string, unknown>
  ) => Promise<{ sumQuantity?: { quantity: number } } | null>;
  queryCategorySamples: (
    identifier: string,
    options: Record<string, unknown>
  ) => Promise<{ startDate: string; endDate: string; value: number }[]>;
  queryQuantitySamples: (
    identifier: string,
    options: Record<string, unknown>
  ) => Promise<
    readonly { startDate: string | Date; endDate: string | Date; quantity: number }[]
  >;
};

let health: HealthModule | null = null;
try {
  if (Platform.OS === "ios") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    health = require("@kingstinct/react-native-healthkit") as HealthModule;
  }
} catch {
  health = null;
}

const EXERCISE_TIME = "HKQuantityTypeIdentifierAppleExerciseTime";
const SLEEP_ANALYSIS = "HKCategoryTypeIdentifierSleepAnalysis";

// HKCategoryValueSleepAnalysis: 0 = inBed, everything above is an asleep state.
// Counting only asleep values avoids crediting time spent lying awake.
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);

// The user-facing name of the health store on this platform. App Review guideline
// 2.5.1 requires an app that links HealthKit to say so in its own interface, so
// this string is shown on the home screen rather than the neutral "your health
// app" wording the server sends.
export function healthSourceName(): string {
  return Platform.OS === "android" ? "Health Connect" : "Apple Health";
}

// True when this device has some health source we can read. iOS uses HealthKit,
// Android uses Health Connect; callers don't need to know which.
export function isHealthAvailable(): boolean {
  if (Platform.OS === "android") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isHealthConnectAvailable } = require("./healthConnect");
    return isHealthConnectAvailable();
  }
  return health !== null;
}

export type HealthReading = {
  activeMinutes: number | null;
  sleepHours: number | null;
  // When the day's biggest bout of exercise happened, so the server can judge
  // whether it sat near that day's session.
  exerciseAt: string | null;
};

// Asks permission once and reads today's exercise minutes plus last night's
// sleep. Returns nulls for anything unavailable rather than throwing, because a
// missing reading must never block the routine screen.
// `empty` separates "you said yes but there's nothing recorded yet" from a real
// failure. It matters on a device with no motion source — an iPad, or an iPhone
// straight out of the box — where an empty read is the expected answer and must
// not be shown as an error.
export async function readToday(): Promise<
  { ok: true; reading: HealthReading } | { ok: false; reason: string; empty?: boolean }
> {
  if (Platform.OS === "android") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readTodayAndroid } = require("./healthConnect");
    return readTodayAndroid();
  }

  if (!health) {
    return {
      ok: false,
      reason: "Apple Health needs a full build of the app.",
    };
  }

  try {
    if (!(await health.isHealthDataAvailable())) {
      return { ok: false, reason: "This device has no Apple Health data." };
    }

    const granted = await health.requestAuthorization([EXERCISE_TIME, SLEEP_ANALYSIS]);
    if (!granted) {
      return { ok: false, reason: "Health access was declined." };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    let activeMinutes: number | null = null;
    try {
      const stats = await health.queryStatisticsForQuantity(EXERCISE_TIME, {
        from: startOfDay,
        to: now,
        // Exercise time is additive, so a sum over the day is what we want.
        statisticsOptions: ["cumulativeSum"],
        unit: "min",
      });
      const sum = stats?.sumQuantity?.quantity;
      if (typeof sum === "number") activeMinutes = Math.round(sum);
    } catch {
      // No exercise data recorded today.
    }

    // The longest single bout stands in for "when did you train today" — more
    // meaningful than the first sample, which is often incidental movement.
    let exerciseAt: string | null = null;
    try {
      const samples = await health.queryQuantitySamples(EXERCISE_TIME, {
        filter: { startDate: startOfDay, endDate: now },
        unit: "min",
      });
      let best: { at: string; qty: number } | null = null;
      for (const s of samples) {
        const qty = typeof s.quantity === "number" ? s.quantity : 0;
        if (!best || qty > best.qty) {
          best = { at: new Date(s.startDate).toISOString(), qty };
        }
      }
      if (best && best.qty > 0) exerciseAt = best.at;
    } catch {
      // Older module versions or no samples — the server treats this as unknown
      // and credits the day rather than punishing it.
    }

    let sleepHours: number | null = null;
    try {
      // Sleep spans midnight, so look back from yesterday afternoon.
      const from = new Date(startOfDay);
      from.setDate(from.getDate() - 1);
      from.setHours(16, 0, 0, 0);
      const samples = await health.queryCategorySamples(SLEEP_ANALYSIS, { from, to: now });
      const ms = samples
        .filter((s) => ASLEEP_VALUES.has(s.value))
        .reduce(
          (total, s) =>
            total + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()),
          0
        );
      if (ms > 0) sleepHours = Math.round((ms / 3_600_000) * 10) / 10;
    } catch {
      // No sleep data, e.g. no watch.
    }

    if (activeMinutes === null && sleepHours === null) {
      // Access was granted — there's just nothing there yet. Treated as connected
      // so the card reads as working rather than broken.
      return {
        ok: false,
        empty: true,
        reason:
          "Connected to Apple Health. Nothing is recorded there for today yet, so " +
          "Exercise and Sleep will fill in once your iPhone or Apple Watch logs some.",
      };
    }
    return { ok: true, reading: { activeMinutes, sleepHours, exerciseAt } };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Couldn't read Apple Health.",
    };
  }
}
