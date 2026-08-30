import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import {
  getMyTrends,
  getStudentTrends,
  CompanionTrend,
  TREND_LABELS,
} from "@/api/trends";
import ScoreChart from "@/components/ScoreChart";

const DAYS = 14;

function directionCopy(t: CompanionTrend): { text: string; color: string } | null {
  if (t.changePct === null || t.direction === "unknown") return null;
  if (t.direction === "improving") {
    return { text: `▲ up ${t.changePct}%`, color: colors.pitch };
  }
  if (t.direction === "declining") {
    return { text: `▼ down ${Math.abs(t.changePct)}%`, color: colors.danger };
  }
  return { text: "steady", color: colors.inkSoft };
}

// Shows one chart per companion the user actually has scores for. Pass studentId
// to view a roster student (coach only).
export default function TrendsSection({ studentId }: { studentId?: string }) {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const [trends, setTrends] = useState<CompanionTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = studentId
        ? await getStudentTrends(studentId, DAYS, token)
        : await getMyTrends(DAYS, token);
      setTrends(data);
    } catch {
      setTrends([]);
    } finally {
      setLoading(false);
    }
  }, [token, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Nothing scored yet is the normal state for a new account, so stay hidden
  // rather than showing an empty chart.
  if (loading || trends.length === 0) return null;

  // Card padding either side of the chart.
  const chartWidth = width - spacing.lg * 2 - 32;

  return (
    <>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Trends</Text>
        <Text style={styles.labelMeta}>last {DAYS} days</Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        {trends.map((t) => {
          const dir = directionCopy(t);
          return (
            <View key={t.companion} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{TREND_LABELS[t.companion]}</Text>
                  <Text style={styles.cardMeta}>
                    avg {t.average ?? "—"}
                    {t.latest !== null ? ` · latest ${t.latest}` : ""} · {t.points.length} day
                    {t.points.length === 1 ? "" : "s"} logged
                  </Text>
                </View>
                {dir && <Text style={[styles.dir, { color: dir.color }]}>{dir.text}</Text>}
              </View>

              <ScoreChart
                points={t.points}
                width={chartWidth}
                color={t.direction === "declining" ? colors.danger : colors.pitch}
              />
            </View>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  labelMeta: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkSoft },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 16,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 4 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.ink },
  cardMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  dir: { fontFamily: fonts.bodyExtraBold, fontSize: 11.5 },
});
