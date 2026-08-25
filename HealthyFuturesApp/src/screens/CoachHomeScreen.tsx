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
import { PinIcon, ChevronRightIcon } from "@/components/Icons";
import ProgressRing from "@/components/ProgressRing";
import { greetingFor, firstNameOf } from "@/utils/greeting";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { RootTabParamList } from "@/navigation/RootNavigator";

const EXPECTED_CHECKINS_PER_30_DAYS = 8;

type Props = BottomTabScreenProps<RootTabParamList, "Home">;

function attendancePct(student: RosterStudent): number {
  return Math.min(
    100,
    Math.round((student.checkinsLast30Days / EXPECTED_CHECKINS_PER_30_DAYS) * 100)
  );
}

export default function CoachHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { token, fullName, inviteCode } = useAuth();
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setStudents(await getRoster(token));
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

  const total = students.length;
  const attending = students.filter((s) => attendancePct(s) >= 75).length;
  const needsAttention = students.filter((s) => attendancePct(s) < 50);
  const teamAvg =
    total > 0 ? Math.round(students.reduce((sum, s) => sum + attendancePct(s), 0) / total) : 0;

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
        <View style={styles.greetRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetTitle}>
              {greetingFor()},{"\n"}Coach {firstNameOf(fullName)}.
            </Text>
            <View style={styles.locRow}>
              <PinIcon size={13} color={colors.inkSoft} />
              <Text style={styles.locText}>Mentors Matter · Trenton</Text>
            </View>
          </View>
        </View>

        <View style={styles.teamCard}>
          <ProgressRing
            progress={teamAvg / 100}
            fillColor={colors.white}
            trackColor="rgba(255,255,255,0.25)"
            centerValue={`${teamAvg}%`}
            centerLabel="Team"
          />
          <View style={styles.teamCopy}>
            <Text style={styles.eyebrow}>Last 30 days</Text>
            <Text style={styles.teamHeadline}>
              {total === 0
                ? "No students yet"
                : `${attending} of ${total} on track`}
            </Text>
            <Text style={styles.teamSub}>
              {total === 0
                ? "Share your invite code to add students."
                : "Average attendance across your roster."}
            </Text>
          </View>
        </View>

        {inviteCode && (
          <View style={styles.inviteCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteLabel}>Your invite code</Text>
              <Text style={styles.inviteSub}>Students use this to join your roster.</Text>
            </View>
            <Text style={styles.inviteCode}>{inviteCode}</Text>
          </View>
        )}

        {error && (
          <Text style={styles.errorText}>Couldn't load your roster — pull down to retry.</Text>
        )}

        {needsAttention.length > 0 && (
          <>
            <View style={styles.secLabelRow}>
              <Text style={styles.secLabel}>Needs attention</Text>
            </View>
            <View style={{ gap: spacing.sm }}>
              {needsAttention.map((s) => (
                <View style={styles.alertItem} key={s.id}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertName}>{s.fullName}</Text>
                    <Text style={styles.alertDetail}>
                      {s.checkinsLast30Days === 0
                        ? "No check-ins in 30 days"
                        : `Only ${s.checkinsLast30Days} check-in${s.checkinsLast30Days === 1 ? "" : "s"} in 30 days`}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.msgBtn}
                    onPress={() => navigation.navigate("Messages")}
                  >
                    <Text style={styles.msgBtnText}>Message</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.secLabelRow}>
          <Text style={styles.secLabel}>Roster</Text>
          <Text style={styles.secMeta}>{total} student{total === 1 ? "" : "s"}</Text>
        </View>

        {total === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Your roster is empty</Text>
            <Text style={styles.emptyBody}>
              Students join by signing up with your invite code
              {inviteCode ? ` (${inviteCode})` : ""}.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {students.map((s) => {
              const pct = attendancePct(s);
              return (
                <Pressable
                  style={styles.studentItem}
                  key={s.id}
                  onPress={() => navigation.navigate("Roster")}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(s.fullName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>{s.fullName}</Text>
                    <Text style={styles.studentDetail}>
                      {s.checkinsLast30Days} check-in{s.checkinsLast30Days === 1 ? "" : "s"} · 30 days
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.pctChip,
                      pct >= 75
                        ? styles.pctChipGood
                        : pct >= 50
                        ? styles.pctChipMid
                        : styles.pctChipLow,
                    ]}
                  >
                    <Text style={styles.pctChipText}>{pct}%</Text>
                  </View>
                  <ChevronRightIcon size={15} color={colors.inkSoft} />
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
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
  errorText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.danger,
    marginTop: spacing.md,
  },

  greetRow: { flexDirection: "row", alignItems: "flex-start" },
  greetTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: colors.ink },
  locRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  locText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.inkSoft },

  teamCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.pitch,
    borderRadius: radius.lg,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  teamCopy: { flex: 1 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.75)",
  },
  teamHeadline: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.white,
    marginTop: 4,
    lineHeight: 23,
  },
  teamSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    marginTop: 6,
    lineHeight: 17,
  },

  inviteCard: {
    marginTop: spacing.md,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.md,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  inviteLabel: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: "#8A5F14" },
  inviteSub: { fontFamily: fonts.body, fontSize: 11, color: "#95681B", marginTop: 2 },
  inviteCode: { fontFamily: fonts.mono, fontSize: 20, color: "#6B4A10", letterSpacing: 2 },

  secLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 26,
    marginBottom: 12,
  },
  secLabel: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  secMeta: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.inkSoft },

  alertItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: 13,
  },
  alertName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  alertDetail: { fontFamily: fonts.body, fontSize: 11.5, color: colors.danger, marginTop: 2 },
  msgBtn: {
    borderWidth: 1.5,
    borderColor: colors.pitch,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  msgBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 11, color: colors.pitch },

  studentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 13,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.skySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bodyExtraBold, fontSize: 13, color: "#2C5A69" },
  studentName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  studentDetail: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  pctChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  pctChipGood: { backgroundColor: colors.pitch },
  pctChipMid: { backgroundColor: colors.gold },
  pctChipLow: { backgroundColor: colors.danger },
  pctChipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.white },

  emptyCard: {
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
