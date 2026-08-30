import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import { getRoster, RosterStudent } from "@/api/coach";
import TrendsSection from "@/components/TrendsSection";
import { FITNESS_DAYS_TARGET } from "@/api/routines";

const ATTENDANCE_TARGET_PCT = 90;

export default function CoachRosterScreen() {
  const insets = useSafeAreaInsets();
  const { token, inviteCode } = useAuth();
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [sessionsHeld, setSessionsHeld] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  // Which student's trend charts are expanded; only one at a time keeps the
  // roster scannable and avoids fetching every student's history at once.
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const result = await getRoster(token);
      setStudents(result.students);
      setSessionsHeld(result.sessionsHeld);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!token) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notice}>Log in from the Profile tab to see your roster.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.pitch} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Roster</Text>
        <Text style={styles.subtitle}>
          {sessionsHeld > 0
            ? `Attendance across ${sessionsHeld} session${sessionsHeld === 1 ? "" : "s"} held.`
            : "Add sessions on the Schedule tab to start tracking attendance."}
        </Text>

        {error && (
          <Text style={styles.errorText}>Couldn't load your roster — pull down to retry.</Text>
        )}

        {students.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No students yet</Text>
            <Text style={styles.emptyBody}>
              Students join by signing up with your invite code
              {inviteCode ? ` (${inviteCode})` : ""}.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            {students.map((s) => (
              <Pressable
                style={styles.card}
                key={s.id}
                onPress={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
              >
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(s.fullName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{s.fullName}</Text>
                    <Text style={styles.email}>{s.email}</Text>
                  </View>
                  {s.attendancePct !== null ? (
                    <View
                      style={[
                        styles.pctChip,
                        s.attendancePct >= ATTENDANCE_TARGET_PCT
                          ? styles.pctGood
                          : s.attendancePct >= 50
                          ? styles.pctMid
                          : styles.pctLow,
                      ]}
                    >
                      <Text style={styles.pctText}>{s.attendancePct}%</Text>
                    </View>
                  ) : (
                    <Text style={styles.pctNone}>—</Text>
                  )}
                </View>

                <View style={styles.statRow}>
                  <Stat
                    label="Attendance"
                    value={
                      s.attendancePct !== null
                        ? `${s.sessionsAttended}/${s.sessionsHeld}`
                        : "No sessions"
                    }
                  />
                  <Stat
                    label="Fitness days"
                    value={`${s.fitnessDaysThisWeek}/${FITNESS_DAYS_TARGET}`}
                  />
                  <Stat label="Criteria" value={`${s.criteriaMetCount}/6`} />
                </View>

                {openId === s.id ? (
                  <TrendsSection studentId={s.id} />
                ) : (
                  <Text style={styles.tapHint}>Tap to see companion trends</Text>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: "center", justifyContent: "center" },
  container: { paddingHorizontal: spacing.lg },
  notice: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  title: { fontFamily: fonts.display, fontSize: 23, color: colors.ink },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 4,
    lineHeight: 17,
  },
  errorText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.danger, marginTop: spacing.md },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.skySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bodyExtraBold, fontSize: 13, color: "#2C5A69" },
  name: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.ink },
  email: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  pctChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  pctGood: { backgroundColor: colors.pitch },
  pctMid: { backgroundColor: colors.gold },
  pctLow: { backgroundColor: colors.danger },
  pctText: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.white },
  pctNone: { fontFamily: fonts.mono, fontSize: 15, color: colors.inkSoft, paddingHorizontal: 10 },

  statRow: {
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  stat: { flex: 1 },
  statValue: { fontFamily: fonts.mono, fontSize: 13.5, color: colors.ink },
  statLabel: { fontFamily: fonts.body, fontSize: 9.5, color: colors.inkSoft, marginTop: 2 },
  tapHint: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.inkSoft,
    marginTop: 10,
    textAlign: "center",
  },

  emptyCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 18,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 6,
    lineHeight: 18,
  },
});
