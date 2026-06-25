import React from "react";
import { spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { C, serif } from "./theme";

// A spring 0→1, optionally delayed. Smooth (no bounce) by default.
export const useReveal = (
  delay = 0,
  config: Parameters<typeof spring>[0]["config"] = { damping: 200 },
) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

// Fade + rise entrance wrapper.
export const FadeUp: React.FC<{
  delay?: number;
  y?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, y = 26, children, style }) => {
  const p = useReveal(delay);
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [y, 0])}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// The "L" app mark.
export const Logo: React.FC<{ size?: number }> = ({ size = 88 }) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.18,
        background: C.ink900,
        color: C.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: serif,
        fontWeight: 700,
        fontSize: size * 0.56,
        lineHeight: 1,
      }}
    >
      L
    </div>
  );
};

// A faux mouse cursor that eases to a target.
export const Cursor: React.FC<{
  from: [number, number];
  to: [number, number];
  startFrame: number;
  durationInFrames: number;
}> = ({ from, to, startFrame, durationInFrames }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [startFrame, startFrame + durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ease = t * t * (3 - 2 * t); // smoothstep
  const x = interpolate(ease, [0, 1], [from[0], to[0]]);
  const y = interpolate(ease, [0, 1], [from[1], to[1]]);
  return (
    <svg
      width={46}
      height={46}
      viewBox="0 0 24 24"
      style={{ position: "absolute", left: x, top: y, zIndex: 50 }}
    >
      <path
        d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L19 14 Z"
        fill={C.ink900}
        stroke={C.white}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
};

// Section kicker (mono uppercase label).
export const Kicker: React.FC<{ children: React.ReactNode; mono: string }> = ({
  children,
  mono,
}) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 22,
      letterSpacing: 3,
      textTransform: "uppercase",
      color: C.ink400,
    }}
  >
    {children}
  </div>
);
