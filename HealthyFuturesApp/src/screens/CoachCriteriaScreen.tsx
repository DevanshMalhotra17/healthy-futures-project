import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import { getRoster, RosterStudent } from "@/api/coach";
import { getCriteria, rateCriteria, CriteriaCard, RatedCriterion } from "@/api/criteria";
import { getHistory, FITNESS_DAYS_TARGET } from "@/api/routines";
import { CheckIcon } from "@/components/Icons";

export default function CoachCriteriaScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [card, setCard] = useState<CriteriaCard | null>(null);
  const [routine, setRoutine] = useState<{ fitness_days_this_week: number; habit_streak: number } | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingCard, setLoadingCard] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    getRoster(token)
      .then(({ students }) => {
        setRoster(students);
        if (students.length > 0) setSelectedId((cur) => cur ?? students[0].id);
      })
      .catch(() => setError("Couldn't load your roster."))
      .finally(() => setLoading(false));
  }, [token]);

  const loadCard = useCallback(async () => {
    if (!token || !selectedId) return;
    setLoadingCard(true);
    try {
      const [criteria, history] = await Promise.all([
        getCriteria(selectedId, token),
        getHistory(selectedId, token).catch(() => null),
      ]);
      setCard(criteria);
      setNote(criteria.note ?? "");
      setRoutine(
        history
          ? { fitness_days_this_week: history.fitness_days_this_week, habit_streak: history.habit_streak }
          : null
      );
      setError(null);
    } catch {
      setError("Couldn't load that student's progress.");
    } finally {
      setLoadingCard(false);
    }
  }, [token, selectedId]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  async function toggle(key: RatedCriterion, current: boolean) {
    if (!token || !selectedId || savingKey) return;
    setSavingKey(key);
    try {
      setCard(await rateCriteria(selectedId, { [key]: !current }, token));
      setError(null);
    } catch {
      setError("Couldn't save that rating.");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveNote() {
    if (!token || !selectedId) return;
    setSavingKey("note");
    try {
      setCard(await rateCriteria(selectedId, { note: note.trim() || null }, token));
      setError(null);
    } catch {
      setError("Couldn't save the note.");
    } finally {
      setSavingKey(null);
    }
  }

  if (!token) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notice}>Log in from the Profile tab to rate your students.</Text>
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

  if (roster.length === 0) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top, paddingHorizontal: spacing.lg }]}>
        <Text style={styles.notice}>
          No students yet. Share your invite code from the Profile tab so they can join.
        </Text>
      </View>
    );
  }

  const selected = roster.find((s) => s.id === selectedId);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Level up</Text>
        <Text style={styles.subtitle}>Rate each player against the program criteria.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {roster.map((s) => {
            const active = s.id === selectedId;
            return (
              <Pressable
                key={s.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedId(s.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.fullName}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {loadingCard || !card ? (
          <View style={[styles.center, { paddingVertical: spacing.xl }]}>
            <ActivityIndicator color={colors.pitch} />
          </View>
        ) : (
          <>
            <View style={styles.scoreCard}>
              <Text style={styles.scoreValue}>
                {card.met_count}
                <Text style={styles.scoreOf}>/{card.total}</Text>
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.scoreName}>{selected?.fullName}</Text>
                <Text style={styles.scoreMeta}>
                  {card.met_count === card.total
                    ? "All criteria met — ready to move up."
                    : `${card.total - card.met_count} still to go this month.`}
                </Text>
              </View>
            </View>

            {routine && (
              <View style={styles.routineRow}>
                <View style={styles.routinePill}>
                  <Text style={styles.routinePillValue}>
                    {routine.fitness_days_this_week}/{FITNESS_DAYS_TARGET}
                  </Text>
                  <Text style={styles.routinePillLabel}>Fitness days</Text>
                </View>
                <View style={styles.routinePill}>
                  <Text style={styles.routinePillValue}>{routine.habit_streak}</Text>
                  <Text style={styles.routinePillLabel}>Habit streak</Text>
                </View>
                <Text style={styles.routineHint}>At-home routine, self-logged</Text>
              </View>
            )}

            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {card.items.map((item) => {
                const isSaving = savingKey === item.key;
                if (item.auto) {
                  return (
                    <View key={item.key} style={[styles.item, styles.itemAuto]}>
                      <View style={[styles.box, item.met && styles.boxChecked, styles.boxAuto]}>
                        {item.met && <CheckIcon size={12} color={colors.white} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemLabel}>{item.label}</Text>
                        <Text style={styles.itemHint}>{item.detail}</Text>
                      </View>
                      <Text style={styles.autoTag}>AUTO</Text>
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.item, item.met && styles.itemChecked]}
                    onPress={() => toggle(item.key as RatedCriterion, item.met)}
                    disabled={savingKey !== null}
                  >
                    <View style={[styles.box, item.met && styles.boxChecked]}>
                      {isSaving ? (
                        <ActivityIndicator
                          size="small"
                          color={item.met ? colors.white : colors.pitch}
                        />
                      ) : (
                        item.met && <CheckIcon size={12} color={colors.white} />
                      )}
                    </View>
                    <Text style={[styles.itemLabel, { flex: 1 }]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.noteLabel}>Coach note</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="What should this player focus on next?"
              placeholderTextColor={colors.inkSoft}
              multiline
            />
            <Pressable
              style={styles.saveBtn}
              onPress={saveNote}
              disabled={savingKey !== null || note === (card.note ?? "")}
            >
              {savingKey === "note" ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveBtnText}>Save note</Text>
              )}
            </Pressable>
          </>
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
    lineHeight: 19,
  },
  title: { fontFamily: fonts.display, fontSize: 23, color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, marginTop: 4 },
  errorText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.danger, marginTop: spacing.md },

  chipRow: { flexDirection: "row", marginTop: spacing.md },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 8,
  },
  chipActive: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.ink },
  chipTextActive: { color: colors.white },

  scoreCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.pitch,
    borderRadius: radius.lg,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  scoreValue: { fontFamily: fonts.mono, fontSize: 30, color: colors.white },
  scoreOf: { fontSize: 15, color: "rgba(255,255,255,0.7)" },
  scoreName: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
  scoreMeta: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: "rgba(255,255,255,0.85)",
    marginTop: 3,
    lineHeight: 16,
  },

  routineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  routinePill: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  routinePillValue: { fontFamily: fonts.mono, fontSize: 15, color: "#2C5A69" },
  routinePillLabel: { fontFamily: fonts.body, fontSize: 9.5, color: "#2C5A69", marginTop: 1 },
  routineHint: { flex: 1, fontFamily: fonts.body, fontSize: 10.5, color: colors.inkSoft },

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
  itemAuto: { backgroundColor: colors.paper, borderStyle: "dashed" },
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
  boxAuto: { opacity: 0.85 },
  itemLabel: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.ink },
  itemHint: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  autoTag: { fontFamily: fonts.mono, fontSize: 9, color: colors.inkSoft, letterSpacing: 0.8 },

  noteLabel: { fontFamily: fonts.display, fontSize: 15, color: colors.ink, marginTop: 26 },
  noteInput: {
    marginTop: 8,
    minHeight: 76,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 12,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
    textAlignVertical: "top",
  },
  saveBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 13, color: colors.white },
});
