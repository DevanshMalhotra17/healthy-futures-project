import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, fonts } from "@/theme";
import {
  getRecipeCompatibility,
  getNutritionProfile,
  saveNutritionProfile,
  RecipeCompatibilityResponse,
  MEAL_TYPES,
  MealType,
} from "@/api/nutrition";
import { ApiError } from "@/api/client";
import { useAuth } from "@/state/AuthContext";
import HealthSources from "@/components/HealthSources";

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
  const [photo, setPhoto] = useState<{ uri: string; base64: string; mime: string } | null>(null);
  // Age and allergies are asked once, then never again. `null` while we find out.
  const [needsProfile, setNeedsProfile] = useState<boolean | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getNutritionProfile(token)
      .then((p) => {
        if (cancelled) return;
        setNeedsProfile(!p.complete);
        if (p.age !== null) setAge(String(p.age));
        if (p.allergies) setAllergies(p.allergies);
      })
      // If the lookup fails, ask — a wrong prompt beats losing the allergy note.
      .catch(() => !cancelled && setNeedsProfile(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function storeProfile() {
    const ageNum = Number.parseInt(age, 10);
    if (!Number.isFinite(ageNum) || ageNum < 5 || ageNum > 120) {
      setError("Enter your age so the advice fits you.");
      return;
    }
    setSavingProfile(true);
    setError(null);
    try {
      await saveNutritionProfile(
        { age: ageNum, allergies: allergies.trim() },
        token
      );
      setNeedsProfile(false);
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  // The photo is the evidence, so it has to come from the device rather than a
  // text box. Library is allowed too — a first shot is often blurry.
  async function pickPhoto(source: "camera" | "library") {
    setError(null);
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError("Camera access is needed to photograph your meal.");
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.6,
        base64: true,
      };
      const res =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      const asset = res.canceled ? null : res.assets?.[0];
      if (!asset?.base64) return;
      setPhoto({
        uri: asset.uri,
        base64: asset.base64,
        mime: asset.mimeType ?? "image/jpeg",
      });
      setResult(null);
    } catch {
      setError("Couldn't open the camera. Try again.");
    }
  }

  async function handleAnalyze() {
    if (!photo || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const servingCount = Number.parseInt(servings, 10);
      // Age, allergies and diet are deliberately omitted: the server reads them
      // from the saved profile, so there's one source of truth.
      const response = await getRecipeCompatibility(
        {
          image: photo.base64,
          image_media_type: photo.mime,
          recipe_text: recipeText.trim() || undefined,
          servings: Number.isFinite(servingCount) && servingCount > 0 ? servingCount : undefined,
          is_athlete: true,
          meal_type: mealType ?? undefined,
          snack_time:
            mealType === "snack" && snackTime.trim() ? snackTime.trim() : undefined,
        },
        token
      );
      setResult(response);
    } catch (e) {
      // status 0 means the request never completed, so the client's own message
      // (timeout vs unreachable) is the useful one.
      const message =
        e instanceof ApiError
          ? e.status === 0
            ? e.message
            : `The nutrition companion couldn't analyze that (${e.status}). Try again in a moment.`
          : "Couldn't reach the nutrition companion. Check your connection and try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // Asked once, on first use. Everything after this reads the saved profile.
  if (needsProfile === true) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>First, two quick things</Text>
        <Text style={styles.sub}>
          We only ask once. This shapes every meal score from here on.
        </Text>

        <Text style={styles.fieldLabel}>How old are you?</Text>
        <TextInput
          style={styles.smallInput}
          value={age}
          onChangeText={setAge}
          placeholder="14"
          placeholderTextColor="rgba(255,255,255,0.4)"
          keyboardType="number-pad"
        />

        <Text style={styles.fieldLabel}>Any allergies or foods to avoid?</Text>
        <TextInput
          style={styles.smallInput}
          value={allergies}
          onChangeText={setAllergies}
          placeholder="peanuts, dairy — leave blank if none"
          placeholderTextColor="rgba(255,255,255,0.4)"
        />

        <Pressable
          style={[styles.button, savingProfile && styles.buttonDisabled]}
          onPress={storeProfile}
          disabled={savingProfile}
        >
          {savingProfile ? (
            <ActivityIndicator color="#3B2A05" />
          ) : (
            <Text style={styles.buttonText}>Save and continue</Text>
          )}
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Snap your meal</Text>
      <Text style={styles.sub}>
        Take a photo of your plate — the score comes from what's actually there.
      </Text>

      {photo ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
          <Pressable style={styles.retake} onPress={() => pickPhoto("camera")}>
            <Text style={styles.retakeText}>Retake</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.pickRow}>
          <Pressable style={styles.pickBtn} onPress={() => pickPhoto("camera")}>
            <Text style={styles.pickBtnText}>Take photo</Text>
          </Pressable>
          <Pressable
            style={[styles.pickBtn, styles.pickBtnGhost]}
            onPress={() => pickPhoto("library")}
          >
            <Text style={[styles.pickBtnText, styles.pickBtnTextGhost]}>Choose photo</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.fieldLabel}>Anything to add? (optional)</Text>
      <TextInput
        style={styles.smallInput}
        placeholder="e.g. grilled, no butter"
        placeholderTextColor="rgba(255,255,255,0.4)"
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

      <Text style={styles.fieldLabel}>Servings</Text>
      <TextInput
        style={styles.smallInput}
        value={servings}
        onChangeText={setServings}
        placeholder="1"
        placeholderTextColor="rgba(255,255,255,0.4)"
        keyboardType="number-pad"
      />

      <Pressable
        style={[styles.button, (loading || !photo) && styles.buttonDisabled]}
        onPress={handleAnalyze}
        disabled={loading || !photo}
      >
        {loading ? (
          <ActivityIndicator color="#3B2A05" />
        ) : (
          <Text style={styles.buttonText}>
            {photo ? "Analyze this meal" : "Add a photo first"}
          </Text>
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
          {result.health_labels?.length > 0 && (
            <View style={styles.labelWrap}>
              {result.health_labels.map((l, i) => (
                <View key={i} style={styles.labelChip}>
                  <Text style={styles.labelChipText}>{l}</Text>
                </View>
              ))}
            </View>
          )}

          {result.ingredient_benefits?.length > 0 && (
            <View style={styles.benefitsBox}>
              <Text style={styles.benefitsTitle}>What's working</Text>
              {result.ingredient_benefits.map((b, i) => (
                <Text key={i} style={styles.benefitText}>
                  <Text style={styles.benefitName}>{b.ingredient}: </Text>
                  {b.benefits.join(", ")}
                </Text>
              ))}
            </View>
          )}

          {result.ingredient_substitutions?.length > 0 && (
            <View style={styles.swapsBox}>
              <Text style={styles.swapsTitle}>Try this next time</Text>
              {result.ingredient_substitutions.map((sub, i) => (
                <Text key={i} style={styles.swapText}>
                  {typeof sub === "string" ? sub : JSON.stringify(sub)}
                </Text>
              ))}
            </View>
          )}
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

      {/* App Review 1.4.1: the score, portion and timing advice are health
          information, so the sources ship alongside them. Outside the result
          block on purpose — visible before you ever run an analysis, and it
          lands directly beneath the result once you have one. */}
      <HealthSources topics={["nutrition"]} tone="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.pitchDark, borderRadius: radius.lg, padding: 20 },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
  sub: { fontFamily: fonts.body, fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 3 },
  pickRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  pickBtn: {
    flex: 1,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: "center",
  },
  pickBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  pickBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: "#3B2A05" },
  pickBtnTextGhost: { color: colors.white },
  photoWrap: { marginTop: 14, borderRadius: 14, overflow: "hidden" },
  photo: { width: "100%", height: 190, backgroundColor: "rgba(255,255,255,0.06)" },
  retake: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retakeText: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.white },
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
  labelWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  labelChip: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  labelChipText: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: "rgba(255,255,255,0.9)" },
  benefitsBox: { marginTop: 14, gap: 6 },
  benefitsTitle: {
    fontFamily: fonts.bodyExtraBold,
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  benefitText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 18,
  },
  benefitName: { fontFamily: fonts.bodyBold, color: colors.white },
  swapsBox: {
    marginTop: 14,
    backgroundColor: "rgba(217,164,65,0.14)",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  swapsTitle: {
    fontFamily: fonts.bodyExtraBold,
    fontSize: 11,
    color: colors.gold,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  swapText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: "rgba(255,255,255,0.92)",
    lineHeight: 18,
  },
  warningsBox: { marginTop: 12, gap: 6 },
  warningText: { fontFamily: fonts.body, fontSize: 11.5, color: "#F3D08A", lineHeight: 16 },
});
