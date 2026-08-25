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

const POLL_INTERVAL_MS = 3000;
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
    } catch {
      // thread may not exist yet (no messages), that's OK
      setMessages([]);
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

  async function handleSend() {
    if (!draft.trim() || sending || !token || !activeThread) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);
    try {
      await sendMessage(content, activeThread, token);
      await refreshMessages();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  function switchThread(withEmail: string) {
    setActiveThread(withEmail);
    setMessages([]);
  }

  function threadLabel(withEmail: string): string {
    if (withEmail === AI_EMAIL) return "AI Assistant";
    const student = roster.find((s) => s.email === withEmail);
    if (student) return student.fullName;
    if (!isCoach && coach && withEmail === coach.email) return coach.fullName;
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
        {activeThread && (
          <Text style={styles.headerSub}>{activeThread}</Text>
        )}
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

      <View style={styles.composer}>
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
