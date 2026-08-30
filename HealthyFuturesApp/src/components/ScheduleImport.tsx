import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import {
  importScheduleFromPhoto,
  extractedToInput,
  createSession,
  ExtractedSession,
} from "@/api/sessions";
import { ApiError } from "@/api/client";
import { CheckIcon } from "@/components/Icons";

type Props = { onImported: () => void };

function whenLabel(e: ExtractedSession): string {
  const d = new Date(`${e.date}T${e.startTime}:00`);
  const day = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

export default function ScheduleImport({ onImported }: Props) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<ExtractedSession[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Coach unticks anything misread rather than editing every row.
  const [skip, setSkip] = useState<Set<number>>(new Set());

  async function pick(source: "camera" | "library") {
    setError(null);
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError("Camera access is needed to photograph a schedule.");
          return;
        }
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });

      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;

      setBusy(true);
      const data = await importScheduleFromPhoto(
        { uri: asset.uri, name: asset.fileName ?? undefined, mimeType: asset.mimeType },
        token
      );
      if (data.sessions.length === 0) {
        setError("Couldn't find any sessions in that image. Try a clearer photo.");
        return;
      }
      setFound(data.sessions);
      setNote(data.note);
      setSkip(new Set());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't read that schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!found) return;
    const keep = found.filter((_, i) => !skip.has(i));
    if (keep.length === 0) {
      setFound(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // One request each: a partial failure then leaves the successful ones in
      // place rather than losing the whole batch.
      for (const e of keep) {
        await createSession(extractedToInput(e), token);
      }
      setFound(null);
      onImported();
    } catch {
      setError("Some sessions couldn't be saved. Check the list and try again.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(i: number) {
    setSkip((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const keepCount = found ? found.length - skip.size : 0;

  return (
    <>
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={() => pick("camera")} disabled={busy}>
          <Text style={styles.btnText}>Photograph schedule</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => pick("library")} disabled={busy}>
          <Text style={styles.btnText}>Choose image</Text>
        </Pressable>
      </View>

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color={colors.pitch} />
          <Text style={styles.busyText}>Reading the schedule…</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={found !== null} animationType="slide" transparent>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Confirm sessions</Text>
            <Text style={styles.sheetSub}>
              Found {found?.length ?? 0}. Untick anything that looks wrong — nothing is saved
              until you tap Add.
            </Text>
            {note && <Text style={styles.noteText}>{note}</Text>}

            <ScrollView style={styles.list}>
              {found?.map((e, i) => {
                const skipped = skip.has(i);
                return (
                  <Pressable
                    key={`${e.date}${e.startTime}${i}`}
                    style={[styles.item, skipped && styles.itemSkipped]}
                    onPress={() => toggle(i)}
                  >
                    <View style={[styles.box, !skipped && styles.boxOn]}>
                      {!skipped && <CheckIcon size={11} color={colors.white} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, skipped && styles.itemTextSkipped]}>
                        {e.title}
                        {e.confidence !== "high" && (
                          <Text style={styles.lowConf}> · check this</Text>
                        )}
                      </Text>
                      <Text style={[styles.itemMeta, skipped && styles.itemTextSkipped]}>
                        {whenLabel(e)}
                        {e.location ? ` · ${e.location}` : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sheetActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setFound(null)}
                disabled={saving}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.addBtn, keepCount === 0 && styles.addBtnOff]}
                onPress={confirm}
                disabled={saving || keepCount === 0}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.addText}>
                    Add {keepCount} session{keepCount === 1 ? "" : "s"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.pitch,
    alignItems: "center",
  },
  btnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12, color: colors.pitch },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm },
  busyText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft },
  error: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.danger,
    marginTop: 8,
    lineHeight: 17,
  },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "85%",
  },
  sheetTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  sheetSub: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 6,
    lineHeight: 18,
  },
  noteText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.gold,
    marginTop: 8,
    lineHeight: 17,
  },
  list: { marginTop: spacing.md, marginBottom: spacing.sm },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  itemSkipped: { opacity: 0.45 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  itemTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  itemMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  itemTextSkipped: { textDecorationLine: "line-through" },
  lowConf: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.gold },

  sheetActions: { flexDirection: "row", gap: spacing.sm },
  cancelBtn: { flex: 1, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.inkSoft },
  addBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: radius.pill,
    backgroundColor: colors.pitch,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnOff: { opacity: 0.4 },
  addText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.white },
});
