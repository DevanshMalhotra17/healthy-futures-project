import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { colors, radius, fonts } from "@/theme";
import {
  getRecipeCompatibility,
  RecipeCompatibilityResponse,
  MEAL_TYPES,
  MealType,
} from "@/api/nutrition";
import { ApiError } from "@/api/client";
import { useAuth } from "@/state/AuthContext";

export default function NutritionDetail() {
  const { token } = useAuth();
  const [recipeText, setRecipeText] = useState("");
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [snackTime, setSnackTime] = useState("");
  const [servings, setServings] = useState("");
  const [age, setAge] = useState("");
  const [allergies, setAllergies] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecipeCompatibilityResponse | null>(null);

  async function handleAnalyze() {
    if (!recipeText.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const servingCount = Number.parseInt(servings, 10);
      const ageValue = Number.parseInt(age, 10);
      const response = await getRecipeCompatibility(
        {
          recipe_text: recipeText.trim(),
          servings: Number.isFinite(servingCount) && servingCount > 0 ? servingCount : undefined,
          age: Number.isFinite(ageValue) && ageValue > 0 ? ageValue : undefined,
          allergies: allergies.trim() || undefined,
          is_athlete: true,
          meal_type: mealType ?? undefined,
          snack_time:
            mealType === "snack" && snackTime.trim() ? snackTime.trim() : undefined,
        },
        token
      );
      setResult(response);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? `The nutrition companion couldn't analyze that (${e.status}). Try again in a moment.`
          : "Couldn't reach the nutrition companion. Check your connection and try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>What are you eating?</Text>
      <Text style={styles.sub}>Paste a recipe or list of ingredients for a real analysis.</Text>

      <TextInput
        style={styles.input}
        placeholder="e.g. grilled chicken, brown rice, broccoli, olive oil"
        placeholderTextColor="rgba(255,255,255,0.4)"
        multiline
        value={recipeText}
        onChangeText={setRecipeText}
      />

      <Text style={styles.fieldLabel}>Which meal?</Text>
      <View style={styles.chipWrap}>
        {MEAL_TYPES.map((m) => {
          const active = m.key === mealType;
          return (
            <Pressable
              key={m.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setMealType(active ? null : m.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mealType === "snack" && (
        <>
          <Text style={styles.fieldLabel}>What time?</Text>
          <TextInput
            style={styles.smallInput}
            value={snackTime}
            onChangeText={setSnackTime}
            placeholder="4pm"
            placeholderTextColor="rgba(255,255,255,0.4)"
          />
        </>
      )}

      <View style={styles.fieldRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Servings</Text>
          <TextInput
            style={styles.smallInput}
            value={servings}
            onChangeText={setServings}
            placeholder="1"
            placeholderTextColor="rgba(255,255,255,0.4)"
            keyboardType="number-pad"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Your age</Text>
          <TextInput
            style={styles.smallInput}
            value={age}
            onChangeText={setAge}
            placeholder="14"
            placeholderTextColor="rgba(255,255,255,0.4)"
            keyboardType="number-pad"
          />
        </View>
      </View>

      <Text style={styles.fieldLabel}>Allergies or foods to avoid</Text>
      <TextInput
        style={styles.smallInput}
        value={allergies}
        onChangeText={setAllergies}
        placeholder="peanuts, dairy — leave blank if none"
        placeholderTextColor="rgba(255,255,255,0.4)"
      />

      <Pressable
        style={[styles.button, (loading || !recipeText.trim()) && styles.buttonDisabled]}
        onPress={handleAnalyze}
        disabled={loading || !recipeText.trim()}
      >
        {loading ? (
          <ActivityIndicator color="#3B2A05" />
        ) : (
          <Text style={styles.buttonText}>Analyze this meal</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {result && (
        <View style={styles.result}>
          {result.health_score != null && (
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>{Math.round(result.health_score)}</Text>
              <Text style={styles.scoreLabel}>/ 100 health score</Text>
            </View>
          )}
          {result.timing_note && (
            <Text style={styles.detailLine}>
              <Text style={styles.detailLabel}>Timing: </Text>
              {result.timing_note}
            </Text>
          )}
          {result.recommended_portion && (
            <Text style={styles.detailLine}>
              <Text style={styles.detailLabel}>Portion: </Text>
              {result.recommended_portion}
            </Text>
          )}
          {result.summary && <Text style={styles.summary}>{result.summary}</Text>}
          {result.warnings.length > 0 && (
            <View style={styles.warningsBox}>
              {result.warnings.map((w, i) => (
                <Text key={i} style={styles.warningText}>
                  ⚠ {w}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.pitchDark, borderRadius: radius.lg, padding: 20 },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
  sub: { fontFamily: fonts.body, fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 3 },
  input: {
    marginTop: 14,
    minHeight: 72,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 12,
    color: colors.white,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlignVertical: "top",
  },
  fieldRow: { flexDirection: "row", gap: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  chipActive: { backgroundColor: colors.gold },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: "rgba(255,255,255,0.85)" },
  chipTextActive: { color: "#3B2A05" },
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 12,
  },
  smallInput: {
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.white,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  button: {
    marginTop: 12,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.bodyExtraBold, fontSize: 13, color: "#3B2A05" },
  error: {
    marginTop: 12,
    fontFamily: fonts.body,
    fontSize: 12,
    color: "#F3B0A0",
    lineHeight: 17,
  },
  result: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
  },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  scoreValue: { fontFamily: fonts.display, fontSize: 28, color: colors.white },
  scoreLabel: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.7)" },
  detailLine: { fontFamily: fonts.body, fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginTop: 10, lineHeight: 18 },
  detailLabel: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: "rgba(255,255,255,0.9)" },
  summary: { fontFamily: fonts.body, fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginTop: 10, lineHeight: 18 },
  warningsBox: { marginTop: 12, gap: 6 },
  warningText: { fontFamily: fonts.body, fontSize: 11.5, color: "#F3D08A", lineHeight: 16 },
});
