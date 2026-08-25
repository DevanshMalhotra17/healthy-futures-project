import React from "react";
import { Pressable, View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, radius, fonts, spacing, Companion } from "@/theme";
import { SoccerBallIcon, AppleIcon, DumbbellIcon, LeafIcon, ChevronRightIcon } from "./Icons";

function CompanionIcon({ companionKey, color }: { companionKey: Companion["key"]; color: string }) {
  switch (companionKey) {
    case "soccer":
      return <SoccerBallIcon size={19} color={color} />;
    case "nutrition":
      return <AppleIcon size={19} color={color} />;
    case "primefit":
      return <DumbbellIcon size={19} color={color} />;
    case "zenfit":
      return <LeafIcon size={19} color={color} />;
  }
}

type Props = {
  companion: Companion;
  onPress?: () => void;
  layout?: "grid" | "row";
  style?: ViewStyle;
};

export default function CompanionCard({ companion, onPress, layout = "grid", style }: Props) {
  const isRow = layout === "row";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isRow && styles.cardRow,
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: companion.color },
          isRow && { marginBottom: 0, marginRight: spacing.md },
        ]}
      >
        <CompanionIcon companionKey={companion.key} color={companion.iconColor} />
      </View>
      <View style={isRow ? { flex: 1 } : undefined}>
        <Text style={styles.name}>{companion.name}</Text>
        <Text style={styles.blurb}>{companion.blurb}</Text>
      </View>
      {isRow && <ChevronRightIcon size={16} color={colors.inkSoft} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 3,
  },
  blurb: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.inkSoft,
    lineHeight: 15,
  },
});
