import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import {
  getToday,
  updateToday,
  FITNESS_ITEMS,
  HABIT_ITEMS,
  FITNESS_DAYS_TARGET,
  RoutineField,
  RoutineSummary,
  RoutineItem,
  syncHealth,
} from "@/api/routines";
import { CheckIcon, FlameIcon } from "@/components/Icons";
import { isHealthAvailable, readToday } from "@/utils/health";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { RootTabParamList } from "@/navigation/RootNavigator";

type Props = BottomTabScreenProps<RootTabParamList, "Routine">;

export default function RoutineScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  // A nudge about one habit ("had your water?") highlights that row so the
  // student sees what it meant without hunting for it.
  const focus = route.params?.focus;
  const [data, setData] = useState<RoutineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<RoutineField | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setData(await getToday(token));
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

  // Pull exercise minutes and sleep from the device once per mount. Best-effort:
  // the routine screen must work identically on Android, in Expo Go, and for
  // anyone who declines Health access.
  useEffect(() => {
    if (!token || !isHealthAvailable()) return;
    let cancelled = false;
    (async () => {
      const result = await readToday();
      if (cancelled || !result.ok) return;
      const { activeMinutes, sleepHours } = result.reading;
      if (activeMinutes === null && sleepHours === null) return;
      try {
        const synced = await syncHealth(
          { active_minutes: activeMinutes, sleep_hours: sleepHours },
          token
        );
        if (!cancelled) setData((cur) => (cur ? { ...cur, today: synced.today } : cur));
      } catch {
        // Leave the manually-loaded day in place.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggle(field: RoutineField) {
    if (!token || !data || saving) return;
    const next = !data.today[field];

    // Optimistic: the checkbox should respond instantly, then reconcile with
    // the server's recomputed streak and weekly counts.
    setData({ ...data, today: { ...data.today, [field]: next } });
    setSaving(field);
    try {
      setData(await updateToday({ [field]: next }, token));
      setError(false);
    } catch {
      setData({ ...data, today: { ...data.today, [field]: !next } });
      setError(true);
    } finally {
      setSaving(null);
    }
  }

  if (!token) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notice}>Log in from the Profile tab to track your routine.</Text>
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

  const today = data?.today;
  const doneToday = today
    ? [...FITNESS_ITEMS, ...HABIT_ITEMS].filter((i) => today[i.key]).length
    : 0;
  const totalItems = FITNESS_ITEMS.length + HABIT_ITEMS.length;
  const fitnessDays = data?.fitness_days_this_week ?? 0;
  const streak = data?.habit_streak ?? 0;

  function renderItem(item: RoutineItem) {
    const checked = Boolean(today?.[item.key]);

    // Show the real number when a device supplied it, so a student can see the
    // tick wasn't guessed — and that tapping overrides it.
    let measured: string | null = null;
    if (item.key === "active_play" && today?.active_minutes != null) {
      measured =
        today.active_source === "health"
          ? `${today.active_minutes} min from Apple Health`
          : `${today.active_minutes} min measured · you set this`;
    }
    if (item.key === "sleep" && today?.sleep_hours != null) {
      measured =
        today.sleep_source === "health"
          ? `${today.sleep_hours} h from Apple Health`
          : `${today.sleep_hours} h measured · you set this`;
    }
    return (
      <Pressable
        key={item.key}
        style={[
          styles.item,
          checked && styles.itemChecked,
          focus === item.key && !checked && styles.itemFocused,
        ]}
        onPress={() => toggle(item.key)}
        disabled={saving !== null}
      >
        <View style={[styles.box, checked && styles.boxChecked]}>
          {saving === item.key ? (
            <ActivityIndicator size="small" color={checked ? colors.white : colors.pitch} />
          ) : (
            checked && <CheckIcon size={12} color={colors.white} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemLabel, checked && styles.itemLabelChecked]}>{item.label}</Text>
          <Text style={styles.itemHint}>{item.hint}</Text>
          {measured && <Text style={styles.itemMeasured}>{measured}</Text>}
        </View>
      </Pressable>
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
        <Text style={styles.title}>At-home routine</Text>
        <Text style={styles.subtitle}>Tap each one as you finish it today.</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryValue}>
              {doneToday}
              <Text style={styles.summaryOf}>/{totalItems}</Text>
            </Text>
            <Text style={styles.summaryLabel}>Today</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryValue}>
              {fitnessDays}
              <Text style={styles.summaryOf}>/{FITNESS_DAYS_TARGET}</Text>
            </Text>
            <Text style={styles.summaryLabel}>Fitness days</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}>
            <View style={styles.streakRow}>
              {streak > 0 && <FlameIcon size={14} />}
              <Text style={styles.summaryValue}>{streak}</Text>
            </View>
            <Text style={styles.summaryLabel}>Habit streak</Text>
          </View>
        </View>

        {fitnessDays >= FITNESS_DAYS_TARGET && (
          <View style={styles.winBanner}>
            <Text style={styles.winText}>
              You've hit {fitnessDays} fitness {fitnessDays === 1 ? "day" : "days"} this week — target met.
            </Text>
          </View>
        )}

        {error && (
          <Text style={styles.errorText}>Couldn't reach the server — pull down to retry.</Text>
        )}

        <Text style={styles.sectionLabel}>Fitness</Text>
        <Text style={styles.sectionHint}>3–5 days per week</Text>
        <View style={styles.group}>{FITNESS_ITEMS.map(renderItem)}</View>

        <Text style={styles.sectionLabel}>Healthy habits</Text>
        <Text style={styles.sectionHint}>Every day</Text>
        <View style={styles.group}>{HABIT_ITEMS.map(renderItem)}</View>
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
  errorText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.danger,
    marginTop: spacing.md,
  },

  summaryCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.pitch,
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  summaryBlock: { flex: 1, alignItems: "center" },
  summaryDivider: { width: 1, height: 34, backgroundColor: "rgba(255,255,255,0.22)" },
  summaryValue: { fontFamily: fonts.mono, fontSize: 22, color: colors.white },
  summaryOf: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  summaryLabel: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.8)",
    marginTop: 3,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 4 },

  winBanner: {
    marginTop: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    padding: 12,
  },
  winText: { fontFamily: fonts.bodyBold, fontSize: 12, color: "#8A5F14", lineHeight: 17 },

  sectionLabel: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, marginTop: 26 },
  sectionHint: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.inkSoft, marginTop: 2 },
  group: { marginTop: 12, gap: spacing.sm },

  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 14,
  },
  itemChecked: { borderColor: colors.pitch, backgroundColor: "#F2F7F3" },
  itemFocused: { borderColor: colors.gold, borderWidth: 2, backgroundColor: colors.goldSoft },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.8,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  itemLabel: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.ink },
  itemLabelChecked: { color: colors.pitchDark },
  itemHint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  itemMeasured: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.pitch,
    marginTop: 3,
  },
});
