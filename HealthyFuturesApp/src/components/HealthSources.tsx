import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { colors, radius, fonts } from "@/theme";
import { sourcesFor, HEALTH_DISCLAIMER, SourceTopic } from "@/data/healthSources";

type Props = {
  topics: SourceTopic[];
  // The nutrition and wellbeing panels sit on a dark green card; the home screen
  // and profile sit on white. Same block, two palettes.
  tone?: "light" | "dark";
  title?: string;
};

// Citations for the health guidance the app gives, required by App Store Review
// guideline 1.4.1. Rendered expanded rather than behind a disclosure arrow —
// "easy for the user to find" was the explicit instruction, and a collapsed
// accordion is easy to miss.
export default function HealthSources({ topics, tone = "light", title }: Props) {
  const dark = tone === "dark";
  const sources = sourcesFor(...topics);

  async function open(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      // A missing browser is nothing we can recover from, and failing silently
      // beats an alert on top of the athlete's results.
    }
  }

  return (
    <View style={[styles.wrap, dark ? styles.wrapDark : styles.wrapLight]}>
      <Text style={[styles.heading, dark && styles.headingDark]}>
        {title ?? "Where this guidance comes from"}
      </Text>
      <Text style={[styles.disclaimer, dark && styles.disclaimerDark]}>
        {HEALTH_DISCLAIMER}
      </Text>
      <View style={styles.list}>
        {sources.map((s) => (
          <Pressable
            key={s.url}
            onPress={() => open(s.url)}
            accessibilityRole="link"
            accessibilityLabel={`${s.title}, ${s.publisher}. Opens in your browser.`}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Text style={[styles.rowTitle, dark && styles.rowTitleDark]}>{s.title}</Text>
            <Text style={[styles.rowPublisher, dark && styles.rowPublisherDark]}>
              {s.publisher}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, borderRadius: radius.sm, padding: 14 },
  wrapLight: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  wrapDark: { backgroundColor: "rgba(255,255,255,0.07)" },
  heading: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.inkSoft,
  },
  headingDark: { color: "rgba(255,255,255,0.7)" },
  disclaimer: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkSoft,
    marginTop: 6,
  },
  disclaimerDark: { color: "rgba(255,255,255,0.75)" },
  list: { marginTop: 10, gap: 9 },
  row: {},
  rowPressed: { opacity: 0.55 },
  rowTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.pitch,
    textDecorationLine: "underline",
  },
  rowTitleDark: { color: colors.gold },
  rowPublisher: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkSoft,
    marginTop: 1,
  },
  rowPublisherDark: { color: "rgba(255,255,255,0.6)" },
});
