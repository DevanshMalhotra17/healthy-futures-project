import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import { getNutritionProfile, saveNutritionProfile } from "@/api/nutrition";

// The nutrition companion asks for age and allergies once. This is the only way
// back in to change them — an allergy especially must never be a one-shot answer.
export default function NutritionProfileCard() {
  const { token } = useAuth();
  const [age, setAge] = useState("");
  const [allergies, setAllergies] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getNutritionProfile(token)
      .then((p) => {
        if (cancelled) return;
        if (p.age !== null) setAge(String(p.age));
        if (p.allergies) setAllergies(p.allergies);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    const ageNum = Number.parseInt(age, 10);
    if (!Number.isFinite(ageNum) || ageNum < 5 || ageNum > 120) {
      setError("Enter a real age.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveNutritionProfile({ age: ageNum, allergies: allergies.trim() }, token);
      setSaved(true);
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!token) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Food & allergies</Text>
      <Text style={styles.sub}>Used by the Nutrition companion to score your meals.</Text>

      {loading ? (
        <ActivityIndicator color={colors.pitch} style={{ marginTop: 14 }} />
      ) : (
        <>
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={(t) => {
              setAge(t);
              setSaved(false);
            }}
            placeholder="14"
            placeholderTextColor={colors.inkSoft}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Allergies or foods to avoid</Text>
          <TextInput
            style={styles.input}
            value={allergies}
            onChangeText={(t) => {
              setAllergies(t);
              setSaved(false);
            }}
            placeholder="peanuts, dairy — leave blank if none"
            placeholderTextColor={colors.inkSoft}
          />

          <Pressable
            style={[styles.btn, saving && styles.btnDisabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.btnText}>{saved ? "Saved" : "Save"}</Text>
            )}
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 16,
  },
  title: { fontFamily: fonts.display, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 14,
  },
  input: {
    marginTop: 6,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  btn: {
    marginTop: 14,
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.white },
  error: { fontFamily: fonts.body, fontSize: 11.5, color: colors.danger, marginTop: 10 },
});
