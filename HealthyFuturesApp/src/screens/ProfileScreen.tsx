import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, fonts } from "@/theme";
import { coachTitle } from "@/utils/greeting";
import { useAuth } from "@/state/AuthContext";
import { Role } from "@/api/auth";
import { CheckIcon } from "@/components/Icons";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const {
    token,
    email: savedEmail,
    fullName: savedFullName,
    role: savedRole,
    coach,
    inviteCode,
    loading,
    login,
    signup,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [studentInviteCode, setStudentInviteCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    if (!email.trim() || !password) {
      setError("Enter an email and password.");
      return;
    }
    if (mode === "signup") {
      if (!fullName.trim()) {
        setError("Enter your full name.");
        return;
      }
      if (role === "student" && !studentInviteCode.trim()) {
        setError("Enter the invite code your coach gave you.");
        return;
      }
      if (!consent) {
        setError("You need to grant consent to continue.");
        return;
      }
    }
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signup(
          email.trim(),
          password,
          fullName.trim(),
          role,
          role === "student" ? studentInviteCode.trim() : undefined
        );
      } else {
        await login(email.trim(), password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.pitch} />
      </View>
    );
  }

  if (token) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <View style={styles.container}>
          <Text style={styles.title}>Profile</Text>
          <View style={styles.accountCard}>
            <Text style={styles.accountLabel}>Signed in as</Text>
            <Text style={styles.accountEmail}>{savedFullName || savedEmail}</Text>
            <Text style={styles.accountSub}>{savedEmail}</Text>
            {savedRole && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {savedRole === "coach" ? "Coach" : "Student"}
                </Text>
              </View>
            )}

            {savedRole === "coach" && inviteCode && (
              <View style={styles.inviteBlock}>
                <Text style={styles.inviteLabel}>Your invite code</Text>
                <Text style={styles.inviteCode}>{inviteCode}</Text>
                <Text style={styles.inviteHint}>Share this with students so they can link to you.</Text>
              </View>
            )}

            {savedRole === "student" && (
              <View style={styles.inviteBlock}>
                <Text style={styles.inviteLabel}>Coach</Text>
                <Text style={styles.inviteCode}>
                  {coach ? coachTitle(coach.fullName) : "Not linked"}
                </Text>
              </View>
            )}
          </View>
          <Pressable style={styles.logoutBtn} onPress={() => logout()}>
            <Text style={styles.logoutBtnText}>Log out</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Text style={styles.title}>{mode === "signup" ? "Create account" : "Log in"}</Text>
          <Text style={styles.sub}>
            {mode === "signup"
              ? "Set up your Healthy Futures account to save your progress and unlock the AI companions."
              : "Welcome back."}
          </Text>

          {mode === "signup" && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                placeholder="Jamie Rivera"
                placeholderTextColor={colors.inkSoft}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.inkSoft}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.inkSoft}
            />
          </View>

          {mode === "signup" && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>I am a</Text>
              <View style={styles.roleRow}>
                <Pressable
                  style={[styles.roleOption, role === "student" && styles.roleOptionOn]}
                  onPress={() => setRole("student")}
                >
                  <Text style={[styles.roleOptionText, role === "student" && styles.roleOptionTextOn]}>
                    Student
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.roleOption, role === "coach" && styles.roleOptionOn]}
                  onPress={() => setRole("coach")}
                >
                  <Text style={[styles.roleOptionText, role === "coach" && styles.roleOptionTextOn]}>
                    Coach
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {mode === "signup" && role === "student" && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Coach invite code</Text>
              <TextInput
                style={styles.input}
                value={studentInviteCode}
                onChangeText={(t) => setStudentInviteCode(t.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="e.g. 7K2M9P"
                placeholderTextColor={colors.inkSoft}
              />
            </View>
          )}

          {mode === "signup" && (
            <Pressable style={styles.consentRow} onPress={() => setConsent((v) => !v)}>
              <View style={[styles.checkbox, consent && styles.checkboxOn]}>
                {consent && <CheckIcon size={11} color={colors.white} />}
              </View>
              <Text style={styles.consentText}>
                I consent to Healthy Futures using AI companions (soccer, nutrition, fitness,
                and mental health) to give me personalized guidance, as described by the
                program.
              </Text>
            </Pressable>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>
                {mode === "signup" ? "Create account" : "Log in"}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.switchModeBtn}
            onPress={() => {
              setMode((m) => (m === "signup" ? "login" : "signup"));
              setError(null);
            }}
          >
            <Text style={styles.switchModeText}>
              {mode === "signup"
                ? "Already have an account? Log in"
                : "Need an account? Sign up"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: "center", justifyContent: "center" },
  container: { paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 23, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 10, lineHeight: 19 },

  field: { marginTop: 18 },
  fieldLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.ink, marginBottom: 6 },
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

  roleRow: { flexDirection: "row", gap: 10 },
  roleOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  roleOptionOn: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  roleOptionText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  roleOptionTextOn: { color: colors.white },

  consentRow: { flexDirection: "row", gap: 10, marginTop: 18, alignItems: "flex-start" },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  consentText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, lineHeight: 17 },

  error: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger, marginTop: 14, lineHeight: 17 },

  submitBtn: {
    marginTop: 20,
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 13.5, color: colors.white },

  switchModeBtn: { marginTop: 16, alignItems: "center" },
  switchModeText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.pitch },

  accountCard: {
    marginTop: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 18,
  },
  accountLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.5 },
  accountEmail: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, marginTop: 4 },
  accountSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, marginTop: 2 },

  roleBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.ink },

  inviteBlock: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  inviteLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, textTransform: "uppercase", letterSpacing: 0.5 },
  inviteCode: { fontFamily: fonts.display, fontSize: 17, color: colors.ink, marginTop: 4 },
  inviteHint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 4, lineHeight: 16 },

  logoutBtn: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: "center",
  },
  logoutBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 13, color: colors.danger },
});
