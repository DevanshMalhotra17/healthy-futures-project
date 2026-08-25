import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, fonts } from "@/theme";
import { weekStrip, fullSchedule } from "@/data/mockData";
import { useAuth } from "@/state/AuthContext";
import { postCheckin } from "@/api/checkins";
import { CheckIcon } from "@/components/Icons";

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { token, role } = useAuth();
  const isCoach = role === "coach";
  const [checkedIn, setCheckedIn] = useState<Record<number, "idle" | "saving" | "done" | "error">>({});

  async function handleCheckIn(index: number, title: string) {
    if (!token) {
      setCheckedIn((s) => ({ ...s, [index]: "error" }));
      return;
    }
    setCheckedIn((s) => ({ ...s, [index]: "saving" }));
    try {
      await postCheckin(title, token);
      setCheckedIn((s) => ({ ...s, [index]: "done" }));
    } catch {
      setCheckedIn((s) => ({ ...s, [index]: "error" }));
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Schedule</Text>

        <View style={styles.weekStrip}>
          {weekStrip.map((d, i) => (
            <View key={i} style={[styles.dayPill, d.active && styles.dayPillActive]}>
              <Text style={[styles.dayLabel, d.active && styles.dayLabelActive]}>{d.label}</Text>
              <Text style={[styles.dayDate, d.active && styles.dayDateActive]}>{d.date}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          {fullSchedule.map((item, i) => {
            const status = checkedIn[i] || "idle";
            return (
              <View style={styles.agendaItem} key={i}>
                <View style={styles.agendaDay}>
                  <Text style={styles.agendaDayText}>{item.day}</Text>
                  <Text style={styles.agendaDateText}>{item.date}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.agendaTitle}>{item.title}</Text>
                  <Text style={styles.agendaDetail}>{item.detail}</Text>
                  {status === "error" && !isCoach && (
                    <Text style={styles.errorText}>
                      {token ? "Couldn't check in — try again." : "Log in to check in."}
                    </Text>
                  )}
                </View>
                {!isCoach && (
                  <Pressable
                    style={[styles.checkBtn, status === "done" && styles.checkBtnDone]}
                    onPress={() => handleCheckIn(i, item.title)}
                    disabled={status === "saving" || status === "done"}
                  >
                    {status === "saving" ? (
                      <ActivityIndicator size="small" color={colors.pitch} />
                    ) : status === "done" ? (
                      <CheckIcon size={13} color={colors.white} />
                    ) : (
                      <Text style={styles.checkBtnText}>Check in</Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <Pressable style={styles.calBtn}>
          <Text style={styles.calBtnText}>
            {isCoach ? "+ Add session" : "+ Add pickup reminder"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  container: { paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 23, color: colors.ink },

  weekStrip: { flexDirection: "row", gap: 7, marginTop: 16, marginBottom: 20 },
  dayPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayPillActive: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  dayLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.inkSoft, textTransform: "uppercase" },
  dayLabelActive: { color: "rgba(255,255,255,0.8)" },
  dayDate: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink, marginTop: 2 },
  dayDateActive: { color: colors.white },

  agendaItem: {
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 13,
  },
  agendaDay: { width: 42, alignItems: "center" },
  agendaDayText: { fontFamily: fonts.mono, fontSize: 16, color: colors.pitch },
  agendaDateText: { fontFamily: fonts.body, fontSize: 9.5, color: colors.inkSoft, textTransform: "uppercase" },
  agendaTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  agendaDetail: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2, lineHeight: 15 },
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

  calBtn: {
    marginTop: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.pitch,
    borderStyle: "dashed",
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  calBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.pitch },
});
