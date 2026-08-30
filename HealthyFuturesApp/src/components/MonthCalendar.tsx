import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, radius, spacing, fonts } from "@/theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Local-date key. Using toISOString here would shift the day for anyone west of
// UTC, putting an evening session on the wrong square.
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Props = {
  month: Date;
  selected: Date | null;
  // dayKey -> number of sessions on that day
  counts: Record<string, number>;
  onSelect: (d: Date) => void;
  onMonthChange: (d: Date) => void;
};

export default function MonthCalendar({
  month,
  selected,
  counts,
  onSelect,
  onMonthChange,
}: Props) {
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    // Leading blanks so the 1st lands under its weekday.
    const out: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(new Date(month.getFullYear(), month.getMonth(), d));
    }
    // Trailing blanks to complete the final week row.
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  const todayKey = dayKey(new Date());
  const selectedKey = selected ? dayKey(selected) : null;

  function shiftMonth(delta: number) {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable style={styles.navBtn} onPress={() => shiftMonth(-1)} hitSlop={8}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </Text>
        <Pressable style={styles.navBtn} onPress={() => shiftMonth(1)} hitSlop={8}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`${w}${i}`} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={`blank${i}`} style={styles.cell} />;
          const key = dayKey(d);
          const count = counts[key] ?? 0;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <Pressable
              key={key}
              style={styles.cell}
              onPress={() => onSelect(d)}
              disabled={count === 0 && !isToday}
            >
              <View
                style={[
                  styles.dayBubble,
                  isToday && styles.dayToday,
                  isSelected && styles.daySelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    isToday && styles.dayTextToday,
                    isSelected && styles.dayTextSelected,
                  ]}
                >
                  {d.getDate()}
                </Text>
              </View>
              {/* One dot per session, capped so a busy day doesn't overflow. */}
              <View style={styles.dotRow}>
                {count > 0 &&
                  Array.from({ length: Math.min(count, 3) }).map((_, n) => (
                    <View
                      key={n}
                      style={[styles.dot, isSelected && styles.dotOnSelected]}
                    />
                  ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  navBtn: { width: 34, height: 30, alignItems: "center", justifyContent: "center" },
  navText: { fontFamily: fonts.bodyExtraBold, fontSize: 22, color: colors.pitch, marginTop: -3 },
  monthLabel: { fontFamily: fonts.display, fontSize: 15, color: colors.ink },

  weekRow: { flexDirection: "row", marginBottom: 2 },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.inkSoft,
  },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 3,
  },
  dayBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayToday: { borderWidth: 1.5, borderColor: colors.pitch },
  daySelected: { backgroundColor: colors.pitch },
  dayText: { fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  dayTextToday: { fontFamily: fonts.bodyExtraBold, color: colors.pitch },
  dayTextSelected: { color: colors.white, fontFamily: fonts.bodyExtraBold },

  dotRow: { flexDirection: "row", gap: 2, height: 6, marginTop: 1 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gold },
  dotOnSelected: { backgroundColor: colors.goldSoft },
});
