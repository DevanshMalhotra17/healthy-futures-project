import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { colors, fonts } from "@/theme";

type ProgressRingProps = {
  size?: number;
  strokeWidth?: number;
  progress: number; // 0 to 1
  fillColor?: string;
  trackColor?: string;
  centerValue: string;
  centerLabel: string;
  centerValueColor?: string;
  centerLabelColor?: string;
};

export default function ProgressRing({
  size = 104,
  strokeWidth = 8,
  progress,
  fillColor = colors.gold,
  trackColor = "rgba(255,255,255,0.18)",
  centerValue,
  centerLabel,
  centerValueColor = colors.white,
  centerLabelColor = "rgba(255,255,255,0.8)",
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - clamped);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
        {/* pitch half-line, echoing a soccer center circle */}
        <Line
          x1={size / 2}
          y1={strokeWidth}
          x2={size / 2}
          y2={size - strokeWidth}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.value, { color: centerValueColor }]}>{centerValue}</Text>
        <Text style={[styles.label, { color: centerLabelColor }]}>{centerLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 22,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 1,
  },
});
