import { Platform } from "react-native";
import type { HealthReading } from "./health";

// Android's equivalent of HealthKit. Health Connect is built into Android 14+
// and an installable app below that; Samsung Health, Fitbit and Garmin all write
// into it, so reading from here covers those without separate integrations.
//
// Resolved at runtime like the iOS module: absent in Expo Go, so the import must
// not throw at module scope.
type HealthConnectModule = {
  getSdkStatus: () => Promise<number>;
  initialize: () => Promise<boolean>;
  requestPermission: (
    permissions: { accessType: "read" | "write"; recordType: string }[]
  ) => Promise<{ accessType: string; recordType: string }[]>;
  readRecords: (
    recordType: string,
    options: {
      timeRangeFilter: { operator: "between"; startTime: string; endTime: string };
    }
  ) => Promise<{ records: Record<string, unknown>[] }>;
};

let hc: HealthConnectModule | null = null;
try {
  if (Platform.OS === "android") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    hc = require("react-native-health-connect") as HealthConnectModule;
  }
} catch {
  hc = null;
}

// From the library's SdkAvailabilityStatus: 3 = available, 2 = provider needs an
// update, 1 = unavailable on this device.
const SDK_AVAILABLE = 3;
const SDK_UPDATE_REQUIRED = 2;

export function isHealthConnectAvailable(): boolean {
  return hc !== null;
}

// Sleep stages: 1 = awake, 4 = sleeping, 5 = out-of-bed, 6 = light, 7 = deep,
// 8 = REM. Counting only genuine sleep stages avoids crediting time lying awake,
// mirroring the iOS behaviour.
const ASLEEP_STAGES = new Set([4, 6, 7, 8]);

function ms(a: unknown, b: unknown): number {
  const start = new Date(String(a)).getTime();
  const end = new Date(String(b)).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return end - start;
}

export async function readTodayAndroid(): Promise<
  { ok: true; reading: HealthReading } | { ok: false; reason: string; empty?: boolean }
> {
  if (!hc) {
    return { ok: false, reason: "Health Connect needs a full build of the app." };
  }

  try {
    const status = await hc.getSdkStatus();
    if (status === SDK_UPDATE_REQUIRED) {
      return { ok: false, reason: "Update Health Connect to sync your activity." };
    }
    if (status !== SDK_AVAILABLE) {
      return { ok: false, reason: "This device doesn't have Health Connect." };
    }

    if (!(await hc.initialize())) {
      return { ok: false, reason: "Couldn't start Health Connect." };
    }

    const granted = await hc.requestPermission([
      { accessType: "read", recordType: "ExerciseSession" },
      { accessType: "read", recordType: "SleepSession" },
    ]);
    const has = (type: string) =>
      granted.some((g) => g.recordType === type && g.accessType === "read");
    if (!has("ExerciseSession") && !has("SleepSession")) {
      return { ok: false, reason: "Health access was declined." };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    let activeMinutes: number | null = null;
    let exerciseAt: string | null = null;
    if (has("ExerciseSession")) {
      try {
        const { records } = await hc.readRecords("ExerciseSession", {
          timeRangeFilter: {
            operator: "between",
            startTime: startOfDay.toISOString(),
            endTime: now.toISOString(),
          },
        });
        let total = 0;
        let longest = 0;
        for (const r of records) {
          const span = ms(r.startTime, r.endTime);
          total += span;
          // The longest bout stands in for "when did you train today", matching
          // how the iOS reader picks its timestamp.
          if (span > longest) {
            longest = span;
            exerciseAt = new Date(String(r.startTime)).toISOString();
          }
        }
        if (total > 0) activeMinutes = Math.round(total / 60_000);
      } catch {
        // No exercise recorded today.
      }
    }

    let sleepHours: number | null = null;
    if (has("SleepSession")) {
      try {
        // Sleep spans midnight, so look back from yesterday afternoon.
        const from = new Date(startOfDay);
        from.setDate(from.getDate() - 1);
        from.setHours(16, 0, 0, 0);
        const { records } = await hc.readRecords("SleepSession", {
          timeRangeFilter: {
            operator: "between",
            startTime: from.toISOString(),
            endTime: now.toISOString(),
          },
        });
        let total = 0;
        for (const r of records) {
          const stages = r.stages as { stage: number; startTime: string; endTime: string }[] | undefined;
          if (Array.isArray(stages) && stages.length > 0) {
            for (const s of stages) {
              if (ASLEEP_STAGES.has(s.stage)) total += ms(s.startTime, s.endTime);
            }
          } else {
            // Some writers record a bare session with no stages; the whole span
            // is the best estimate available.
            total += ms(r.startTime, r.endTime);
          }
        }
        if (total > 0) sleepHours = Math.round((total / 3_600_000) * 10) / 10;
      } catch {
        // No sleep data, e.g. no watch.
      }
    }

    if (activeMinutes === null && sleepHours === null) {
      // Granted, just nothing logged yet — see the note on readToday in health.ts.
      return {
        ok: false,
        empty: true,
        reason:
          "Connected to Health Connect. Nothing is recorded there for today yet, so " +
          "Exercise and Sleep will fill in once your phone or watch logs some.",
      };
    }
    return { ok: true, reading: { activeMinutes, sleepHours, exerciseAt } };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Couldn't read Health Connect.",
    };
  }
}
