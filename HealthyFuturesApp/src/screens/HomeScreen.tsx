import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, fonts } from "@/theme";
import { companions } from "@/data/mockData";
import { PinIcon, FlameIcon, CheckIcon } from "@/components/Icons";
import ProgressRing from "@/components/ProgressRing";
import CompanionCard from "@/components/CompanionCard";
import HealthScoreCard from "@/components/HealthScoreCard";
import PracticeVideoUpload from "@/components/PracticeVideoUpload";
import TrendsSection from "@/components/TrendsSection";
import { useAuth } from "@/state/AuthContext";
import { greetingFor, firstNameOf, coachTitle } from "@/utils/greeting";
import { getCriteria, CriteriaCard } from "@/api/criteria";
import { getDerivedDay, DerivedDay } from "@/api/routines";
import { listSessions, TrainingSession } from "@/api/sessions";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { RootTabParamList } from "@/navigation/RootNavigator";

type Props = BottomTabScreenProps<RootTabParamList, "Home">;

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { fullName, token, coach } = useAuth();
  const [card, setCard] = useState<CriteriaCard | null>(null);
  const [day, setDay] = useState<DerivedDay | null>(null);
  const [upcoming, setUpcoming] = useState<TrainingSession[]>([]);
  const [loadingCard, setLoadingCard] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setLoadingCard(false);
      return;
    }
    const [criteriaResult, dayResult, sessionsResult] = await Promise.allSettled([
      getCriteria(undefined, token),
      getDerivedDay(token),
      listSessions(token),
    ]);
    if (criteriaResult.status === "fulfilled") setCard(criteriaResult.value);
    if (dayResult.status === "fulfilled") setDay(dayResult.value);
    if (sessionsResult.status === "fulfilled") {
      const now = Date.now();
      setUpcoming(
        sessionsResult.value
          .filter((s) => new Date(s.startsAt).getTime() >= now)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
          .slice(0, 3)
      );
    }
    setLoadingCard(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

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
            {coach && (
              <View style={styles.locRow}>
                <PinIcon size={13} color={colors.inkSoft} />
                <Text style={styles.locText}>{coachTitle(coach.fullName)}</Text>
              </View>
            )}
          </View>
          {day !== null && day.met_count > 0 && (
            <View style={styles.streakChip}>
              <FlameIcon size={13} />
              <Text style={styles.streakText}>{day.met_count}</Text>
            </View>
          )}
        </View>

        {/* Today, derived from the device health app, practice clips and meal photos.
            Read-only on purpose: nothing here can simply be ticked. */}
        <View style={styles.ringCard}>
          <ProgressRing
            progress={day ? day.met_count / day.total : 0}
            centerValue={day ? `${day.met_count}/${day.total}` : "-"}
            centerLabel="Today"
          />
          <View style={styles.ringCopy}>
            <Text style={styles.eyebrow}>Today</Text>
            <Text style={styles.ringHeadline}>
              {day && day.met_count === day.total ? "All done." : "Your day so far"}
            </Text>
            <Text style={styles.ringSub}>
              {day?.session_title
                ? `Measured around ${day.session_title}.`
                : "Filled in from your health app, clips and meal photos."}
            </Text>
          </View>
        </View>

        {day && (
          <View style={styles.dayList}>
            {day.items.map((item) => (
              <View style={styles.dayRow} key={item.key}>
                <View style={[styles.dayDot, item.met && styles.dayDotMet]}>
                  {item.met && <CheckIcon size={10} color={colors.white} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dayLabel, item.met && styles.dayLabelMet]}>
                    {item.label}
                  </Text>
                  <Text style={styles.dayDetail}>{item.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Practice video upload */}
        <View style={{ marginTop: spacing.md }}>
          <TrendsSection />

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

        {/* Coming up — real sessions from the coach's schedule */}
        <View style={styles.secLabelRow}>
          <Text style={styles.secLabel}>Coming up</Text>
          <Text style={styles.secLink} onPress={() => navigation.navigate("Schedule")}>
            See all
          </Text>
        </View>
        <View style={{ gap: spacing.sm }}>
          {upcoming.length === 0 ? (
            <Text style={styles.levelEmpty}>
              No sessions scheduled yet — your coach will add them.
            </Text>
          ) : (
            upcoming.map((item) => {
              const start = new Date(item.startsAt);
              const end = item.endsAt ? new Date(item.endsAt) : null;
              return (
                <View style={styles.agendaItem} key={item.id}>
                  <View style={styles.agendaDay}>
                    <Text style={styles.agendaDayText}>
                      {start.toLocaleDateString([], { weekday: "short" }).toUpperCase()}
                    </Text>
                    <Text style={styles.agendaDateText}>
                      {start.toLocaleDateString([], { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agendaTitle}>{item.title}</Text>
                    <Text style={styles.agendaDetail}>
                      {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {end
                        ? ` – ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                        : ""}
                      {item.location ? ` · ${item.location}` : ""}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Level up — coach-rated criteria, plus auto-computed attendance */}
        <View style={styles.levelCard}>
          <View style={styles.levelTop}>
            <Text style={styles.levelTitle}>Level up</Text>
            {card && (
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>
                  {card.met_count} / {card.total} this month
                </Text>
              </View>
            )}
          </View>

          {loadingCard ? (
            <View style={{ paddingVertical: spacing.lg, alignItems: "center" }}>
              <ActivityIndicator color={colors.pitch} />
            </View>
          ) : !card ? (
            <Text style={styles.levelEmpty}>
              Log in to see your progress toward the next level.
            </Text>
          ) : (
            <>
              <View style={{ marginTop: spacing.md, gap: 9 }}>
                {card.items.map((c) => (
                  <View style={styles.critItem} key={c.key}>
                    <View style={[styles.critDot, c.met ? styles.critDotOn : styles.critDotOff]}>
                      {c.met && <CheckIcon size={10} color={colors.white} />}
                    </View>
                    <Text style={[styles.critLabel, !c.met && { color: colors.inkSoft }]}>
                      {c.label}
                    </Text>
                    {c.detail && <Text style={styles.critDetail}>{c.detail}</Text>}
                  </View>
                ))}
              </View>
              {!card.rated && (
                <Text style={styles.levelEmpty}>
                  Your coach hasn't rated this month yet. Attendance updates automatically.
                </Text>
              )}
              {card.note && (
                <View style={styles.noteBlock}>
                  <Text style={styles.noteLabel}>Coach note</Text>
                  <Text style={styles.noteText}>{card.note}</Text>
                </View>
              )}
            </>
          )}
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
  dayList: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 4,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dayDot: {
    width: 19,
    height: 19,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  dayDotMet: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  dayLabel: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.inkSoft },
  dayLabelMet: { color: colors.ink },
  dayDetail: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkSoft, marginTop: 1 },
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
  critDetail: { fontFamily: fonts.mono, fontSize: 10, color: colors.inkSoft, marginLeft: "auto" },
  levelEmpty: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: spacing.md,
    lineHeight: 16,
  },
  noteBlock: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  noteLabel: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  noteText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.ink,
    marginTop: 4,
    lineHeight: 17,
  },
});
