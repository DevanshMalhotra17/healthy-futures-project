import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import {
  embedFace,
  getFaceEnrollment,
  saveFaceEnrollment,
  deleteFaceEnrollment,
  FaceError,
} from "@/api/face";

export default function FaceEnrollment() {
  const { token, role } = useAuth();
  const [enrolled, setEnrolled] = useState(false);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);
  const [consentBy, setConsentBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await getFaceEnrollment(token);
      setEnrolled(data.enrolled);
      setEnrolledAt(data.enrollment?.consent_at ?? null);
    } catch {
      // Non-critical: the section just shows as not enrolled.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function enroll() {
    if (!token) return;
    if (!consentBy.trim()) {
      setMessage("A parent or guardian's name is required before adding a photo.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setMessage("Camera access is needed to take the photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        cameraType: ImagePicker.CameraType.front,
        quality: 0.8,
      });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;

      const embedding = await embedFace({
        uri: asset.uri,
        name: asset.fileName || "face.jpg",
        mimeType: asset.mimeType,
      });
      await saveFaceEnrollment(embedding, consentBy.trim(), token);
      setEnrolled(true);
      setEnrolledAt(new Date().toISOString());
      setConsentBy("");
      setMessage(null);
    } catch (e) {
      setMessage(
        e instanceof FaceError ? e.message : "Couldn't save that photo. Try again in a moment."
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove() {
    Alert.alert(
      "Remove face data?",
      "Your face data will be deleted. Because a match photo is required, you'll be asked to add a new one next time you open the app.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await deleteFaceEnrollment(token);
              setEnrolled(false);
              setEnrolledAt(null);
            } catch {
              setMessage("Couldn't remove it. Try again.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  // Coaches aren't matched in clips, so this section is student-only.
  if (role !== "student" || loading) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Match photo</Text>

      {enrolled ? (
        <>
          <Text style={styles.body}>
            A photo is saved, so your coach can match you in match clips automatically.
            {enrolledAt ? ` Added ${new Date(enrolledAt).toLocaleDateString()}.` : ""}
          </Text>
          <Pressable style={styles.removeBtn} onPress={confirmRemove} disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Text style={styles.removeBtnText}>Remove my face data</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Your coach uses this to match you in match footage. It's required for student
            accounts.
          </Text>
          <Text style={styles.privacy}>
            Only a numeric signature is stored, never the photo itself. You can delete it at any
            time. A parent or guardian must agree first.
          </Text>

          <Text style={styles.label}>Parent or guardian name</Text>
          <TextInput
            style={styles.input}
            value={consentBy}
            onChangeText={setConsentBy}
            placeholder="Who is giving permission?"
            placeholderTextColor={colors.inkSoft}
          />

          <Pressable
            style={[styles.enrollBtn, (!consentBy.trim() || busy) && styles.enrollBtnDisabled]}
            onPress={enroll}
            disabled={!consentBy.trim() || busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.enrollBtnText}>Take photo</Text>
            )}
          </Pressable>
        </>
      )}

      {message && <Text style={styles.error}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 16,
    marginTop: spacing.md,
  },
  title: { fontFamily: fonts.display, fontSize: 15, color: colors.ink },
  body: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 6,
    lineHeight: 18,
  },
  privacy: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 8,
    lineHeight: 16,
    fontStyle: "italic",
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  input: {
    marginTop: 6,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
  enrollBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  enrollBtnDisabled: { opacity: 0.4 },
  enrollBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.white },
  removeBtn: {
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
  },
  removeBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12, color: colors.danger },
  error: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.danger,
    marginTop: 10,
    lineHeight: 16,
  },
});
