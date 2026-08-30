import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import { uploadPracticeVideo, MAX_VIDEO_BYTES } from "@/api/videos";
import { ApiError } from "@/api/client";
import { UploadIcon, CheckIcon } from "@/components/Icons";

type Status = "idle" | "picked" | "uploading" | "saving" | "done" | "error";
type Picked = { uri: string; name?: string; mimeType?: string | null };

export default function PracticeVideoUpload() {
  const { token } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function reset() {
    setStatus("idle");
    setPicked(null);
    setCaption("");
    setErrorMsg(null);
  }

  async function pick(source: "camera" | "library") {
    setErrorMsg(null);
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setStatus("error");
          setErrorMsg("Camera access is off — enable it in Settings to record a clip.");
          return;
        }
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 60 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"] });

      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;

      if (asset.fileSize && asset.fileSize > MAX_VIDEO_BYTES) {
        setStatus("error");
        setErrorMsg("That clip is over 200 MB. Record a shorter one.");
        return;
      }

      setPicked({
        uri: asset.uri,
        name: asset.fileName ?? undefined,
        mimeType: asset.mimeType,
      });
      setStatus("picked");
    } catch {
      setStatus("error");
      setErrorMsg("Couldn't open the camera or library. Try again.");
    }
  }

  async function handleSend() {
    if (!picked) return;
    if (!token) {
      setStatus("error");
      setErrorMsg("Log in to send a video to your coach.");
      return;
    }

    try {
      setStatus("uploading");
      await uploadPracticeVideo(picked, caption, token);
      setStatus("done");
    } catch (error) {
      setStatus("error");
      // Relay the server's own reason (too large, wrong format, not a student)
      // instead of blaming the connection for every failure.
      setErrorMsg(
        error instanceof ApiError
          ? error.message
          : "Upload didn't go through. Check your connection and try again."
      );
    }
  }

  if (status === "done") {
    return (
      <View style={styles.card}>
        <View style={styles.doneRow}>
          <View style={styles.doneIconWrap}>
            <CheckIcon size={12} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.doneTitle}>Sent to your coach</Text>
            <Text style={styles.doneBody}>They'll see it in Messages.</Text>
          </View>
        </View>
        <Pressable style={styles.linkBtn} onPress={reset}>
          <Text style={styles.linkBtnText}>Share another clip</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Share a practice clip</Text>
      <Text style={styles.body}>
        Record yourself working on a drill at home and send it straight to your coach.
      </Text>

      {!picked ? (
        <View style={styles.pickRow}>
          <Pressable style={styles.pickBtn} onPress={() => pick("camera")}>
            <UploadIcon size={14} color={colors.pitch} />
            <Text style={styles.pickBtnText}>Record</Text>
          </Pressable>
          <Pressable style={styles.pickBtn} onPress={() => pick("library")}>
            <UploadIcon size={14} color={colors.pitch} />
            <Text style={styles.pickBtnText}>Choose video</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Text style={styles.pickedLabel}>Clip ready to send.</Text>
          <TextInput
            style={styles.captionInput}
            placeholder="Add a note for your coach (optional)"
            placeholderTextColor={colors.inkSoft}
            value={caption}
            onChangeText={setCaption}
            maxLength={300}
            multiline
          />
          <View style={styles.actionRow}>
            <Pressable style={styles.cancelBtn} onPress={reset} disabled={status === "uploading" || status === "saving"}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.sendBtn}
              onPress={handleSend}
              disabled={status === "uploading" || status === "saving"}
            >
              {status === "uploading" || status === "saving" ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.sendBtnText}>Send to coach</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {status === "error" && errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 18,
  },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 5, lineHeight: 17 },

  pickRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  pickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.pitch,
  },
  pickBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12, color: colors.pitch },

  pickedLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.ink, marginTop: spacing.md },
  captionInput: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginTop: 8,
    minHeight: 44,
    textAlignVertical: "top",
  },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12, color: colors.inkSoft },
  sendBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.pitch,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12, color: colors.white },

  errorText: { fontFamily: fonts.body, fontSize: 11, color: colors.danger, marginTop: 10, lineHeight: 15 },

  doneRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  doneIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.pitch,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.ink },
  doneBody: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  linkBtn: { marginTop: 12, alignSelf: "flex-start" },
  linkBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 11.5, color: colors.pitch },
});
