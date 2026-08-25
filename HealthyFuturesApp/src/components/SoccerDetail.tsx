import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { colors, radius, fonts } from "@/theme";
import {
  uploadClip,
  getStatus,
  resultUrl,
  SOCCER_MODES,
  SoccerMode,
  SoccerError,
  MAX_VIDEO_BYTES,
} from "@/api/soccer";

const POLL_MS = 4000;

type Phase = "idle" | "uploading" | "processing" | "done" | "error";
type Picked = { uri: string; name: string; mimeType?: string | null; size?: number };

export default function SoccerDetail() {
  const [mode, setMode] = useState<SoccerMode>("SPEED_AND_DISTANCE");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const player = useVideoPlayer(
    phase === "done" && sessionId ? resultUrl(sessionId) : null,
    (p) => {
      p.loop = true;
    }
  );

  useEffect(() => {
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, []);

  async function choose(fromCamera: boolean) {
    setMessage(null);
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setMessage("Camera access is needed to record a clip.");
          return;
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 60 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"] });

      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;

      if (asset.fileSize && asset.fileSize > MAX_VIDEO_BYTES) {
        setMessage("That clip is over 450 MB. Trim it or record a shorter one.");
        return;
      }

      stopPolling();
      setPicked({
        uri: asset.uri,
        name: asset.fileName || "clip.mp4",
        mimeType: asset.mimeType,
        size: asset.fileSize,
      });
      setPhase("idle");
      setSessionId(null);
    } catch {
      setMessage("Couldn't open the camera roll.");
    }
  }

  async function analyze() {
    if (!picked || phase === "uploading" || phase === "processing") return;
    setPhase("uploading");
    setMessage(null);
    setSessionId(null);

    try {
      const id = await uploadClip(picked, mode);
      setSessionId(id);
      setPhase("processing");
      startPolling(id);
    } catch (e) {
      setPhase("error");
      setMessage(
        e instanceof SoccerError
          ? e.message
          : "Couldn't reach the analyzer. Check your connection and try again."
      );
    }
  }

  function startPolling(id: string) {
    stopPolling();
    poll.current = setInterval(async () => {
      try {
        const { status, error } = await getStatus(id);
        if (status === "done") {
          stopPolling();
          setPhase("done");
        } else if (status === "error") {
          stopPolling();
          setPhase("error");
          // The analyzer returns a stderr tail; the first line is the useful part.
          setMessage(error?.split("\n")[0] || "Analysis failed on the server.");
        }
      } catch (e) {
        stopPolling();
        setPhase("error");
        setMessage(e instanceof SoccerError ? e.message : "Lost contact with the analyzer.");
      }
    }, POLL_MS);
  }

  function stopPolling() {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  }

  function reset() {
    stopPolling();
    setPicked(null);
    setSessionId(null);
    setPhase("idle");
    setMessage(null);
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Analyze a match clip</Text>
      <Text style={styles.sub}>
        Upload a clip and the analyzer tracks players, the ball, and the pitch. A short clip
        usually comes back in under a minute.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modeRow}>
        {SOCCER_MODES.map((m) => {
          const active = m.key === mode;
          return (
            <Pressable
              key={m.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setMode(m.key)}
              disabled={busy}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.modeHint}>{SOCCER_MODES.find((m) => m.key === mode)?.hint}</Text>

      {!picked ? (
        <>
          <Pressable style={styles.pickBtn} onPress={() => choose(false)}>
            <Text style={styles.pickBtnText}>Choose a clip</Text>
          </Pressable>
          <Pressable style={styles.pickBtnGhost} onPress={() => choose(true)}>
            <Text style={styles.pickBtnGhostText}>Record one now</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.fileCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fileName} numberOfLines={1}>
              {picked.name}
            </Text>
            {picked.size ? (
              <Text style={styles.fileMeta}>{(picked.size / 1_048_576).toFixed(1)} MB</Text>
            ) : null}
          </View>
          {!busy && (
            <Pressable onPress={reset}>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          )}
        </View>
      )}

      {picked && phase !== "done" && (
        <Pressable
          style={[styles.analyzeBtn, busy && styles.analyzeBtnBusy]}
          onPress={analyze}
          disabled={busy}
        >
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.analyzeBtnText}>
                {phase === "uploading" ? "Uploading…" : "Analyzing…"}
              </Text>
            </View>
          ) : (
            <Text style={styles.analyzeBtnText}>Analyze clip</Text>
          )}
        </Pressable>
      )}

      {phase === "processing" && (
        <Text style={styles.note}>
          Still working. Analysis keeps running on the server, but this panel stops tracking it if
          you close the app.
        </Text>
      )}

      {phase === "done" && sessionId && (
        <View style={styles.resultBlock}>
          <Text style={styles.resultLabel}>Analysis ready</Text>
          <VideoView player={player} style={styles.video} allowsFullscreen contentFit="contain" />
          <Pressable style={styles.pickBtnGhost} onPress={reset}>
            <Text style={styles.pickBtnGhostText}>Analyze another clip</Text>
          </Pressable>
        </View>
      )}

      {message && (
        <Text style={[styles.note, phase === "error" && styles.errorNote]}>{message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.pitchDark,
    borderRadius: radius.md,
    padding: 16,
    marginTop: -4,
  },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.white },
  sub: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
    lineHeight: 16,
  },

  modeRow: { flexDirection: "row", marginTop: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginRight: 7,
  },
  chipActive: { backgroundColor: colors.white },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: "rgba(255,255,255,0.85)" },
  chipTextActive: { color: colors.pitchDark },
  modeHint: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.6)",
    marginTop: 7,
  },

  pickBtn: {
    marginTop: 14,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
  },
  pickBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.pitchDark },
  pickBtnGhost: {
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
  },
  pickBtnGhostText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.white },

  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: radius.sm,
    padding: 12,
    marginTop: 14,
  },
  fileName: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.white },
  fileMeta: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  changeText: { fontFamily: fonts.bodyExtraBold, fontSize: 11, color: colors.white },

  analyzeBtn: {
    marginTop: 12,
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  analyzeBtnBusy: { opacity: 0.85 },
  analyzeBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.white },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  resultBlock: { marginTop: 14 },
  resultLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  video: {
    width: "100%",
    height: 200,
    marginTop: 8,
    borderRadius: radius.sm,
    backgroundColor: "#000",
  },

  note: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: "rgba(255,255,255,0.75)",
    marginTop: 12,
    lineHeight: 16,
  },
  errorNote: { color: "#FFC4B4" },
});
