import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { colors, radius, fonts } from "@/theme";
import {
  PRIMEFIT_TEEN_QUESTIONS,
  scorePrimeFitAnswers,
  PrimeFitAnswer,
  PrimeFitResult,
} from "@/data/primefitTeen";
import { savePrimeFitResult } from "@/api/primefit";
import { cacheLatestPrimeFitScore } from "@/data/primefitCache";
import { useAuth } from "@/state/AuthContext";

export default function PrimeFitQuiz() {
  const { token } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<PrimeFitAnswer[]>([]);
  const [result, setResult] = useState<PrimeFitResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const question = PRIMEFIT_TEEN_QUESTIONS[step];

  function handleAnswer(label: string, score: number) {
    const nextAnswers = [
      ...answers,
      { area: question.area, areaLabel: question.areaLabel, answer: label, score },
    ];
    setAnswers(nextAnswers);

    if (step + 1 < PRIMEFIT_TEEN_QUESTIONS.length) {
      setStep(step + 1);
    } else {
      const computed = scorePrimeFitAnswers(nextAnswers);
      setResult(computed);
      void cacheLatestPrimeFitScore(computed.displayScore);
      void handleSave(computed);
    }
  }

  async function handleSave(computed: PrimeFitResult) {
    setSaving(true);
    setSaveError(null);
    try {
      await savePrimeFitResult(
        {
          source: "Text",
          score: computed.displayScore,
          strongestArea: computed.strongestArea,
          weakestArea: computed.weakestArea,
          recommendation: computed.recommendation,
          summary: computed.summary,
        },
        token
      );
      setSaved(true);
    } catch {
      setSaveError("Your result is ready, but saving it to your account failed.");
    } finally {
      setSaving(false);
    }
  }

  function handleRestart() {
    setStep(0);
    setAnswers([]);
    setResult(null);
    setSaved(false);
    setSaveError(null);
  }

  if (result) {
    return (
      <View style={styles.panel}>
        <Text style={styles.resultEyebrow}>PrimeFit Quick Takeaway</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreValue}>{result.displayScore}</Text>
          <Text style={styles.scoreLabel}>/ 100 — {result.interpretation}</Text>
        </View>
        <Text style={styles.resultLine}>
          <Text style={styles.resultLabel}>Strongest: </Text>
          {result.strongestArea}
        </Text>
        <Text style={styles.resultLine}>
          <Text style={styles.resultLabel}>Focus area: </Text>
          {result.weakestArea}
        </Text>
        <Text style={styles.resultLine}>
          <Text style={styles.resultLabel}>Suggested path: </Text>
          {result.recommendation}
        </Text>

        <View style={styles.wacBox}>
          <Text style={styles.wacTitle}>Try this at WAC</Text>
          {result.wacClasses.map((c) => (
            <Text key={c.name} style={styles.wacLine}>
              {c.name} — {c.day}, {c.time} ({c.instructor})
            </Text>
          ))}
        </View>

        {saving && (
          <View style={styles.savingRow}>
            <ActivityIndicator color={colors.white} size="small" />
            <Text style={styles.savingText}>Saving your result...</Text>
          </View>
        )}
        {saved && <Text style={styles.savedText}>Saved to your account.</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <Pressable style={styles.restartBtn} onPress={handleRestart}>
          <Text style={styles.restartBtnText}>Retake assessment</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.progress}>
        Question {step + 1} of {PRIMEFIT_TEEN_QUESTIONS.length}
      </Text>
      <Text style={styles.prompt}>{question.prompt}</Text>
      <View style={styles.options}>
        {question.options.map((opt) => (
          <Pressable
            key={opt.label}
            style={styles.optionBtn}
            onPress={() => handleAnswer(opt.label, opt.score)}
          >
            <Text style={styles.optionText}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.pitchDark, borderRadius: radius.lg, padding: 20 },
  progress: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  prompt: { fontFamily: fonts.display, fontSize: 16, color: colors.white, marginTop: 8, lineHeight: 22 },
  options: { marginTop: 16, gap: 8 },
  optionBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.white },

  resultEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 8 },
  scoreValue: { fontFamily: fonts.display, fontSize: 30, color: colors.white },
  scoreLabel: { fontFamily: fonts.body, fontSize: 12.5, color: "rgba(255,255,255,0.75)" },
  resultLine: { fontFamily: fonts.body, fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginTop: 10, lineHeight: 18 },
  resultLabel: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: "rgba(255,255,255,0.9)" },

  wacBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
  },
  wacTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.gold, marginBottom: 6 },
  wacLine: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 18 },

  savingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  savingText: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.75)" },
  savedText: { fontFamily: fonts.body, fontSize: 12, color: colors.gold, marginTop: 14 },
  errorText: { fontFamily: fonts.body, fontSize: 12, color: "#F3B0A0", marginTop: 14, lineHeight: 17 },

  restartBtn: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  restartBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.white },
});
