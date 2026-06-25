import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { C, serif, sans, mono, TOPIC } from "./theme";
import { FadeUp, Logo, Kicker, useReveal } from "./ui";
import { Donut } from "./Donut";

// ---------- helpers ----------
const useCount = (to: number, start: number, dur: number) => {
  const frame = useCurrentFrame();
  return Math.round(
    interpolate(frame, [start, start + dur], [0, to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
};

const useType = (text: string, start: number, cps = 13) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(0, Math.floor((frame - start) / (fps / cps)));
  return text.slice(0, n);
};

const Caret: React.FC = () => {
  const frame = useCurrentFrame();
  const on = Math.floor(frame / 8) % 2 === 0;
  return (
    <span style={{ opacity: on ? 1 : 0, color: C.accent500, fontWeight: 400 }}>|</span>
  );
};

const Shell: React.FC<{ children: React.ReactNode; pad?: number }> = ({
  children,
  pad = 112,
}) => (
  <AbsoluteFill
    style={{
      background: C.bg,
      padding: pad,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }}
  >
    {children}
  </AbsoluteFill>
);

const SLICES = [
  { topic: "Other", share: 0.31, cue: "about typical" },
  { topic: "Zoning", share: 0.22, cue: "about typical" },
  { topic: "Business", share: 0.17, cue: "about typical" },
  { topic: "Buildings", share: 0.15, cue: "about typical" },
  { topic: "Nuisance", share: 0.15, cue: "less than typical" },
];

// ---------- Scene 1: hook ----------
const Hook: React.FC = () => {
  const logo = useReveal(2, { damping: 12 });
  return (
    <Shell>
      <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
        <div
          style={{
            transform: `scale(${interpolate(logo, [0, 1], [0.6, 1])})`,
            opacity: logo,
          }}
        >
          <Logo size={104} />
        </div>
        <FadeUp delay={12}>
          <div
            style={{
              fontFamily: sans,
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: 1,
              color: C.ink600,
            }}
          >
            Local Law Explorer
          </div>
        </FadeUp>
        <FadeUp delay={20}>
          <div
            style={{
              fontFamily: serif,
              fontSize: 118,
              fontWeight: 700,
              lineHeight: 1.0,
              color: C.ink900,
              letterSpacing: -2,
            }}
          >
            Know your
            <br />
            local laws.
          </div>
        </FadeUp>
        <FadeUp delay={32}>
          <div style={{ fontFamily: sans, fontSize: 34, color: C.ink500 }}>
            City &amp; county law, made readable.
          </div>
        </FadeUp>
      </div>
    </Shell>
  );
};

// ---------- Scene 2: the problem ----------
const Problem: React.FC = () => {
  const chips = ["§ Noise", "§ Fences", "§ Permits", "§ Chickens", "§ Parking"];
  return (
    <Shell>
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        <FadeUp delay={0}>
          <Kicker mono={mono}>The problem</Kicker>
        </FadeUp>
        <FadeUp delay={6}>
          <div
            style={{
              fontFamily: serif,
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              color: C.ink900,
              letterSpacing: -1.5,
            }}
          >
            Your town has hundreds of local laws.
          </div>
        </FadeUp>
        <FadeUp delay={16}>
          <div
            style={{
              fontFamily: sans,
              fontSize: 36,
              lineHeight: 1.4,
              color: C.ink500,
              maxWidth: 760,
            }}
          >
            Public — but scattered across scanned PDFs and a thousand different
            websites, each in its own format.
          </div>
        </FadeUp>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
          {chips.map((c, i) => {
            const p = useReveal(26 + i * 4, { damping: 14 });
            return (
              <div
                key={c}
                style={{
                  opacity: p,
                  transform: `translateY(${interpolate(p, [0, 1], [18, 0])}px) rotate(${
                    (i % 2 === 0 ? -1 : 1) * 2
                  }deg)`,
                  fontFamily: mono,
                  fontSize: 28,
                  color: C.ink400,
                  background: C.white,
                  border: `1px solid ${C.ink200}`,
                  borderRadius: 12,
                  padding: "14px 22px",
                }}
              >
                {c}
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
};

// ---------- Scene 3: the scale ----------
const StatCard: React.FC<{ value: number; label: string; delay: number; fmt?: boolean }> = ({
  value,
  label,
  delay,
  fmt = true,
}) => {
  const p = useReveal(delay, { damping: 16, stiffness: 120 });
  const n = useCount(value, delay, 26);
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [24, 0])}px)`,
        background: C.white,
        border: `1px solid ${C.ink200}`,
        borderRadius: 20,
        padding: "34px 38px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 64, color: C.ink900, lineHeight: 1 }}>
        {fmt ? n.toLocaleString() : n}
      </div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 22,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: C.ink500,
        }}
      >
        {label}
      </div>
    </div>
  );
};

const Scale: React.FC = () => (
  <Shell>
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <FadeUp delay={0}>
        <Kicker mono={mono}>One open dataset</Kicker>
      </FadeUp>
      <FadeUp delay={6}>
        <div
          style={{
            fontFamily: serif,
            fontSize: 82,
            fontWeight: 700,
            lineHeight: 1.04,
            color: C.ink900,
            letterSpacing: -1.5,
          }}
        >
          The whole country,
          <br />
          in one place.
        </div>
      </FadeUp>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 22,
          marginTop: 6,
        }}
      >
        <StatCard value={2211516} label="Ordinances" delay={18} />
        <StatCard value={1911} label="Cities" delay={24} />
        <StatCard value={376} label="Counties" delay={30} />
        <StatCard value={50} label="States" delay={36} fmt={false} />
      </div>
      <FadeUp delay={44}>
        <div
          style={{
            borderTop: `2px solid ${C.ink200}`,
            paddingTop: 26,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 23,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: C.accent700,
            }}
          >
            Dataset compiled by
          </div>
          <div
            style={{
              fontFamily: serif,
              fontWeight: 600,
              fontSize: 42,
              lineHeight: 1.18,
              color: C.ink900,
            }}
          >
            Denis Peskoff · Joe Barrow ·<br />
            Christopher Vu · Diag Davenport
          </div>
          <div style={{ fontFamily: mono, fontSize: 24, color: C.ink400 }}>
            LOCUS-v1 (2026) · CC BY-NC 4.0
          </div>
        </div>
      </FadeUp>
    </div>
  </Shell>
);

// ---------- Scene 4: find your town ----------
const ResultCard: React.FC<{
  name: string;
  type: string;
  dist: string;
  delay: number;
}> = ({ name, type, dist, delay }) => {
  const p = useReveal(delay, { damping: 18, stiffness: 130 });
  return (
    <div
      style={{
        opacity: p,
        transform: `translateX(${interpolate(p, [0, 1], [40, 0])}px)`,
        background: C.white,
        border: `1px solid ${C.ink200}`,
        borderRadius: 16,
        padding: "26px 30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 40, color: C.ink900 }}>
          {name}
        </div>
        <div style={{ fontFamily: sans, fontSize: 24, color: C.ink500 }}>
          {type}
        </div>
      </div>
      <div style={{ fontFamily: mono, fontSize: 26, color: C.accent700 }}>{dist}</div>
    </div>
  );
};

const FindTown: React.FC = () => {
  const zip = useType("10001", 18, 9);
  const panel = useReveal(8, { damping: 18, stiffness: 120 });
  return (
    <Shell>
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        <FadeUp delay={0}>
          <Kicker mono={mono}>Find your town</Kicker>
        </FadeUp>
        <FadeUp delay={4}>
          <div
            style={{
              fontFamily: serif,
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.04,
              color: C.ink900,
              letterSpacing: -1.5,
            }}
          >
            Start with where you live.
          </div>
        </FadeUp>
        <div
          style={{
            opacity: panel,
            transform: `translateY(${interpolate(panel, [0, 1], [30, 0])}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 18,
            marginTop: 6,
          }}
        >
          <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
            <div
              style={{
                background: C.ink900,
                color: C.white,
                fontFamily: sans,
                fontWeight: 600,
                fontSize: 30,
                borderRadius: 14,
                padding: "22px 30px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              ◉ Use my location
            </div>
            <div
              style={{
                flex: 1,
                background: C.white,
                border: `1px solid ${C.ink200}`,
                borderRadius: 14,
                padding: "22px 28px",
                fontFamily: sans,
                fontSize: 30,
                color: zip ? C.ink900 : C.ink400,
                display: "flex",
                alignItems: "center",
              }}
            >
              {zip || "ZIP code, city, or county…"}
              {zip.length < 5 ? <Caret /> : null}
            </div>
          </div>
          <ResultCard name="New York City" type="city" dist="0.4 mi" delay={40} />
          <ResultCard name="New York County" type="county" dist="1.1 mi" delay={48} />
        </div>
      </div>
    </Shell>
  );
};

// ---------- Scene 5: report card / donut ----------
const ReportCard: React.FC = () => (
  <Shell>
    <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
      <FadeUp delay={0}>
        <Kicker mono={mono}>Plain-English report card</Kicker>
      </FadeUp>
      <FadeUp delay={4}>
        <div
          style={{
            fontFamily: serif,
            fontSize: 78,
            fontWeight: 700,
            lineHeight: 1.04,
            color: C.ink900,
            letterSpacing: -1.5,
          }}
        >
          See what your town
          <br />
          actually regulates.
        </div>
      </FadeUp>
      <div style={{ display: "flex", alignItems: "center", gap: 56, marginTop: 8 }}>
        <Donut size={400} startFrame={16} total={3513} />
        <div style={{ display: "flex", flexDirection: "column", gap: 22, flex: 1 }}>
          {SLICES.map((s, i) => {
            const p = useReveal(24 + i * 5, { damping: 18 });
            return (
              <div
                key={s.topic}
                style={{
                  opacity: p,
                  transform: `translateX(${interpolate(p, [0, 1], [26, 0])}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: TOPIC[s.topic],
                  }}
                />
                <div style={{ fontFamily: sans, fontSize: 32, color: C.ink800, flex: 1 }}>
                  {s.topic}
                </div>
                <div style={{ fontFamily: mono, fontSize: 32, color: C.ink900 }}>
                  {Math.round(s.share * 100)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </Shell>
);

// ---------- Scene 6: search ----------
const SearchScene: React.FC = () => {
  const q = useType("noise", 16, 9);
  const results = [
    { t: "Noise control — unreasonable noise", s: "§ 24-218" },
    { t: "Construction hours", s: "§ 24-220" },
    { t: "Animal noise & barking dogs", s: "§ 161-4" },
  ];
  return (
    <Shell>
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        <FadeUp delay={0}>
          <Kicker mono={mono}>Search the real ordinances</Kicker>
        </FadeUp>
        <FadeUp delay={4}>
          <div
            style={{
              fontFamily: serif,
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.04,
              color: C.ink900,
              letterSpacing: -1.5,
            }}
          >
            Type a word. Read the law.
          </div>
        </FadeUp>
        <FadeUp delay={8} style={{ marginTop: 6 }}>
          <div
            style={{
              background: C.white,
              border: `2px solid ${C.accent500}`,
              borderRadius: 14,
              padding: "22px 28px",
              fontFamily: sans,
              fontSize: 32,
              color: C.ink900,
            }}
          >
            🔍 &nbsp;{q}
            {q.length < 5 ? <Caret /> : null}
          </div>
        </FadeUp>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {results.map((r, i) => {
            const p = useReveal(40 + i * 7, { damping: 18, stiffness: 130 });
            return (
              <div
                key={r.s}
                style={{
                  opacity: p,
                  transform: `translateY(${interpolate(p, [0, 1], [22, 0])}px)`,
                  background: C.ink50,
                  border: `1px solid ${C.ink100}`,
                  borderRadius: 12,
                  padding: "22px 26px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ fontFamily: sans, fontSize: 30, color: C.ink800 }}>{r.t}</div>
                <div style={{ fontFamily: mono, fontSize: 26, color: C.ink400 }}>{r.s}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
};

// ---------- Scene 7: CTA ----------
const CTA: React.FC = () => {
  const logo = useReveal(2, { damping: 14 });
  return (
    <Shell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 34,
        }}
      >
        <div style={{ opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.7, 1])})` }}>
          <Logo size={110} />
        </div>
        <FadeUp delay={12}>
          <div
            style={{
              fontFamily: serif,
              fontSize: 104,
              fontWeight: 700,
              lineHeight: 1.0,
              color: C.ink900,
              letterSpacing: -2,
            }}
          >
            Know your
            <br />
            local laws.
          </div>
        </FadeUp>
        <FadeUp delay={24}>
          <div
            style={{
              fontFamily: mono,
              fontSize: 40,
              color: C.white,
              background: C.accent700,
              borderRadius: 14,
              padding: "18px 34px",
            }}
          >
            locallaw.nick-berk.com
          </div>
        </FadeUp>
        <FadeUp delay={34}>
          <div style={{ fontFamily: sans, fontSize: 28, color: C.ink500 }}>
            2,287 cities &amp; counties · free &amp; non-commercial
          </div>
        </FadeUp>
        <FadeUp delay={42}>
          <div style={{ fontFamily: mono, fontSize: 24, color: C.ink400 }}>
            Built by Nick Berk
          </div>
        </FadeUp>
      </div>
    </Shell>
  );
};

// ---------- assembly ----------
const fadeT = () => (
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: 16 })}
  />
);

export const Sizzle: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={82}>
          <Hook />
        </TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={86}>
          <Problem />
        </TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={140}>
          <Scale />
        </TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={104}>
          <FindTown />
        </TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={110}>
          <ReportCard />
        </TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={100}>
          <SearchScene />
        </TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={110}>
          <CTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

// Total: 82+86+140+104+110+100+110 - 6*16 = 732 - 96 = 636 frames ≈ 21.2s @30fps.
export const SIZZLE_DURATION = 636;
