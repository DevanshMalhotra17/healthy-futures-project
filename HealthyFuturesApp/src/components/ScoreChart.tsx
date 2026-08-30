import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Polyline, Circle, Line as SvgLine } from "react-native-svg";
import { colors, fonts } from "@/theme";

export type ChartPoint = { date: string; avg: number };

const H = 120;
const PAD_T = 10;
const PAD_B = 22;
const PAD_L = 30;

type Props = {
  points: ChartPoint[];
  color?: string;
  // Scores are 0-100, so a fixed scale keeps two charts visually comparable.
  max?: number;
  width: number;
};

export default function ScoreChart({ points, color = colors.pitch, max = 100, width }: Props) {
  if (points.length === 0) return null;

  const plotW = Math.max(width - PAD_L - 8, 40);
  const plotH = H - PAD_T - PAD_B;

  // A single point has no line to draw, so centre it instead of dividing by zero.
  const xFor = (i: number) =>
    PAD_L + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yFor = (v: number) => PAD_T + plotH - (Math.min(v, max) / max) * plotH;

  const coords = points.map((p, i) => `${xFor(i)},${yFor(p.avg)}`).join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const label = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <View>
      <Svg width={width} height={H}>
        {/* Gridlines at 0 / 50 / 100 give the eye a reference for "good". */}
        {[0, 50, 100].map((v) => (
          <SvgLine
            key={v}
            x1={PAD_L}
            y1={yFor(v)}
            x2={PAD_L + plotW}
            y2={yFor(v)}
            stroke={colors.line}
            strokeWidth={1}
          />
        ))}

        {points.length > 1 && (
          <Polyline
            points={coords}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {points.map((p, i) => (
          <Circle key={p.date} cx={xFor(i)} cy={yFor(p.avg)} r={3.5} fill={color} />
        ))}
      </Svg>

      {/* Axis labels drawn as text rather than SVG so they inherit the app font. */}
      <View style={[styles.yAxis, { height: H }]}>
        <Text style={styles.axisText}>100</Text>
        <Text style={styles.axisText}>50</Text>
        <Text style={styles.axisText}>0</Text>
      </View>

      <View style={[styles.xAxis, { paddingLeft: PAD_L }]}>
        <Text style={styles.axisText}>{label(first.date)}</Text>
        {points.length > 1 && <Text style={styles.axisText}>{label(last.date)}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yAxis: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 26,
    justifyContent: "space-between",
    paddingTop: PAD_T - 5,
    paddingBottom: PAD_B - 5,
    alignItems: "flex-end",
  },
  xAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -18,
    paddingRight: 8,
  },
  axisText: { fontFamily: fonts.mono, fontSize: 8.5, color: colors.inkSoft },
});
