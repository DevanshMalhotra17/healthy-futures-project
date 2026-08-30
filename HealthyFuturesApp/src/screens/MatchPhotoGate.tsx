import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import { embedFace, saveFaceEnrollment, FaceError } from "@/api/face";

// Shown to students who haven't enrolled a match photo yet. It stands in front of
// the whole app rather than being a signup field, because face detection can
// legitimately fail (dim room, turned head, analyser offline) and a student must
// be able to retry rather than be locked out of registration entirely.
export default function MatchPhotoGate({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { token, logout } = useAuth();
  const [consentBy, setConsentBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function capture(source: "camera" | "library") {
    if (!consentBy.trim()) {
      setError("Enter your parent or guardian's name first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError("Camera access is needed to take your match photo.");
          return;
        }
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              cameraType: ImagePicker.CameraType.front,
              quality: 0.85,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.85,
            });

      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;

      const embedding = await embedFace({
        uri: asset.uri,
        name: asset.fileName || "face.jpg",
        mimeType: asset.mimeType,
      });
      await saveFaceEnrollment(embedding, consentBy.trim(), token);
      onDone();
    } catch (e) {
      setError(
        e instanceof FaceError
          ? e.message
          : "Couldn't save that photo. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <Text style={styles.title}>One last step</Text>
        <Text style={styles.body}>
          Your coach needs a match photo so they can identify you in match footage and give you
          the right effort score.
        </Text>

        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>How your photo is handled</Text>
          <Text style={styles.privacyLine}>
            • Only a numeric signature is stored — the photo itself is never saved.
          </Text>
          <Text style={styles.privacyLine}>
            • Only your own coach can use it, never other students.
          </Text>
          <Text style={styles.privacyLine}>
            • You can delete it any time from the Profile tab.
          </Text>
          <Text style={styles.privacyLine}>
            • A parent or guardian must agree before you add it.
          </Text>
        </View>

        <Text style={styles.label}>Parent or guardian name</Text>
        <TextInput
          style={styles.input}
          value={consentBy}
          onChangeText={setConsentBy}
          placeholder="Who is giving permission?"
          placeholderTextColor={colors.inkSoft}
          autoCapitalize="words"
        />

        <Pressable
          style={[styles.primaryBtn, (!consentBy.trim() || busy) && styles.btnOff]}
          onPress={() => capture("camera")}
          disabled={!consentBy.trim() || busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryText}>Take my photo</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.ghostBtn, (!consentBy.trim() || busy) && styles.btnOff]}
          onPress={() => capture("library")}
          disabled={!consentBy.trim() || busy}
        >
          <Text style={styles.ghostText}>Choose an existing photo</Text>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.hint}>
          Face the camera in good light. If it can't find your face, try again near a window.
        </Text>

        {/* A student who can't get guardian permission shouldn't be trapped in a
            screen with no way out. */}
        <Pressable style={styles.logoutBtn} onPress={() => logout()}>
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  container: { paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  body: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.inkSoft,
    marginTop: 10,
    lineHeight: 20,
  },

  privacyCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 15,
    marginTop: spacing.lg,
    gap: 5,
  },
  privacyTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    color: colors.ink,
    marginBottom: 3,
  },
  privacyLine: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 17,
  },

  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: 13,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },

  primaryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontFamily: fonts.bodyExtraBold, fontSize: 13.5, color: colors.white },
  ghostBtn: {
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.pitch,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: "center",
  },
  ghostText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.pitch },
  btnOff: { opacity: 0.4 },

  error: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.danger,
    marginTop: 14,
    lineHeight: 18,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 14,
    lineHeight: 16,
  },
  logoutBtn: { marginTop: spacing.xl, alignSelf: "center" },
  logoutText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.inkSoft },
});
