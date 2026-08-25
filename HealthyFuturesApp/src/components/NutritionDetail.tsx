import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { colors, radius, fonts } from "@/theme";
import { getRecipeCompatibility, RecipeCompatibilityResponse } from "@/api/nutrition";
import { ApiError } from "@/api/client";
import { useAuth } from "@/state/AuthContext";

export default function NutritionDetail() {
  const { token } = useAuth();
  const [recipeText, setRecipeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecipeCompatibilityResponse | null>(null);

  async function handleAnalyze() {
    if (!recipeText.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await getRecipeCompatibility({ recipe_text: recipeText.trim() }, token);
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
