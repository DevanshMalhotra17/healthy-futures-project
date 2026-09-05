import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { colors, radius, fonts } from "@/theme";
import { HeartIcon } from "@/components/Icons";
import { readToday, isHealthAvailable, healthSourceName } from "@/utils/health";
import { syncHealth } from "@/api/routines";
import { useAuth } from "@/state/AuthContext";

// This card exists for two reasons.
//
// 1. App Review guideline 2.5.1: an app that links HealthKit has to identify that
//    in its own interface. Naming "Apple Health" only in the permission sheet that
//    iOS itself draws doesn't count.
// 2. Nothing was calling readToday() at all. The old RoutineScreen was the only
//    caller and it was deleted, so exercise and sleep could never arrive and three
//    of the six items on the home screen were permanently stuck on "waiting".

// Remembers that the athlete already granted access, so later launches can refresh
// quietly instead of making them tap a button every day. Not a permission record —
// the OS owns that — just "don't ask cold".
const CONNECTED_KEY = "health_connected_v1";

type Props = { onSynced?: () => void };

export default function HealthSyncCard({ onSynced }: Props) {
  const { token } = useAuth();
  const sourceName = healthSourceName();
  const available = isHealthAvailable();

  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [reading, setReading] = useState<{ minutes: number | null; hours: number | null } | null>(
    null
  );
  const [problem, setProblem] = useState<string | null>(null);
  // A granted-but-empty read isn't a failure, so it's shown in the muted note
  // colour instead of the error colour.
  const [problemIsEmpty, setProblemIsEmpty] = useState(false);

  const sync = useCallback(
    async (silent: boolean) => {
      if (!token || !available) return;
      setBusy(true);
      if (!silent) {
        setProblem(null);
        setProblemIsEmpty(false);
      }
      try {
        const result = await readToday();
        if (!result.ok) {
          // Permission was granted, there's just no data yet. Remember it as
          // connected so the athlete isn't asked to connect again tomorrow.
          if (result.empty) {
            setConnected(true);
            await SecureStore.setItemAsync(CONNECTED_KEY, "1").catch(() => undefined);
          }
          // On a silent refresh a declined or empty read isn't worth shouting
          // about — the athlete didn't ask for anything.
          if (!silent) {
            setProblem(result.reason);
            setProblemIsEmpty(result.empty === true);
          }
          return;
        }
        const { activeMinutes, sleepHours, exerciseAt } = result.reading;
        await syncHealth(
          { active_minutes: activeMinutes, sleep_hours: sleepHours, exercise_at: exerciseAt },
          token
        );
        setReading({ minutes: activeMinutes, hours: sleepHours });
        setConnected(true);
        await SecureStore.setItemAsync(CONNECTED_KEY, "1");
        onSynced?.();
      } catch {
        if (!silent) setProblem("Couldn't send that to your coach's dashboard. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [token, available, onSynced]
  );

  // Refresh on open, but only for someone who has already said yes. A cold launch
  // must not throw a HealthKit permission sheet at a nine-year-old unprompted.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = await SecureStore.getItemAsync(CONNECTED_KEY).catch(() => null);
      if (cancelled || seen !== "1") return;
      setConnected(true);
      sync(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sync]);

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <HeartIcon size={15} color={colors.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{sourceName}</Text>
          <Text style={styles.sub}>
            {available
              ? `Your exercise minutes and sleep hours are read from ${sourceName} to fill in Exercise, Around practice and Sleep below.`
              : `${sourceName} isn't available on this device, so Exercise, Around practice and Sleep stay empty.`}
          </Text>
        </View>
      </View>

      {reading && (
        <View style={styles.readRow}>
          <View style={styles.readItem}>
            <Text style={styles.readValue}>
              {reading.minutes === null ? "—" : `${reading.minutes}`}
            </Text>
            <Text style={styles.readLabel}>exercise min</Text>
          </View>
          <View style={styles.readDivider} />
          <View style={styles.readItem}>
            <Text style={styles.readValue}>
              {reading.hours === null ? "—" : `${reading.hours}`}
            </Text>
            <Text style={styles.readLabel}>hours slept</Text>
          </View>
          <Text style={styles.readFrom}>from {sourceName}</Text>
        </View>
      )}

      {available && (
        <Pressable
          style={[styles.button, busy && styles.buttonOff]}
          onPress={() => sync(false)}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>
              {connected ? `Refresh from ${sourceName}` : `Connect ${sourceName}`}
            </Text>
          )}
        </Pressable>
      )}

      {problem && (
        <Text style={problemIsEmpty ? styles.pending : styles.problem}>{problem}</Text>
      )}

      {/* Stated plainly because it's the question a parent asks first, and because
          the app requests a HealthKit write permission it never uses (Apple
          requires the key whenever the framework is linked). */}
      <Text style={styles.note}>
        Healthy Futures only reads these two figures. It never writes anything back
        to {sourceName}, and never shares them with anyone but your coach.
        {Platform.OS === "ios"
          ? " You can change this any time in the Health app under Sharing, or in iOS Settings › Privacy & Security › Health."
          : " You can change this any time in the Health Connect app under App permissions."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 15,
  },
  top: { flexDirection: "row", gap: 11, alignItems: "flex-start" },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#FBE9E5",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.bodyExtraBold, fontSize: 13.5, color: colors.ink },
  sub: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.inkSoft,
    marginTop: 3,
  },
  readRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  readItem: { alignItems: "flex-start" },
  readValue: { fontFamily: fonts.mono, fontSize: 19, color: colors.pitch },
  readLabel: { fontFamily: fonts.body, fontSize: 9.5, color: colors.inkSoft, marginTop: 1 },
  readDivider: { width: 1, height: 26, backgroundColor: colors.line },
  readFrom: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.inkSoft,
    marginLeft: "auto",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  button: {
    marginTop: 13,
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonOff: { opacity: 0.6 },
  buttonText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.white },
  problem: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.danger,
    marginTop: 9,
  },
  pending: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkSoft,
    marginTop: 9,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 14.5,
    color: colors.inkSoft,
    marginTop: 11,
  },
});
