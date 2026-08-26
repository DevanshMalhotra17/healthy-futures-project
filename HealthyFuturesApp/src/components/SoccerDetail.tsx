import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors, radius, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import {
  uploadClip,
  getStatus,
  getAnalysis,
  SoccerError,
  MAX_VIDEO_BYTES,
  Analysis,
  AnalyzedPlayer,
} from "@/api/soccer";
import { getFaceDb, getRoster, saveSoccerResult, RosterStudent } from "@/api/coach";

const POLL_MS = 5000;

type Phase = "idle" | "uploading" | "processing" | "done" | "error";
type Picked = { uri: string; name: string; mimeType?: string | null; size?: number };

export default function SoccerDetail() {
  const { token, role } = useAuth();
  const isCoach = role === "coach";

  const [picked, setPicked] = useState<Picked | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [assigned, setAssigned] = useState<Record<number, string>>({});
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isCoach && token) {
      getRoster(token)
        .then(({ students }) => setRoster(students))
        .catch(() => setRoster([]));
    }
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [isCoach, token]);

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
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"] })
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
      setAnalysis(null);
      setAssigned({});
    } catch {
      setMessage("Couldn't open the camera roll.");
    }
  }

  async function analyze() {
    if (!picked || phase === "uploading" || phase === "processing") return;
    setPhase("uploading");
    setMessage(null);

    try {
      // Enrolled faces let the analyzer resolve players without a tap.
      const faceDb = isCoach && token ? await getFaceDb(token).catch(() => []) : [];
      const id = await uploadClip(picked, faceDb);
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
          setAnalysis(await getAnalysis(id));
          setPhase("done");
        } else if (status === "error") {
          stopPolling();
          setPhase("error");
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
    setAnalysis(null);
    setAssigned({});
    setPhase("idle");
    setMessage(null);
  }

  async function attribute(player: AnalyzedPlayer, student: RosterStudent) {
    if (!token || !sessionId || !analysis) return;
    setAssigning(player.tracker_id);
    try {
      await saveSoccerResult(
        {
          student_id: student.id,
          session_ref: sessionId,
          effort: player.effort,
          distance_m: player.distance,
          top_speed_ms: player.top_speed,
          sprints: player.sprints,
          rank_in_clip: player.rank,
          players_in_clip: analysis.player_count,
          identified_by: player.identified_by ?? "needs_tap",
        },
        token
      );
      setAssigned((a) => ({ ...a, [player.tracker_id]: student.fullName }));
    } catch {
      setMessage("Couldn't save that result.");
    } finally {
      setAssigning(null);
    }
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Analyze a match clip</Text>
      <Text style={styles.sub}>
        {isCoach
          ? "Upload a clip to get an effort score for each player, then assign them to your students."
          : "Your coach uploads match clips here and assigns your effort score."}
      </Text>

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
          Tracking every player and measuring how much ground they covered. This takes a minute
          or two.
        </Text>
      )}

      {phase === "done" && analysis && (
        <View style={styles.resultBlock}>
          <Text style={styles.resultLabel}>
            {analysis.player_count} players · {analysis.calibrated ? "measured in metres" : "relative effort"}
          </Text>
          {!analysis.calibrated && (
            <Text style={styles.calNote}>
              No pitch lines detected, so effort is scored relative to the other players rather
              than in metres.
            </Text>
          )}

          {analysis.identification.jersey + analysis.identification.face > 0 && (
            <Text style={styles.idNote}>
              Auto-matched {analysis.identification.jersey} by number,{" "}
              {analysis.identification.face} by face.
            </Text>
          )}

          {analysis.players.slice(0, 12).map((p) => (
            <View style={styles.playerRow} key={p.tracker_id}>
              <View style={styles.effortBadge}>
                <Text style={styles.effortValue}>{p.effort}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.playerName}>
                  {assigned[p.tracker_id] ??
                    (p.jersey_number !== null
                      ? `#${p.jersey_number}`
                      : `Player ${p.tracker_id}`)}
                  {p.team !== null ? `  ·  Team ${p.team + 1}` : ""}
                </Text>
                <Text style={styles.playerStats}>
                  {analysis.calibrated
                    ? `${Math.round(p.distance)}m · ${p.top_speed.toFixed(1)} m/s · ${p.sprints} sprints`
                    : `${p.sprints} bursts · ${p.seconds_tracked}s tracked`}
                </Text>

                {isCoach && !assigned[p.tracker_id] && roster.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tapRow}>
                    {roster.map((s) => (
                      <Pressable
                        key={s.id}
                        style={styles.tapChip}
                        onPress={() => attribute(p, s)}
                        disabled={assigning !== null}
                      >
                        {assigning === p.tracker_id ? (
                          <ActivityIndicator size="small" color={colors.pitchDark} />
                        ) : (
                          <Text style={styles.tapChipText}>
                            {s.fullName.split(/\s+/)[0]}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
                {assigned[p.tracker_id] && (
                  <Text style={styles.assignedNote}>Saved to {assigned[p.tracker_id]}</Text>
                )}
              </View>
            </View>
          ))}

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

  pickBtn: {
    marginTop: 14,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignItems: "center",
  },
  pickBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.pitchDark },
  pickBtnGhost: {
    marginTop: 10,
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
  calNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    marginTop: 6,
    lineHeight: 15,
  },
  idNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    marginTop: 6,
  },

  playerRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  effortBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.pitch,
    alignItems: "center",
    justifyContent: "center",
  },
  effortValue: { fontFamily: fonts.mono, fontSize: 15, color: colors.white },
  playerName: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.white },
  playerStats: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    marginTop: 2,
  },
  tapRow: { flexDirection: "row", marginTop: 7 },
  tapChip: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginRight: 6,
    minWidth: 46,
    alignItems: "center",
  },
  tapChipText: { fontFamily: fonts.bodyExtraBold, fontSize: 11, color: colors.pitchDark },
  assignedNote: {
    fontFamily: fonts.bodyBold,
    fontSize: 10.5,
    color: "#BFE6CE",
    marginTop: 5,
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
