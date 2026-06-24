import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SpectrumLaw } from "../lib/data";
import { TOPIC_BADGE } from "../lib/topics";
import { readability, gradeLabel, zToPercentile } from "../lib/readability";

type DimKey = "opacity" | "paternalism";

interface DimMeta {
  eyebrow: string;
  title: string;
  blurb: string;
  left: string;
  right: string;
  railFrom: string;
  railTo: string;
  // percentile sentence: "<verb> than <pct>% of U.S. provisions"
  verb: string;
  showReadability: boolean;
}

// Restrained, meaningful coloring: the rail darkens left→right (text getting
// "heavier"); paternalism shifts toward the brand accent. No traffic lights.
const META: Record<DimKey, DimMeta> = {
  opacity: {
    eyebrow: "Opacity spectrum",
    title: "From plain English to dense legalese",
    blurb:
      "LOCUS scores every U.S. ordinance for how densely it’s written. Drag along the scale to read real laws at each level — the original text, and a plain-language version.",
    left: "Plain English",
    right: "Dense legalese",
    railFrom: "#ececea",
    railTo: "#28281f",
    verb: "Denser",
    showReadability: true,
  },
  paternalism: {
    eyebrow: "Paternalism spectrum",
    title: "From leaving you alone to telling you what you can do",
    blurb:
      "How much a law steps in to regulate personal conduct, scored by the LOCUS models. Drag to compare the hands-off end with the rules that govern behavior.",
    left: "Leaves you alone",
    right: "Regulates conduct",
    railFrom: "#e3eaf6",
    railTo: "#243c79",
    verb: "More restrictive",
    showReadability: false,
  },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function SpectrumExplorer({
  dimKey,
  laws,
}: {
  dimKey: DimKey;
  laws: SpectrumLaw[];
}) {
  const meta = META[dimKey];
  const [i, setI] = useState(() => Math.floor((laws.length - 1) / 2));
  const [view, setView] = useState<"plain" | "original">("plain");
  const [squint, setSquint] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Each law's position on the rail = its national percentile (standard-normal
  // CDF of the z-score), so the dots show real clustering, not even spacing.
  const points = useMemo(
    () => laws.map((l) => ({ law: l, pct: zToPercentile(l.score) })),
    [laws],
  );

  const law = laws[i] ?? laws[0];
  const pct = points[i]?.pct ?? 50;
  const r = useMemo(() => readability(law?.content ?? ""), [law]);

  // Pointer x → nearest law by percentile.
  const selectFromX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const p = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      let best = 0;
      let bestD = Infinity;
      points.forEach((pt, idx) => {
        const d = Math.abs(pt.pct - p);
        if (d < bestD) {
          bestD = d;
          best = idx;
        }
      });
      setI(best);
      setSquint(false);
    },
    [points],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && selectFromX(e.clientX);
    const up = () => (dragging.current = false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [selectFromX]);

  if (!laws.length || !law)
    return <p className="text-[14px] text-ink-500">No laws to show.</p>;

  const step = (d: number) => {
    setI((n) => clamp(n + d, 0, laws.length - 1));
    setSquint(false);
  };
  const [state, city] = law.jurisId.split("/");
  // Squint blur scales with density percentile (opacity view only).
  const blurPx = (clamp(pct, 55, 100) / 100) * 3.5;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule)] bg-white">
      {/* header */}
      <div className="px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
            {meta.eyebrow}
          </span>
          <span className="rounded border border-ink-100 bg-ink-50 px-1.5 py-0.5 text-[10px] text-ink-500">
            machine estimate
          </span>
        </div>
        <h3 className="mt-1.5 font-display text-[21px] font-semibold leading-snug text-ink-900">
          {meta.title}
        </h3>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-500">
          {meta.blurb}
        </p>
      </div>

      {/* the rail */}
      <div className="px-5 pt-6 sm:px-6">
        <div className="flex items-center justify-between text-[11px] font-medium text-ink-500">
          <span>← {meta.left}</span>
          <span>{meta.right} →</span>
        </div>

        <div
          ref={trackRef}
          onPointerDown={(e) => {
            dragging.current = true;
            selectFromX(e.clientX);
          }}
          role="slider"
          tabIndex={0}
          aria-label={`${meta.eyebrow}: drag to choose a law`}
          aria-valuemin={0}
          aria-valuemax={laws.length - 1}
          aria-valuenow={i}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              step(-1);
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              step(1);
            }
          }}
          className="relative mt-2 h-12 cursor-pointer touch-none select-none rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        >
          {/* gradient bar */}
          <div
            className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${meta.railFrom}, ${meta.railTo})`,
            }}
          />
          {/* law ticks */}
          {points.map((pt, idx) => {
            const active = idx === i;
            return (
              <span
                key={idx}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[height,width]"
                style={{
                  left: `${pt.pct}%`,
                  height: active ? 0 : 12,
                  width: 2,
                  background: active ? "transparent" : "rgba(22,22,16,0.28)",
                }}
              />
            );
          })}
          {/* thumb */}
          <span
            className="pointer-events-none absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center"
            style={{ left: `${pct}%` }}
          >
            <span className="h-6 w-6 rounded-full border-2 border-white bg-ink-900 shadow-[0_1px_4px_rgba(0,0,0,0.25)]" />
          </span>
        </div>

        <p className="mt-1 text-[12px] text-ink-500">
          {meta.verb} than{" "}
          <span className="font-medium text-ink-900">{pct}%</span> of U.S.
          provisions{" "}
          <span className="text-ink-400">
            (z = {law.score >= 0 ? "+" : ""}
            {law.score.toFixed(2)}, estimate)
          </span>
        </p>
      </div>

      {/* the selected law */}
      <div className="mt-4 border-t border-[var(--rule)] bg-ink-50/40 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              "rounded px-1.5 py-0.5 text-[10px] font-medium " +
              (TOPIC_BADGE[law.topic] || TOPIC_BADGE.Other)
            }
          >
            {law.topic}
          </span>
          <span className="font-mono text-[11px] text-ink-400">
            {law.jurisName}, {law.state}
            {law.section ? ` · ${law.section}` : ""}
          </span>
        </div>
        <h4 className="mt-1 font-display text-[18px] font-semibold leading-snug text-ink-900">
          {law.title}
        </h4>

        {/* plain / original toggle */}
        <div className="mt-3 inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-[12.5px]">
          {(["plain", "original"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                "rounded px-2.5 py-1 font-medium transition " +
                (view === v
                  ? "bg-ink-900 text-white"
                  : "text-ink-500 hover:text-ink-900")
              }
            >
              {v === "plain" ? "Plain language" : "Original text"}
            </button>
          ))}
          {meta.showReadability && view === "original" && (
            <button
              onClick={() => setSquint((s) => !s)}
              className={
                "ml-0.5 rounded px-2.5 py-1 font-medium transition " +
                (squint
                  ? "bg-accent-500 text-white"
                  : "text-ink-400 hover:text-ink-900")
              }
              title="Blur the text in proportion to its density"
            >
              Squint
            </button>
          )}
        </div>

        {view === "plain" ? (
          law.plain ? (
            <div className="mt-2.5">
              <p className="text-[14.5px] leading-relaxed text-ink-800">
                {law.plain}
              </p>
              <p className="mt-2 text-[11px] text-ink-400">
                Plain-language version, written by AI from the original below. A
                paraphrase, not the law. Read the original and verify before
                relying on it.
              </p>
            </div>
          ) : (
            <p className="mt-2.5 text-[13px] italic text-ink-400">
              No plain-language version yet — see the original text.
            </p>
          )
        ) : (
          <div
            className="mt-2.5 max-h-60 overflow-y-auto rounded-md border border-[var(--rule)] bg-white p-3"
            style={squint ? { filter: `blur(${blurPx.toFixed(1)}px)` } : undefined}
          >
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-700">
              {law.content}
            </p>
          </div>
        )}

        {meta.showReadability && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-ink-500">
            <span>
              Avg sentence{" "}
              <span className="font-mono text-ink-800">
                {Math.round(r.avgSentenceLen)} words
              </span>
            </span>
            <span>
              Longest{" "}
              <span className="font-mono text-ink-800">
                {r.longestSentence} words
              </span>
            </span>
            <span>
              Reads at a{" "}
              <span className="font-mono text-ink-800">{gradeLabel(r.grade)}</span>{" "}
              level
            </span>
          </div>
        )}
      </div>

      {/* footer controls */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
        <div className="flex items-center gap-1">
          <button
            onClick={() => step(-1)}
            disabled={i === 0}
            className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[13px] text-ink-600 transition hover:border-ink-400 disabled:opacity-40"
            aria-label="Previous law"
          >
            ←
          </button>
          <button
            onClick={() => step(1)}
            disabled={i === laws.length - 1}
            className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[13px] text-ink-600 transition hover:border-ink-400 disabled:opacity-40"
            aria-label="Next law"
          >
            →
          </button>
        </div>
        <a
          href={`/${state}/${city}`}
          className="text-[12.5px] text-accent-600 transition hover:text-accent-700"
        >
          More from {law.jurisName} →
        </a>
        <span className="ml-auto font-mono text-[11px] text-ink-400">
          {i + 1} / {laws.length}
        </span>
      </div>
    </div>
  );
}
