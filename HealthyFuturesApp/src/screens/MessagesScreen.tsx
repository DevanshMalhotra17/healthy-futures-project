import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import {
  listThreads,
  loadThread,
  sendMessage,
  DirectMessage,
  MessageThread,
} from "@/api/messages";
import { ApiError } from "@/api/client";
import { getRoster, RosterStudent } from "@/api/coach";
import { coachTitle } from "@/utils/greeting";
import { MicIcon, SpeakerIcon, StopIcon } from "@/components/Icons";
import {
  isSpeechRecognitionAvailable,
  startListening,
  speak,
  stopSpeaking,
} from "@/utils/voice";

// Two pollers run concurrently (threads + the open thread). The server allows 30
// message requests a minute, so 3s each (40/min) was tripping the rate limit and
// making conversations blink out. 6s each keeps the pair at 20/min.
const POLL_INTERVAL_MS = 6000;
const AI_EMAIL = "assistant@healthyfutures.app";

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { token, email, role, coach } = useAuth();
  const isCoach = role === "coach";

  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  // Which thread we last loaded successfully, so a failed poll can tell
  // "no messages yet" apart from "the request just failed".
  const loadedThreadRef = useRef<string | null>(null);

  const [voiceMode, setVoiceMode] = useState(true);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);
  // Replies present when the thread opens are history, not new answers — only
  // messages that arrive after this point get read aloud.
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const isAiThread = activeThread === AI_EMAIL;
  const canUseMic = isSpeechRecognitionAvailable();

  useEffect(() => {
    if (!token || !isCoach) return;
    getRoster(token)
      .then(({ students }) => setRoster(students))
      .catch(() => setRoster([]));
  }, [token, isCoach]);

  const refreshThreads = useCallback(async () => {
    if (!token) return;
    try {
      const t = await listThreads(token);
      const emptyThread = (withEmail: string): MessageThread => ({
        with_email: withEmail,
        last_at: null,
        last_content: null,
        unread_count: 0,
      });

      const merged = [...t];
      // Either side should be able to start a conversation before a first
      // message exists: a coach with any roster student, a student with their
      // coach.
      const extras = isCoach
        ? roster.map((s) => s.email)
        : coach?.email
        ? [coach.email]
        : [];
      for (const candidate of [AI_EMAIL, ...extras]) {
        if (!merged.some((th) => th.with_email === candidate)) {
          merged.push(emptyThread(candidate));
        }
      }
      // AI assistant always leads the tab strip.
      merged.sort((a, b) =>
        a.with_email === AI_EMAIL ? -1 : b.with_email === AI_EMAIL ? 1 : 0
      );

      setThreads(merged);
      if (!activeThread && merged.length > 0) {
        setActiveThread(merged[0].with_email);
      }
      setNotAvailable(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNotAvailable(true);
      }
    } finally {
      setLoading(false);
    }
  }, [token, activeThread, isCoach, roster, coach?.email]);

  const refreshMessages = useCallback(async () => {
    if (!token || !activeThread) return;
    try {
      const msgs = await loadThread(activeThread, token);
      setMessages(msgs);
      loadedThreadRef.current = activeThread;
    } catch (e) {
      // A failed poll must not blank the conversation. Only clear when we've
      // never successfully loaded this thread — a 404 there means it genuinely
      // has no messages yet. Anything else (rate limit, timeout, offline) keeps
      // what's already on screen.
      if (loadedThreadRef.current !== activeThread) {
        if (e instanceof ApiError && e.status === 404) setMessages([]);
      }
    }
  }, [token, activeThread]);

  useEffect(() => {
    refreshThreads();
    const interval = setInterval(refreshThreads, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshThreads]);

  useEffect(() => {
    refreshMessages();
    const interval = setInterval(refreshMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshMessages]);

  // Read new assistant replies aloud. The first load only marks what already
  // exists as seen, so reopening a thread never replays the whole history.
  useEffect(() => {
    if (!isAiThread || messages.length === 0) return;

    if (!primedRef.current) {
      messages.forEach((m) => spokenIdsRef.current.add(m.id));
      primedRef.current = true;
      return;
    }

    const fresh = messages.filter(
      (m) => m.sender_email === AI_EMAIL && !spokenIdsRef.current.has(m.id)
    );
    if (fresh.length === 0) return;
    fresh.forEach((m) => spokenIdsRef.current.add(m.id));

    if (!voiceMode) return;
    const latest = fresh[fresh.length - 1];
    setSpeaking(true);
    speak(latest.content, () => setSpeaking(false));
  }, [messages, isAiThread, voiceMode]);

  // Switching threads resets what counts as "already heard".
  useEffect(() => {
    primedRef.current = false;
    spokenIdsRef.current.clear();
    stopSpeaking();
    setSpeaking(false);
    setPartial("");
    setVoiceError(null);
  }, [activeThread]);

  // Leaving the screen must not leave the mic open or the voice talking.
  useEffect(() => {
    return () => {
      stopListenRef.current?.();
      stopSpeaking();
    };
  }, []);

  async function deliver(content: string, restoreDraftOnFail: boolean) {
    if (!token || !activeThread) return;
    setSending(true);
    try {
      await sendMessage(content, activeThread, token);
      await refreshMessages();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      if (restoreDraftOnFail) setDraft(content);
      else setVoiceError("Couldn't send that. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (!draft.trim() || sending) return;
    const content = draft.trim();
    setDraft("");
    await deliver(content, true);
  }

  async function handleMicPress() {
    setVoiceError(null);

    // Tapping while it talks should interrupt, not queue another turn.
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }

    if (listening) {
      stopListenRef.current?.();
      stopListenRef.current = null;
      setListening(false);
      return;
    }

    if (!canUseMic) {
      setVoiceError(
        "Voice input needs a full build of the app — type your message for now."
      );
      return;
    }

    stopSpeaking();
    setSpeaking(false);
    setPartial("");
    setListening(true);

    try {
      stopListenRef.current = await startListening({
        onPartial: setPartial,
        onFinal: async (text) => {
          stopListenRef.current?.();
          stopListenRef.current = null;
          setListening(false);
          setPartial("");
          const spokenText = text.trim();
          if (spokenText) await deliver(spokenText, false);
        },
        onError: (message) => {
          stopListenRef.current?.();
          stopListenRef.current = null;
          setListening(false);
          setPartial("");
          if (message) setVoiceError(message);
        },
      });
    } catch {
      setListening(false);
      setVoiceError("Couldn't start the microphone.");
    }
  }

  function toggleVoiceMode() {
    setVoiceMode((on) => {
      if (on) {
        stopSpeaking();
        setSpeaking(false);
      }
      return !on;
    });
  }

  function switchThread(withEmail: string) {
    setActiveThread(withEmail);
    setMessages([]);
  }

  function threadLabel(withEmail: string): string {
    if (withEmail === AI_EMAIL) return "AI Assistant";
    const student = roster.find((s) => s.email === withEmail);
    if (student) return student.fullName;
    if (!isCoach && coach && withEmail === coach.email) return coachTitle(coach.fullName);
    return isCoach ? withEmail : "Coach";
  }

  if (!token) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notice}>
          Log in from the Profile tab to {isCoach ? "message your students" : "message your coach"}.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.pitch} />
      </View>
    );
  }

  if (notAvailable) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top, paddingHorizontal: spacing.lg }]}>
        <Text style={styles.notice}>
          Messaging isn't live on the server yet — this screen is ready to go the moment the
          backend team deploys the messaging update.
        </Text>
      </View>
    );
  }

  const placeholder =
    activeThread === AI_EMAIL
      ? "Ask me about nutrition, scores, check-ins..."
      : isCoach
      ? `Message ${activeThread ? threadLabel(activeThread) : "student"}...`
      : "Message your coach...";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
          {threads.map((t) => {
            const active = t.with_email === activeThread;
            return (
              <Pressable
                key={t.with_email}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => switchThread(t.with_email)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {threadLabel(t.with_email)}
                </Text>
                {t.unread_count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t.unread_count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.headerRow}>
          {activeThread && <Text style={styles.headerSub}>{activeThread}</Text>}
          {isAiThread && (
            <Pressable
              style={[styles.voiceToggle, voiceMode && styles.voiceToggleOn]}
              onPress={toggleVoiceMode}
            >
              <SpeakerIcon
                size={14}
                color={voiceMode ? colors.white : colors.inkSoft}
              />
              <Text
                style={[styles.voiceToggleText, voiceMode && styles.voiceToggleTextOn]}
              >
                {voiceMode ? "Voice on" : "Voice off"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <Text style={styles.notice}>
            {activeThread === AI_EMAIL
              ? isCoach
                ? 'Say hi! Try "check Marcus in for Thursday" or "show my roster"'
                : 'Say hi! Try "try veggie soup" or "how\'s my score?"'
              : isCoach
              ? "No messages yet — start the conversation."
              : "No messages yet — say hello to your coach."}
          </Text>
        }
        renderItem={({ item }) => {
          const mine = item.sender_email === email;
          return (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
              <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                {new Date(item.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          );
        }}
      />

      {isAiThread && (listening || speaking || partial || voiceError) && (
        <View style={styles.voiceStatus}>
          {listening && (
            <Text style={styles.voiceStatusText}>
              {partial ? partial : "Listening…"}
            </Text>
          )}
          {speaking && !listening && (
            <Text style={styles.voiceStatusText}>Speaking… tap the mic to stop</Text>
          )}
          {voiceError && !listening && (
            <Text style={styles.voiceErrorText}>{voiceError}</Text>
          )}
        </View>
      )}

      <View style={styles.composer}>
        {isAiThread && (
          <Pressable
            style={[
              styles.micBtn,
              listening && styles.micBtnActive,
              speaking && styles.micBtnSpeaking,
            ]}
            onPress={handleMicPress}
            disabled={sending}
          >
            {speaking ? (
              <StopIcon size={17} color={colors.white} />
            ) : (
              <MicIcon size={19} color={listening ? colors.white : colors.pitch} />
            )}
          </Pressable>
        )}
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSoft}
          onSubmitEditing={handleSend}
        />
        <Pressable style={styles.sendBtn} onPress={handleSend} disabled={sending || !draft.trim()}>
          {sending ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.sendBtnText}>Send</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: "center", justifyContent: "center" },
  notice: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },

  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerSub: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  voiceToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 6,
  },
  voiceToggleOn: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  voiceToggleText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.inkSoft },
  voiceToggleTextOn: { color: colors.white },

  voiceStatus: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 8,
  },
  voiceStatusText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.pitch,
    lineHeight: 17,
  },
  voiceErrorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.danger,
    lineHeight: 17,
  },

  micBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.pitch,
  },
  micBtnActive: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  micBtnSpeaking: { backgroundColor: colors.danger, borderColor: colors.danger },

  tabRow: { flexDirection: "row", marginBottom: 4 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    marginRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabActive: { backgroundColor: colors.pitch },
  tabText: { fontFamily: fonts.bodyExtraBold, fontSize: 13, color: colors.ink },
  tabTextActive: { color: colors.white },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { fontFamily: fonts.bodyExtraBold, fontSize: 10, color: colors.white },

  listContent: { padding: spacing.lg, gap: 8, flexGrow: 1 },
  bubble: { maxWidth: "78%", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: colors.pitch, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.ink, lineHeight: 18 },
  bubbleTextMine: { color: colors.white },
  bubbleTime: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.inkSoft, marginTop: 4 },
  bubbleTimeMine: { color: "rgba(255,255,255,0.7)" },

  composer: {
    flexDirection: "row",
    gap: 10,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.ink,
  },
  sendBtn: {
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 13, color: colors.white },
});
