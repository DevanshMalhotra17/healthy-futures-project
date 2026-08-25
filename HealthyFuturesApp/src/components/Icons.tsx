import React from "react";
import Svg, { Circle, Path, Line, Rect } from "react-native-svg";

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function PinIcon({ size = 14, color = "#5B6C61", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={10} r={2.4} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function FlameIcon({ size = 14, color = "#FCEFD2" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2s4 4.5 4 9a4 4 0 0 1-8 0c0-1 .3-1.8.8-2.6C9.4 10 9 11 9 12a3 3 0 0 0 6 0c0-3-3-5-3-8-1.5 1-3 3-3 6a5 5 0 0 0 10 0c0-6-4-9-7-10Z"
        fill={color}
      />
    </Svg>
  );
}

export function SoccerBallIcon({ size = 20, color = "#FFFFFF", strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 7.5 15.6 10l-1.4 4.2H9.8L8.4 10 12 7.5Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path
        d="M12 3v4.5M4.5 9l3.9 1M19.5 9l-3.9 1M7 19l1.8-4.8M17 19l-1.8-4.8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function AppleIcon({ size = 20, color = "#95681B", strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3c-1 2-3 3-3 6a3 3 0 0 0 6 0c0-3-2-4-3-6Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M6 13a6 6 0 0 0 12 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M9 21h6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function DumbbellIcon({ size = 20, color = "#2C5A69", strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 12h11M4 9v6M20 9v6M7 7v10M17 7v10"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function LeafIcon({ size = 20, color = "#4E3E80", strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3a5 5 0 0 0-5 5c0 3 2 4 2 4H9v6h6v-6h0s2-1 2-4a5 5 0 0 0-5-5Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CheckIcon({ size = 10, color = "#FFFFFF", strokeWidth = 3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 13l4 4L19 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 16, color = "#5B6C61", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m9 6 6 6-6 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function UploadIcon({ size = 15, color = "#3B2A05", strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 16V4M7 9l5-5 5 5M4 20h16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function HomeIcon({ size = 21, color = "#5B6C61", strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 11.5 12 4l9 7.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 10v10h14V10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function GridIcon({ size = 21, color = "#5B6C61", strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={3.5} width={7} height={7} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
      <Rect x={13.5} y={3.5} width={7} height={7} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
      <Rect x={3.5} y={13.5} width={7} height={7} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
      <Rect x={13.5} y={13.5} width={7} height={7} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function CalendarIcon({ size = 21, color = "#5B6C61", strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={5} width={17} height={16} rx={2.5} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function ProfileIcon({ size = 21, color = "#5B6C61", strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.4} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function MessageIcon({ size = 21, color = "#5B6C61", strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H9l-4.2 3.2a.5.5 0 0 1-.8-.4V17H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Center-circle "pitch ring" divider line used inside ProgressRing
export function PitchHalfLine({ size = 104, color = "rgba(255,255,255,0.12)" }: IconProps & { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute" }}>
      <Line x1={size / 2} y1={8} x2={size / 2} y2={size - 8} stroke={color} strokeWidth={1} />
    </Svg>
  );
}
