import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, fonts } from "@/theme";
import { companions, agenda, criteria } from "@/data/mockData";
import { PinIcon, FlameIcon, CheckIcon } from "@/components/Icons";
import ProgressRing from "@/components/ProgressRing";
import CompanionCard from "@/components/CompanionCard";
import HealthScoreCard from "@/components/HealthScoreCard";
import PracticeVideoUpload from "@/components/PracticeVideoUpload";
import { useAuth } from "@/state/AuthContext";
import { greetingFor, firstNameOf } from "@/utils/greeting";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { RootTabParamList } from "@/navigation/RootNavigator";

type Props = BottomTabScreenProps<RootTabParamList, "Home">;

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { fullName } = useAuth();
  const metCount = criteria.filter((c) => c.met).length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        <HealthScoreCard />

        {/* Greeting row */}
        <View style={styles.greetRow}>
          <View>
            <Text style={styles.greetTitle}>
              {greetingFor()},{"\n"}
              {firstNameOf(fullName)}.
            </Text>
            <View style={styles.locRow}>
              <PinIcon size={13} color={colors.inkSoft} />
              <Text style={styles.locText}>Mentors Matter · Trenton</Text>
            </View>
          </View>
          <View style={styles.streakChip}>
            <FlameIcon size={13} />
            <Text style={styles.streakText}>12</Text>
          </View>
        </View>

        {/* Pitch ring card */}
        <View style={styles.ringCard}>
          <ProgressRing progress={1} centerValue="2/2" centerLabel="Sessions" />
          <View style={styles.ringCopy}>
            <Text style={styles.eyebrow}>This week</Text>
            <Text style={styles.ringHeadline}>Full attendance,{"\n"}full effort.</Text>
            <Text style={styles.ringSub}>
              Cooper Field + WAC both logged. Keep the streak alive Saturday.
            </Text>
          </View>
        </View>

        {/* Practice video upload */}
        <View style={{ marginTop: spacing.md }}>
          <PracticeVideoUpload />
        </View>

        {/* Companions */}
        <View style={styles.secLabelRow}>
          <Text style={styles.secLabel}>Your companions</Text>
          <Text style={styles.secLink} onPress={() => navigation.navigate("Companions")}>
            See all
          </Text>
        </View>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <CompanionCard
              companion={companions[0]}
              onPress={() => navigation.navigate("Companions", { openSoccer: true })}
            />
            <CompanionCard companion={companions[1]} />
          </View>
          <View style={styles.gridRow}>
            <CompanionCard companion={companions[2]} />
            <CompanionCard companion={companions[3]} />
          </View>
        </View>

        {/* This week */}
        <View style={styles.secLabelRow}>
          <Text style={styles.secLabel}>This week</Text>
        </View>
        <View style={{ gap: spacing.sm }}>
          {agenda.map((item) => (
            <View style={styles.agendaItem} key={item.title}>
              <View style={styles.agendaDay}>
                <Text style={styles.agendaDayText}>{item.day}</Text>
                <Text style={styles.agendaDateText}>{item.date}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.agendaTitle}>{item.title}</Text>
                <Text style={styles.agendaDetail}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Level up */}
        <View style={styles.levelCard}>
          <View style={styles.levelTop}>
            <Text style={styles.levelTitle}>Level up</Text>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{metCount} / {criteria.length} this month</Text>
            </View>
          </View>
          <View style={{ marginTop: spacing.md, gap: 9 }}>
            {criteria.map((c) => (
              <View style={styles.critItem} key={c.label}>
                <View style={[styles.critDot, c.met ? styles.critDotOn : styles.critDotOff]}>
                  {c.met && <CheckIcon size={10} color={colors.white} />}
                </View>
                <Text style={[styles.critLabel, !c.met && { color: colors.inkSoft }]}>{c.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  container: { paddingHorizontal: spacing.lg },
  greetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 20 },
  greetTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: colors.ink },
  locRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  locText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.inkSoft },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.pitchDark,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  streakText: { fontFamily: fonts.mono, fontSize: 12.5, color: "#FCEFD2" },

  ringCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.pitch,
    borderRadius: radius.lg,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  ringCopy: { flex: 1 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.75)",
  },
  ringHeadline: { fontFamily: fonts.display, fontSize: 18, color: colors.white, marginTop: 4, lineHeight: 23 },
  ringSub: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 6, lineHeight: 17 },

  secLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 26,
    marginBottom: 12,
  },
  secLabel: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  secLink: { fontFamily: fonts.bodyExtraBold, fontSize: 11.5, color: colors.pitch },

  grid: { gap: spacing.sm },
  gridRow: { flexDirection: "row", gap: spacing.sm },

  agendaItem: {
    flexDirection: "row",
    gap: 13,
    alignItems: "flex-start",
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

  levelCard: {
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 18,
  },
  levelTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  levelTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  levelBadge: { backgroundColor: colors.goldSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  levelBadgeText: { fontFamily: fonts.mono, fontSize: 11, color: "#8A5F14" },
  critItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  critDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  critDotOn: { backgroundColor: colors.pitch },
  critDotOff: { borderWidth: 1.6, borderColor: colors.line },
  critLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.ink },
});
