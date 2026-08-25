import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import { listTraceSessions } from "@/api/trace";
import { getCheckinSummary } from "@/api/checkins";
import { getLatestPrimeFitScore } from "@/data/primefitCache";
import ProgressRing from "@/components/ProgressRing";

// Roughly 2 sessions/week is the program's expected pace (Cooper Field +
// WAC), so ~8 check-ins in 30 days is "full attendance."
const EXPECTED_CHECKINS_PER_30_DAYS = 8;

type ScoreState = {
  loading: boolean;
  hasAnyData: boolean;
  score: number | null;
  primefitScore: number | null;
  attendancePct: number | null;
  soccerSessions: number | null;
};

function bandFor(score: number): { label: string; color: string } {
  if (score >= 75) return { label: "Looking strong", color: colors.pitch };
  if (score >= 50) return { label: "Building momentum", color: colors.gold };
  return { label: "Let's build this up together", color: colors.danger };
}

export default function HealthScoreCard() {
  const { token } = useAuth();
  const [state, setState] = useState<ScoreState>({
    loading: true,
    hasAnyData: false,
    score: null,
    primefitScore: null,
    attendancePct: null,
    soccerSessions: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const primefit = await getLatestPrimeFitScore().catch(() => null);

      let attendancePct: number | null = null;
      let soccerSessions: number | null = null;

      if (token) {
        const [checkins, sessions] = await Promise.allSettled([
          getCheckinSummary(token),
          listTraceSessions(token),
        ]);
        if (checkins.status === "fulfilled") {
          attendancePct = Math.min(
            100,
            Math.round((checkins.value.count_last_30_days / EXPECTED_CHECKINS_PER_30_DAYS) * 100)
          );
        }
        if (sessions.status === "fulfilled" && sessions.value.length > 0) {
          soccerSessions = sessions.value.length;
        }
      }

      const components: { value: number; weight: number }[] = [];
      if (primefit) components.push({ value: primefit.score, weight: 0.4 });
      if (attendancePct !== null) components.push({ value: attendancePct, weight: 0.35 });
      if (soccerSessions !== null) components.push({ value: Math.min(100, soccerSessions * 25), weight: 0.25 });

      let score: number | null = null;
      if (components.length > 0) {
        const totalWeight = components.reduce((s, c) => s + c.weight, 0);
        score = Math.round(components.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight);
      }

      if (!cancelled) {
        setState({
          loading: false,
          hasAnyData: components.length > 0,
          score,
          primefitScore: primefit?.score ?? null,
          attendancePct,
          soccerSessions,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.loading) {
    return (
      <View style={[styles.card, styles.center]}>
        <ActivityIndicator color={colors.pitch} />
      </View>
    );
  }

  if (!state.hasAnyData || state.score === null) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }]}>
        <Text style={styles.neutralTitle}>Health Score</Text>
        <Text style={styles.neutralBody}>
          Take a PrimeFit check-in or check into a session to see your Health Score here.
        </Text>
      </View>
    );
  }

  const band = bandFor(state.score);
  const parts: string[] = [];
  if (state.primefitScore !== null) parts.push("PrimeFit");
  if (state.attendancePct !== null) parts.push("attendance");
  if (state.soccerSessions !== null) parts.push("soccer activity");

  return (
    <View style={[styles.card, { backgroundColor: band.color }]}>
      <ProgressRing
        progress={state.score / 100}
        fillColor={colors.white}
        trackColor="rgba(255,255,255,0.25)"
        centerValue={String(state.score)}
        centerLabel="Score"
      />
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>Health Score</Text>
        <Text style={styles.headline}>{band.label}</Text>
        <Text style={styles.sub}>Based on {parts.join(", ")}.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 104,
  },
  center: { alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.8)",
  },
  headline: { fontFamily: fonts.display, fontSize: 17, color: colors.white, marginTop: 4 },
  sub: { fontFamily: fonts.body, fontSize: 11.5, color: "rgba(255,255,255,0.85)", marginTop: 5, lineHeight: 16 },
  neutralTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  neutralBody: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, marginTop: 6, lineHeight: 18 },
});
