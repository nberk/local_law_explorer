import { useState } from "react";
import { DIMENSION_META, type DimensionMeta, type Law, type Portrait } from "../lib/topics";
import DimensionLaws from "./DimensionLaws";

// Module 1 — a plain-English "report card" for how this town's laws read and how
// far they reach, derived from the LOCUS model dimensions. Every statement is a
// machine estimate; the copy says so. Each gauge spells out what the dimension
// actually means before showing this town's score, and expands to the real laws
// behind it. Topic mix lives at the bottom of the page, not here.

// One gauge: the human question, a scale with this town's marker, the town's
// own sentence, a plain-English explanation, and an expander to the real laws.
function Gauge({
  meta,
  pct,
  sentence,
  name,
  laws,
}: {
  meta: DimensionMeta;
  pct: number; // raw national percentile: 0 = low end, 100 = high end
  sentence: string;
  name: string;
  laws: Law[];
}) {
  const [open, setOpen] = useState(false);
  const x = Math.min(100, Math.max(0, pct));

  return (
    <li className="rounded-lg border border-[var(--rule)] bg-white p-4">
      <p className="text-[13.5px] font-semibold text-ink-900">{meta.question}</p>

      {/* spectrum — a filled gradient with a pointer, NOT a draggable slider */}
      <div className="mt-3">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-ink-600">
          <span>{meta.lowEnd}</span>
          <span className="text-right">{meta.highEnd}</span>
        </div>

        {/* pointer caret sits above the bar; this town's line runs through it */}
        <div className="relative mt-2 pt-2">
          <div
            className="absolute top-0 z-10 -translate-x-1/2"
            style={{ left: `${x}%` }}
            aria-hidden="true"
          >
            <svg width="11" height="6" viewBox="0 0 11 6" className="text-accent-700">
              <path d="M5.5 6 0 0h11z" fill="currentColor" />
            </svg>
          </div>
          <div
            className="h-2.5 w-full rounded-full"
            style={{ background: meta.gradient }}
          />
          {/* typical-town notch */}
          <div
            className="absolute h-2.5 w-px bg-white/70"
            style={{ left: "50%", top: "8px" }}
            title="Typical U.S. town"
          />
          {/* this town's position marker */}
          <div
            className="absolute h-2.5 w-[2.5px] -translate-x-1/2 rounded-full bg-accent-700"
            style={{ left: `${x}%`, top: "8px" }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-ink-500">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-[2.5px] rounded-full bg-accent-700" />
            {name}
          </span>
          <span className="inline-flex items-center gap-1 text-ink-400">
            <span className="inline-block h-2.5 w-px bg-ink-400" />
            typical U.S. town
          </span>
        </div>
      </div>

      {/* this town's reading */}
      <p className="mt-2 text-[14px] leading-snug text-ink-800">
        <span className="font-medium">{name}</span> {sentence}.
      </p>

      {/* spell it out: what the dimension means */}
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-500">
        {meta.explain}
      </p>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2.5 text-[12px] font-medium text-accent-600 transition hover:text-accent-700"
      >
        {open
          ? "Hide examples"
          : `See ${name} laws, ${meta.lowEnd.toLowerCase()} to ${meta.highEnd.toLowerCase()} →`}
      </button>
      {open && <DimensionLaws laws={laws} meta={meta} />}
    </li>
  );
}

export default function PlacePortrait({
  portrait,
  name,
  laws,
}: {
  portrait: Portrait;
  name: string;
  laws: Law[];
}) {
  // The three verified dimensions, in DIMENSION_META order. Skip any without a
  // sentence (low-confidence towns) and problem_salience (verifyCopy guard).
  const gauges = DIMENSION_META.map((meta) => {
    const d = portrait.dimensions.find((x) => x.key === meta.key);
    if (!d || !d.sentence || d.verifyCopy) return null;
    return { meta, pct: d.percentile, sentence: d.sentence };
  }).filter(Boolean) as { meta: DimensionMeta; pct: number; sentence: string }[];

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
          {name} at a glance
        </h2>
        <span className="rounded border border-ink-100 bg-ink-50 px-1.5 py-0.5 text-[10.5px] text-ink-500">
          machine estimate
        </span>
      </div>

      <p className="mt-2 font-display text-[24px] font-semibold leading-snug text-ink-900">
        {portrait.headline}.
      </p>

      {portrait.limitedCoverage && (
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-600">
          Heads up: the corpus for {name} is thin and skews toward charter and
          administrative provisions, so this snapshot — and the sections below —
          reflect only the slice of {name}’s code that the dataset captured.
        </p>
      )}
      {portrait.lowConfidence && !portrait.limitedCoverage && (
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-600">
          Based on a small set of {portrait.lawCount.toLocaleString()} laws, so
          these comparisons are rough.
        </p>
      )}

      {gauges.length > 0 && (
        <>
          <p className="mt-4 text-[13.5px] leading-relaxed text-ink-500">
            Three things LOCUS estimates about how {name}’s laws are written and
            how far they reach. Each marker shows where {name} sits among the
            ~2,300 U.S. cities and counties in the dataset.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {gauges.map((g) => (
              <Gauge
                key={g.meta.key}
                meta={g.meta}
                pct={g.pct}
                sentence={g.sentence}
                name={name}
                laws={laws}
              />
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-400">
        These are model estimates, not official ratings, and a position on the
        scale is a percentile — how {name} compares with other towns, never a
        verdict that it is better or worse.{" "}
        <a href="/about" className="underline hover:text-ink-700">
          How this works
        </a>
        .
      </p>
    </section>
  );
}
