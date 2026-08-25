import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from "react-native";
import { colors, radius, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import { listTraceSessions, sendTraceChat, TraceSession, TraceChatMessage } from "@/api/trace";
import { ApiError } from "@/api/client";

export default function SoccerDetail() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<TraceSession[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TraceSession | null>(null);

  const [history, setHistory] = useState<TraceChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoadingSessions(true);
    setLoadError(null);
    listTraceSessions(token)
      .then(setSessions)
      .catch((e) => {
        setLoadError(
          e instanceof ApiError
            ? `Couldn't load your sessions (${e.status}).`
            : "Couldn't reach the soccer companion."
        );
      })
      .finally(() => setLoadingSessions(false));
  }, [token]);

  async function handleSend() {
    if (!selected || !draft.trim() || sending) return;
    const message = draft.trim();
    setDraft("");
    setChatError(null);
    const nextHistory: TraceChatMessage[] = [...history, { role: "user", content: message }];
    setHistory(nextHistory);
    setSending(true);
    try {
      const res = await sendTraceChat(
        { session_id: selected.id, message, history },
        token
      );
      setHistory([...nextHistory, { role: "assistant", content: res.reply }]);
    } catch (e) {
      setChatError(
        e instanceof ApiError
          ? `The coach couldn't reply (${e.status}).`
          : "Couldn't reach the soccer companion."
      );
    } finally {
      setSending(false);
    }
  }

  if (!token) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Soccer Scorecard</Text>
        <Text style={styles.notice}>
          Log in from the Profile tab to see your analyzed matches and chat with the coach.
        </Text>
      </View>
    );
  }

  if (!selected) {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Your matches</Text>
        {loadingSessions && <ActivityIndicator color={colors.white} style={{ marginTop: 14 }} />}
        {loadError && <Text style={styles.errorText}>{loadError}</Text>}
        {!loadingSessions && sessions && sessions.length === 0 && (
          <Text style={styles.notice}>No analyzed matches yet — check back after your next game.</Text>
        )}
        <View style={{ marginTop: 12, gap: 8 }}>
          {sessions?.map((s) => (
            <Pressable key={s.id} style={styles.sessionRow} onPress={() => setSelected(s)}>
              <Text style={styles.sessionTeams}>
                {s.home_team} {s.home_score ?? 0} — {s.away_score ?? 0} {s.away_team}
              </Text>
              <Text style={styles.sessionMeta}>
                {s.status || "processed"}
                {s.start_time ? ` · ${s.start_time}` : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.chatHeader}>
        <Pressable onPress={() => setSelected(null)}>
          <Text style={styles.backLink}>← All matches</Text>
        </Pressable>
        <Text style={styles.title}>
          {selected.home_team} vs {selected.away_team}
        </Text>
      </View>

      <View style={styles.chatBody}>
        {history.length === 0 && (
          <Text style={styles.notice}>Ask the coach anything about this match.</Text>
        )}
        {history.map((m, i) => (
          <View
            key={i}
            style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleCoach]}
          >
            <Text style={styles.bubbleText}>{m.content}</Text>
          </View>
        ))}
        {sending && <ActivityIndicator color={colors.white} style={{ marginTop: 8 }} />}
        {chatError && <Text style={styles.errorText}>{chatError}</Text>}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.chatInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about this match..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          onSubmitEditing={handleSend}
        />
        <Pressable style={styles.sendBtn} onPress={handleSend} disabled={sending || !draft.trim()}>
          <Text style={styles.sendBtnText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.pitchDark, borderRadius: radius.lg, padding: 20 },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
  notice: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: "rgba(255,255,255,0.75)",
    marginTop: 10,
    lineHeight: 18,
  },
  errorText: { fontFamily: fonts.body, fontSize: 12, color: "#F3B0A0", marginTop: 10, lineHeight: 17 },

  sessionRow: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 13,
  },
  sessionTeams: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.white },
  sessionMeta: { fontFamily: fonts.body, fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 3 },

  chatHeader: { marginBottom: 10 },
  backLink: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.gold, marginBottom: 8 },

  chatBody: { gap: 8, minHeight: 40 },
  bubble: { borderRadius: 12, padding: 11, maxWidth: "88%" },
  bubbleUser: { backgroundColor: colors.gold, alignSelf: "flex-end" },
  bubbleCoach: { backgroundColor: "rgba(255,255,255,0.1)", alignSelf: "flex-start" },
  bubbleText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.white, lineHeight: 17 },

  inputRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.white,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  sendBtn: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: "#3B2A05" },
});
