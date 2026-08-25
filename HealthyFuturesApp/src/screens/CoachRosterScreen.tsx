import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import { getRoster, checkInStudent, RosterStudent } from "@/api/coach";
import { fullSchedule } from "@/data/mockData";
import { CheckIcon } from "@/components/Icons";

type SaveState = "idle" | "saving" | "done" | "error";

export default function CoachRosterScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [session, setSession] = useState(fullSchedule[0]?.title ?? "Training Session");
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setStudents(await getRoster(token));
    } catch {
      // leave list as-is; pull to refresh retries
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

  async function handleCheckIn(student: RosterStudent) {
    if (!token) return;
    setSaveState((s) => ({ ...s, [student.id]: "saving" }));
    try {
      await checkInStudent(student.id, session, token);
      setSaveState((s) => ({ ...s, [student.id]: "done" }));
      await load();
    } catch {
      setSaveState((s) => ({ ...s, [student.id]: "error" }));
    }
  }

  if (!token) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notice}>Log in from the Profile tab to manage your roster.</Text>
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
        <Text style={styles.title}>Take attendance</Text>
        <Text style={styles.subtitle}>Pick a session, then check students in.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sessionRow}>
          {fullSchedule.map((item) => {
            const active = item.title === session;
            return (
              <Pressable
                key={item.title}
                style={[styles.sessionChip, active && styles.sessionChipActive]}
                onPress={() => setSession(item.title)}
              >
                <Text style={[styles.sessionChipText, active && styles.sessionChipTextActive]}>
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {students.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No students yet</Text>
            <Text style={styles.emptyBody}>
              Students appear here once they sign up with your invite code.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            {students.map((s) => {
              const state = saveState[s.id] || "idle";
              return (
                <View style={styles.studentItem} key={s.id}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>{s.fullName}</Text>
                    <Text style={styles.studentDetail}>
                      {s.lastCheckinAt
                        ? `Last in ${new Date(s.lastCheckinAt).toLocaleDateString()}`
                        : "Never checked in"}
                    </Text>
                    {state === "error" && (
                      <Text style={styles.errorText}>Couldn't check in — try again.</Text>
                    )}
                  </View>
                  <Pressable
                    style={[styles.checkBtn, state === "done" && styles.checkBtnDone]}
                    onPress={() => handleCheckIn(s)}
                    disabled={state === "saving" || state === "done"}
                  >
                    {state === "saving" ? (
                      <ActivityIndicator size="small" color={colors.pitch} />
                    ) : state === "done" ? (
                      <CheckIcon size={13} color={colors.white} />
                    ) : (
                      <Text style={styles.checkBtnText}>Check in</Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
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
  subtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, marginTop: 4 },

  sessionRow: { flexDirection: "row", marginTop: spacing.md },
  sessionChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 8,
  },
  sessionChipActive: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  sessionChipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.ink },
  sessionChipTextActive: { color: colors.white },

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
  studentName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  studentDetail: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  errorText: { fontFamily: fonts.body, fontSize: 10.5, color: colors.danger, marginTop: 4 },

  checkBtn: {
    width: 74,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.pitch,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBtnDone: { backgroundColor: colors.pitch },
  checkBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 11, color: colors.pitch },

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
