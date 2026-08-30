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

export function isHealthAvailable(): boolean {
  return health !== null;
}

export type HealthReading = {
  activeMinutes: number | null;
  sleepHours: number | null;
};

// Asks permission once and reads today's exercise minutes plus last night's
// sleep. Returns nulls for anything unavailable rather than throwing, because a
// missing reading must never block the routine screen.
export async function readToday(): Promise<
  { ok: true; reading: HealthReading } | { ok: false; reason: string }
> {
  if (!health) {
    return {
      ok: false,
      reason:
        Platform.OS === "ios"
          ? "Apple Health needs a full build of the app."
          : "Apple Health isn't available on this device.",
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
      return { ok: false, reason: "No exercise or sleep data recorded yet today." };
    }
    return { ok: true, reading: { activeMinutes, sleepHours } };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Couldn't read Apple Health.",
    };
  }
}
