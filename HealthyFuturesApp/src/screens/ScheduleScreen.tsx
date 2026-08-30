import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { colors, radius, spacing, fonts } from "@/theme";
import MonthCalendar, { dayKey } from "@/components/MonthCalendar";
import ScheduleImport from "@/components/ScheduleImport";
import { useAuth } from "@/state/AuthContext";
import {
  listSessions,
  createSession,
  updateSession,
  deleteSession,
  getAttendance,
  setAttendance,
  TrainingSession,
  AttendanceRow,
  RepeatRule,
  AttendanceStatus,
} from "@/api/sessions";
import { CheckIcon } from "@/components/Icons";

type PickerTarget = "date" | "start" | "end" | null;

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { token, role } = useAuth();
  const isCoach = role === "coach";

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<TrainingSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => new Date());

  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [attendance, setAttendance_] = useState<AttendanceRow[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingStudent, setSavingStudent] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setSessions(await listSessions(token));
      setError(null);
    } catch {
      setError("Couldn't load the schedule.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openAttendance(session: TrainingSession) {
    if (openSessionId === session.id) {
      setOpenSessionId(null);
      return;
    }
    setOpenSessionId(session.id);
    setLoadingAttendance(true);
    try {
      setAttendance_(await getAttendance(session.id, token));
    } catch {
      setError("Couldn't load attendance for that session.");
      setOpenSessionId(null);
    } finally {
      setLoadingAttendance(false);
    }
  }

  // Tapping cycles absent -> present -> excused -> absent, so all three states
  // are reachable from one control without a separate menu.
  const NEXT_STATUS: Record<AttendanceStatus, AttendanceStatus> = {
    absent: "present",
    present: "excused",
    excused: "absent",
  };

  async function togglePresent(sessionId: string, row: AttendanceRow) {
    if (!token || savingStudent) return;
    const next = NEXT_STATUS[row.status];
    const prev = row.status;
    setSavingStudent(row.studentId);
    setAttendance_((rows) =>
      rows.map((r) =>
        r.studentId === row.studentId
          ? { ...r, status: next, present: next === "present" }
          : r
      )
    );
    try {
      await setAttendance(sessionId, row.studentId, next, token);
      await load();
      setError(null);
    } catch {
      setAttendance_((rows) =>
        rows.map((r) =>
          r.studentId === row.studentId
            ? { ...r, status: prev, present: prev === "present" }
            : r
        )
      );
      setError("Couldn't save that attendance change.");
    } finally {
      setSavingStudent(null);
    }
  }

  function confirmDelete(session: TrainingSession) {
    Alert.alert(
      "Remove session?",
      `"${session.title}" and its attendance records will be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSession(session.id, token);
              if (openSessionId === session.id) setOpenSessionId(null);
              await load();
            } catch {
              setError("Couldn't remove that session.");
            }
          },
        },
      ]
    );
  }

  if (!token) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.notice}>Log in from the Profile tab to see the schedule.</Text>
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

  const now = Date.now();
  const upcoming = sessions.filter((s) => new Date(s.startsAt).getTime() >= now);

  // Calendar view: one dot per session per day, and tapping a day filters below.
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    const k = dayKey(new Date(s.startsAt));
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const selectedKey = selectedDay ? dayKey(selectedDay) : null;
  const daySessions = selectedKey
    ? sessions
        .filter((s) => dayKey(new Date(s.startsAt)) === selectedKey)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    : [];

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Schedule</Text>
          <Text style={styles.subtitle}>
            {isCoach
              ? "Add your sessions, then take attendance on each one."
              : "Sessions your coach has scheduled."}
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {isCoach && (
            <>
              <Pressable style={styles.addBtn} onPress={() => setCreating(true)}>
                <Text style={styles.addBtnText}>+ Add session</Text>
              </Pressable>
              <ScheduleImport onImported={load} />
            </>
          )}

          {sessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptyBody}>
                {isCoach
                  ? "Tap “Add session” to schedule your first training."
                  : "Your coach hasn't added any sessions yet."}
              </Text>
            </View>
          ) : (
            <>
              <MonthCalendar
                month={calMonth}
                selected={selectedDay}
                counts={counts}
                onSelect={setSelectedDay}
                onMonthChange={setCalMonth}
              />

              <Text style={styles.sectionLabel}>
                {selectedDay
                  ? selectedDay.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  : "Select a day"}
              </Text>

              {daySessions.length === 0 ? (
                <Text style={styles.dayEmpty}>
                  {isCoach
                    ? "Nothing scheduled. Tap “Add session” to put one here."
                    : "No sessions on this day."}
                </Text>
              ) : (
                <View style={styles.group}>
                  {daySessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      isCoach={isCoach}
                      expanded={openSessionId === s.id}
                      attendance={attendance}
                      loadingAttendance={loadingAttendance}
                      savingStudent={savingStudent}
                      onToggleAttendance={() => openAttendance(s)}
                      onTogglePresent={(row) => togglePresent(s.id, row)}
                      onEdit={() => setEditing(s)}
                      onDelete={() => confirmDelete(s)}
                    />
                  ))}
                </View>
              )}

              {/* Next session regardless of the month being viewed, so a student
                  never has to hunt for it. */}
              {upcoming.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Next up</Text>
                  <View style={styles.group}>
                    <SessionCard
                      session={upcoming[0]}
                      isCoach={isCoach}
                      expanded={openSessionId === upcoming[0].id}
                      attendance={attendance}
                      loadingAttendance={loadingAttendance}
                      savingStudent={savingStudent}
                      onToggleAttendance={() => openAttendance(upcoming[0])}
                      onTogglePresent={(row) => togglePresent(upcoming[0].id, row)}
                      onEdit={() => setEditing(upcoming[0])}
                      onDelete={() => confirmDelete(upcoming[0])}
                    />
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <SessionForm
        visible={creating || editing !== null}
        session={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={async (input) => {
          if (editing) {
            await updateSession(editing.id, input, token);
          } else {
            await createSession(input, token);
          }
          setCreating(false);
          setEditing(null);
          await load();
        }}
      />
    </>
  );
}

function SessionCard({
  session,
  isCoach,
  expanded,
  attendance,
  loadingAttendance,
  savingStudent,
  onToggleAttendance,
  onTogglePresent,
  onEdit,
  onDelete,
}: {
  session: TrainingSession;
  isCoach: boolean;
  expanded: boolean;
  attendance: AttendanceRow[];
  loadingAttendance: boolean;
  savingStudent: string | null;
  onToggleAttendance: () => void;
  onTogglePresent: (row: AttendanceRow) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const start = new Date(session.startsAt);
  const end = session.endsAt ? new Date(session.endsAt) : null;
  const presentCount = attendance.filter((r) => r.present).length;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.dateBlock}>
          <Text style={styles.dateDay}>
            {start.toLocaleDateString([], { weekday: "short" }).toUpperCase()}
          </Text>
          <Text style={styles.dateNum}>{start.getDate()}</Text>
          <Text style={styles.dateMon}>
            {start.toLocaleDateString([], { month: "short" }).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{session.title}</Text>
          <Text style={styles.cardMeta}>
            {formatTime(start)}
            {end ? ` – ${formatTime(end)}` : ""}
            {session.location ? ` · ${session.location}` : ""}
          </Text>
          {!isCoach && session.viewerPresent && (
            <View style={styles.presentTag}>
              <CheckIcon size={9} color={colors.white} />
              <Text style={styles.presentTagText}>Marked present</Text>
            </View>
          )}
          {isCoach && session.presentCount > 0 && (
            <Text style={styles.cardCount}>{session.presentCount} present</Text>
          )}
        </View>
      </View>

      {isCoach && (
        <View style={styles.cardActions}>
          <Pressable style={styles.actionBtn} onPress={onToggleAttendance}>
            <Text style={styles.actionBtnText}>
              {expanded ? "Hide attendance" : "Take attendance"}
            </Text>
          </Pressable>
          <Pressable style={styles.actionBtnGhost} onPress={onEdit}>
            <Text style={styles.actionBtnGhostText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.actionBtnGhost} onPress={onDelete}>
            <Text style={[styles.actionBtnGhostText, { color: colors.danger }]}>Remove</Text>
          </Pressable>
        </View>
      )}

      {isCoach && expanded && (
        <View style={styles.attendanceBlock}>
          {loadingAttendance ? (
            <ActivityIndicator color={colors.pitch} style={{ paddingVertical: spacing.md }} />
          ) : attendance.length === 0 ? (
            <Text style={styles.attendanceEmpty}>
              No students on your roster yet — share your invite code.
            </Text>
          ) : (
            <>
              <Text style={styles.attendanceHint}>
                Tap a name to cycle absent → present → excused. Excused sessions don't
                count against attendance.
              </Text>
              {attendance.map((row) => (
                <Pressable
                  key={row.studentId}
                  style={styles.attendanceRow}
                  onPress={() => onTogglePresent(row)}
                  disabled={savingStudent !== null}
                >
                  <Text style={styles.attendanceName}>{row.fullName}</Text>
                  <View
                    style={[
                      styles.presentBtn,
                      row.status === "present" && styles.presentBtnOn,
                      row.status === "excused" && styles.excusedBtnOn,
                    ]}
                  >
                    {savingStudent === row.studentId ? (
                      <ActivityIndicator
                        size="small"
                        color={row.status === "absent" ? colors.pitch : colors.white}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.presentBtnText,
                          row.status !== "absent" && styles.presentBtnTextOn,
                        ]}
                      >
                        {row.status === "present"
                          ? "Present"
                          : row.status === "excused"
                          ? "Excused"
                          : "Absent"}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
              <Text style={styles.attendanceTotal}>
                {presentCount} of {attendance.length} present
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function SessionForm({
  visible,
  session,
  onClose,
  onSave,
}: {
  visible: boolean;
  session: TrainingSession | null;
  onClose: () => void;
  onSave: (input: {
    title: string;
    location: string | null;
    startsAt: string;
    endsAt: string | null;
    repeat?: RepeatRule;
    repeatCount?: number;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState(() => defaultStart());
  const [end, setEnd] = useState<Date | null>(null);
  const [repeat, setRepeat] = useState<RepeatRule>("none");
  const [repeatCount, setRepeatCount] = useState("8");
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    // Editing one occurrence must never silently re-expand the series.
    setRepeat("none");
    setRepeatCount("8");
    if (session) {
      setTitle(session.title);
      setLocation(session.location ?? "");
      setStart(new Date(session.startsAt));
      setEnd(session.endsAt ? new Date(session.endsAt) : null);
    } else {
      setTitle("");
      setLocation("");
      setStart(defaultStart());
      setEnd(null);
    }
    setPicker(null);
    setFormError(null);
  }, [visible, session]);

  // Android shows one modal at a time, so date and time are separate steps.
  function onPickerChange(event: DateTimePickerEvent, picked?: Date) {
    const target = picker;
    if (Platform.OS !== "ios") setPicker(null);
    if (event.type === "dismissed" || !picked || !target) return;

    if (target === "date") {
      setStart(withDate(start, picked));
      if (end) setEnd(withDate(end, picked));
    } else if (target === "start") {
      setStart(withTime(start, picked));
    } else {
      setEnd(withTime(end ?? start, picked));
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setFormError("Give the session a title.");
      return;
    }
    if (end && end.getTime() < start.getTime()) {
      setFormError("The session can't end before it starts.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        location: location.trim() || null,
        startsAt: start.toISOString(),
        endsAt: end ? end.toISOString() : null,
        ...(repeat !== "none"
          ? { repeat, repeatCount: Math.max(1, Math.min(52, Number(repeatCount) || 8)) }
          : {}),
      });
    } catch {
      setFormError("Couldn't save that session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{session ? "Edit session" : "New session"}</Text>

          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Soccer Training"
            placeholderTextColor={colors.inkSoft}
          />

          <Text style={styles.fieldLabel}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Cooper Field"
            placeholderTextColor={colors.inkSoft}
          />

          <Text style={styles.fieldLabel}>Date</Text>
          <Pressable style={styles.input} onPress={() => setPicker("date")}>
            <Text style={styles.inputValue}>
              {start.toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Start</Text>
              <Pressable style={styles.input} onPress={() => setPicker("start")}>
                <Text style={styles.inputValue}>{formatTime(start)}</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>End (optional)</Text>
              <Pressable style={styles.input} onPress={() => setPicker("end")}>
                <Text style={[styles.inputValue, !end && styles.inputPlaceholder]}>
                  {end ? formatTime(end) : "Not set"}
                </Text>
              </Pressable>
            </View>
          </View>

          {end && (
            <Pressable onPress={() => setEnd(null)} style={styles.clearEndBtn}>
              <Text style={styles.clearEndText}>Clear end time</Text>
            </Pressable>
          )}

          {/* Repeats apply only when creating; editing changes one occurrence. */}
          {!session && (
            <>
              <Text style={styles.fieldLabel}>Is this repeating?</Text>
              <View style={styles.repeatRow}>
                {(
                  [
                    ["none", "One time"],
                    ["weekly", "Weekly"],
                    ["biweekly", "Bi-weekly"],
                    ["monthly", "Monthly"],
                  ] as [RepeatRule, string][]
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    style={[styles.repeatChip, repeat === value && styles.repeatChipOn]}
                    onPress={() => setRepeat(value)}
                  >
                    <Text
                      style={[styles.repeatChipText, repeat === value && styles.repeatChipTextOn]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {repeat !== "none" && (
                <>
                  <Text style={styles.fieldLabel}>How many sessions?</Text>
                  <TextInput
                    style={styles.input}
                    value={repeatCount}
                    onChangeText={(t) => setRepeatCount(t.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="8"
                    placeholderTextColor={colors.inkSoft}
                  />
                  <Text style={styles.repeatHint}>
                    Creates {Math.max(1, Math.min(52, Number(repeatCount) || 8))} sessions. Each
                    one can be edited or cancelled on its own.
                  </Text>
                </>
              )}
            </>
          )}

          {picker && (
            <DateTimePicker
              value={picker === "end" ? end ?? start : start}
              mode={picker === "date" ? "date" : "time"}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onPickerChange}
            />
          )}

          {Platform.OS === "ios" && picker && (
            <Pressable style={styles.pickerDoneBtn} onPress={() => setPicker(null)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          )}

          {formError && <Text style={styles.errorText}>{formError}</Text>}

          <View style={styles.modalActions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.saveBtnText}>{session ? "Save" : "Add"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Next hour on the half-hour — a sensible starting point for a new session.
function defaultStart(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

// Dates are composed from local parts so a session saves at the wall-clock time
// the coach picked, in their own timezone.
function withDate(base: Date, picked: Date): Date {
  const d = new Date(base);
  d.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return d;
}

function withTime(base: Date, picked: Date): Date {
  const d = new Date(base);
  d.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return d;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: "center", justifyContent: "center" },
  container: { paddingHorizontal: spacing.lg },
  notice: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  title: { fontFamily: fonts.display, fontSize: 23, color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, marginTop: 4 },
  errorText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.danger, marginTop: spacing.sm },

  addBtn: {
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.pitch,
    borderStyle: "dashed",
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  addBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.pitch },

  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.lg,
  },
  group: { marginTop: 10, gap: spacing.sm },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  cardTop: { flexDirection: "row", gap: 13, alignItems: "flex-start" },
  dateBlock: { width: 46, alignItems: "center" },
  dateDay: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.inkSoft },
  dateNum: { fontFamily: fonts.mono, fontSize: 19, color: colors.pitch },
  dateMon: { fontFamily: fonts.mono, fontSize: 9, color: colors.inkSoft },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.ink },
  cardMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkSoft, marginTop: 2, lineHeight: 16 },
  cardCount: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.pitch, marginTop: 4 },
  presentTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  presentTagText: { fontFamily: fonts.bodyExtraBold, fontSize: 9.5, color: colors.white },

  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: "center",
  },
  actionBtn: {
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 11, color: colors.white },
  actionBtnGhost: { paddingHorizontal: 6, paddingVertical: 8 },
  actionBtnGhostText: { fontFamily: fonts.bodyExtraBold, fontSize: 11, color: colors.inkSoft },

  attendanceBlock: { marginTop: 12, paddingTop: 4 },
  attendanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  attendanceName: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, flex: 1 },
  attendanceHint: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.inkSoft,
    marginBottom: 8,
    lineHeight: 15,
  },
  presentBtn: {
    width: 78,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  presentBtnOn: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  excusedBtnOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  presentBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 10.5, color: colors.inkSoft },
  presentBtnTextOn: { color: colors.white },
  attendanceTotal: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.pitch,
    marginTop: 10,
    textAlign: "right",
  },
  attendanceEmpty: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    paddingVertical: spacing.sm,
  },

  emptyCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 18,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 6,
    lineHeight: 18,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(18,54,38,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: 34,
  },
  modalTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  input: {
    marginTop: 5,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: fonts.body,
    fontSize: 13.5,
    color: colors.ink,
  },
  inputValue: { fontFamily: fonts.body, fontSize: 13.5, color: colors.ink },
  inputPlaceholder: { color: colors.inkSoft },
  clearEndBtn: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 4 },
  dayEmpty: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 2,
    lineHeight: 18,
  },
  repeatRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  repeatChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  repeatChipOn: { backgroundColor: colors.pitch, borderColor: colors.pitch },
  repeatChipText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.ink },
  repeatChipTextOn: { color: colors.white },
  repeatHint: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 6,
    lineHeight: 16,
  },
  clearEndText: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.inkSoft },
  pickerDoneBtn: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pickerDoneText: { fontFamily: fonts.bodyExtraBold, fontSize: 13, color: colors.pitch },

  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.inkSoft },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.pitch,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 12.5, color: colors.white },
});
