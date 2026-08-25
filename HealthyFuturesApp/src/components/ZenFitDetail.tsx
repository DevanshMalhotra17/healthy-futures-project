import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radius, fonts } from "@/theme";

export default function ZenFitDetail() {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>ZenFit</Text>
      <Text style={styles.notice}>
        ZenFit doesn't have a companion service yet — the other three (Soccer Scorecard,
        Nutrition, PrimeFit) are connected to real TachyonLeap services, but this one still
        needs a backend built before it can do anything real.
      </Text>
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
});
