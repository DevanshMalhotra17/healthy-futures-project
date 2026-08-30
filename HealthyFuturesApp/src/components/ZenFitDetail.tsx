import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { colors, radius, fonts, spacing } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import {
  MOODS,
  Mood,
  ZenCheckin,
  getZenHistory,
  submitZenCheckin,
} from "@/api/zenfit";

const ENERGY_LEVELS = [1, 2, 3, 4, 5];

export default function ZenFitDetail() {
  const { token } = useAuth();
  const [mood, setMood] = useState<Mood | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // Shown after a check-in so the reward is immediate and visible.
  const [points, setPoints] = useState<{
    total: number;
    earned: number;
    target: number;
    met: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<ZenCheckin | null>(null);
  const [weekCount, setWeekCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const history = await getZenHistory(token);
      setLatest(history.checkins[0] ?? null);
      setWeekCount(history.count_last_7_days);
    } catch {
      // History is supplementary — a failure here shouldn't block a new check-in.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!mood || energy === null || saving || !token) return;
    setSaving(true);
    setError(null);
    try {
      const result = await submitZenCheckin(
        { mood, energy, note: note.trim() || undefined },
        token
      );
      setLatest(result.checkin);
      setPoints({
        total: result.characterPoints,
        earned: result.pointsEarned,
        target: result.characterPointsTarget,
        met: result.characterMet,
      });
      setWeekCount((c) => c + 1);
      setMood(null);
      setEnergy(null);
      setNote("");
    } catch {
      setError("Couldn't save that check-in. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>ZenFit</Text>
        <Text style={styles.notice}>Log in from the Profile tab to start checking in.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.panel, { alignItems: "center" }]}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  const ready = mood !== null && energy !== null;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>How are you doing today?</Text>
      <Text style={styles.sub}>
        A 30-second check-in. Only you see this.
        {weekCount > 0 ? ` ${weekCount} this week.` : ""}
      </Text>

      <Text style={styles.label}>Mood</Text>
      <View style={styles.chipWrap}>
        {MOODS.map((m) => {
          const active = m.key === mood;
          return (
            <Pressable
              key={m.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setMood(m.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Energy</Text>
      <View style={styles.energyRow}>
        {ENERGY_LEVELS.map((level) => {
          const active = energy === level;
          return (
            <Pressable
              key={level}
              style={[styles.energyDot, active && styles.energyDotActive]}
              onPress={() => setEnergy(level)}
            >
              <Text style={[styles.energyText, active && styles.energyTextActive]}>{level}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.energyHint}>1 = running on empty · 5 = full tank</Text>

      <Text style={styles.label}>Anything on your mind? (optional)</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="Tough practice, big test tomorrow..."
        placeholderTextColor="rgba(255,255,255,0.4)"
        multiline
        maxLength={500}
      />

      <Pressable
        style={[styles.submitBtn, !ready && styles.submitBtnDisabled]}
        onPress={submit}
        disabled={!ready || saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color={colors.pitchDark} />
        ) : (
          <Text style={styles.submitBtnText}>Check in</Text>
        )}
      </Pressable>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {points && (
        <View style={styles.pointsBlock}>
          <Text style={styles.pointsEarned}>+{points.earned} Character Points</Text>
          <Text style={styles.pointsTotal}>
            {points.met
              ? `${points.total} points — character criterion earned!`
              : `${points.total} of ${points.target} toward your character criterion`}
          </Text>
          <View style={styles.pointsBarTrack}>
            <View
              style={[
                styles.pointsBarFill,
                { width: `${Math.min(100, (points.total / points.target) * 100)}%` },
              ]}
            />
          </View>
        </View>
      )}

      {latest && (
        <View style={styles.replyBlock}>
          <Text style={styles.replyLabel}>
            Last check-in · {new Date(latest.created_at).toLocaleDateString()}
          </Text>
          <Text style={styles.replyMeta}>
            Feeling {latest.mood} · energy {latest.energy}/5
          </Text>
          {latest.reply ? (
            <Text style={styles.replyText}>{latest.reply}</Text>
          ) : (
            <Text style={styles.replyMuted}>
              Saved. Personalized guidance needs the assistant configured on the server.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.pitchDark, borderRadius: radius.md, padding: 16, marginTop: -4 },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  sub: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
    lineHeight: 16,
  },
  notice: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: "rgba(255,255,255,0.75)",
    marginTop: 10,
    lineHeight: 18,
  },

  label: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 16,
  },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  chipActive: { backgroundColor: colors.white },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: "rgba(255,255,255,0.85)" },
  chipTextActive: { color: colors.pitchDark },

  energyRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  energyDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  energyDotActive: { backgroundColor: colors.white },
  energyText: { fontFamily: fonts.mono, fontSize: 14, color: "rgba(255,255,255,0.85)" },
  energyTextActive: { color: colors.pitchDark },
  energyHint: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.55)",
    marginTop: 7,
  },

  input: {
    marginTop: 8,
    minHeight: 64,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: radius.sm,
    padding: 12,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.white,
    textAlignVertical: "top",
  },

  submitBtn: {
    marginTop: 14,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.pitchDark },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: "#FFC4B4",
    marginTop: 10,
  },

  pointsBlock: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.sm,
    padding: 13,
    marginTop: spacing.md,
  },
  pointsEarned: { fontFamily: fonts.bodyExtraBold, fontSize: 14, color: colors.white },
  pointsTotal: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: "rgba(255,255,255,0.8)",
    marginTop: 3,
  },
  pointsBarTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginTop: 9,
    overflow: "hidden",
  },
  pointsBarFill: { height: 5, borderRadius: 3, backgroundColor: colors.gold },
  replyBlock: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  replyLabel: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  replyMeta: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    marginTop: 5,
  },
  replyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.white,
    marginTop: 7,
    lineHeight: 19,
  },
  replyMuted: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: "rgba(255,255,255,0.6)",
    marginTop: 7,
    lineHeight: 16,
  },
});
