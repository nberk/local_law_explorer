import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, TOPIC, mono } from "./theme";

// The place-page topic donut, animated: each wedge sweeps in sequentially.
// Mirrors src/components/TopicFingerprint.astro (composition by topic share).
type Slice = { topic: string; share: number };

const SLICES: Slice[] = [
  { topic: "Other", share: 0.31 },
  { topic: "Zoning", share: 0.22 },
  { topic: "Business", share: 0.17 },
  { topic: "Buildings", share: 0.15 },
  { topic: "Nuisance", share: 0.15 },
];

export const Donut: React.FC<{ size?: number; startFrame?: number; total?: number }> = ({
  size = 420,
  startFrame = 6,
  total = 3513,
}) => {
  const frame = useCurrentFrame();
  const stroke = size * 0.17;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const Circ = 2 * Math.PI * r;

  // Sweep all wedges in over a shared window, cumulatively.
  const sweep = interpolate(frame, [startFrame, startFrame + 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let acc = 0;
  const arcs = SLICES.map((s) => {
    const start = acc;
    acc += s.share;
    const shown = Math.max(0, Math.min(s.share, sweep - start));
    return { ...s, start, shown };
  });

  const countTotal = Math.round(
    interpolate(frame, [startFrame, startFrame + 30], [0, total], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.ink100} strokeWidth={stroke} />
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {arcs.map((a) => (
            <circle
              key={a.topic}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={TOPIC[a.topic]}
              strokeWidth={stroke}
              strokeDasharray={`${a.shown * Circ} ${Circ - a.shown * Circ}`}
              strokeDashoffset={-a.start * Circ}
            />
          ))}
        </g>
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontFamily: mono, fontSize: size * 0.13, color: C.ink900, lineHeight: 1 }}>
          {countTotal.toLocaleString()}
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: size * 0.042,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: C.ink400,
            marginTop: 8,
          }}
        >
          laws
        </div>
      </div>
    </div>
  );
};
