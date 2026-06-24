import { useState } from "react";
import { DIMENSION_META, type Law, type Portrait } from "../lib/topics";
import DimensionLaws from "./DimensionLaws";
import NationalPositionBar from "./NationalPositionBar";

// Module 1 — how this town's laws compare to the rest of the country, derived
// from the four LOCUS model dimensions and its topic mix. Every statement is a
// machine estimate; the copy says so and links to the method note. Each writing-
// style dimension expands to the actual laws behind its score (DimensionLaws).
export default function PlacePortrait({
  portrait,
  name,
  stateName,
  laws,
}: {
  portrait: Portrait;
  name: string;
  stateName: string;
  laws: Law[];
}) {
  const [openDim, setOpenDim] = useState<string | null>(null);

  // Topic stand-outs are static context. Skip problem_salience (sentence === null
  // / verifyCopy) until its meaning is confirmed against the paper.
  const topicRows = portrait.topicMix.map((t) => ({
    key: t.topic,
    sentence: t.sentence,
    pct: t.percentile,
  }));
  const dimRows = portrait.dimensions
    .filter((d) => d.sentence && !d.verifyCopy)
    .map((d) => ({
      key: d.key,
      sentence: d.sentence as string,
      pct: d.displayPercentile ?? d.percentile,
      meta: DIMENSION_META.find((m) => m.key === d.key),
    }))
    .filter((d) => d.meta);

  const hasRows = topicRows.length + dimRows.length > 0;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
          How {name} compares
        </h2>
        <span className="rounded border border-ink-100 bg-ink-50 px-1.5 py-0.5 text-[10.5px] text-ink-500">
          machine estimate
        </span>
      </div>

      <p className="mt-2 font-display text-[22px] font-semibold leading-snug text-ink-900">
        {portrait.headline}.
      </p>

      {portrait.limitedCoverage && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
          Heads up: the corpus for {name} is thin and skews toward charter and
          administrative provisions, so this portrait — and the sections below —
          reflect only the slice of {name}’s code that the dataset captured.
        </p>
      )}
      {portrait.lowConfidence && !portrait.limitedCoverage && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
          Based on a small set of {portrait.lawCount.toLocaleString()} laws, so
          these comparisons are rough.
        </p>
      )}

      {hasRows && (
        <>
          <p className="mt-4 text-[13.5px] text-ink-500">
            Compared with the rest of the country, {name}…
          </p>
          <ul className="mt-3 space-y-3">
            {topicRows.map((r) => (
              <li
                key={r.key}
                className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_150px] sm:items-center sm:gap-4"
              >
                <span className="text-[14px] leading-snug text-ink-800">{r.sentence}</span>
                <span className="hidden sm:block">
                  <NationalPositionBar pct={r.pct} />
                </span>
              </li>
            ))}

            {dimRows.map((r) => {
              const open = openDim === r.key;
              return (
                <li key={r.key} className="rounded-lg border border-[var(--rule)] bg-white">
                  <button
                    onClick={() => setOpenDim(open ? null : r.key)}
                    aria-expanded={open}
                    className="w-full px-3 py-2.5 text-left transition hover:bg-ink-50/60"
                  >
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_150px] sm:items-center sm:gap-4">
                      <span className="text-[14px] leading-snug text-ink-800">
                        {r.sentence}
                      </span>
                      <span className="hidden sm:block">
                        <NationalPositionBar pct={r.pct} />
                      </span>
                    </div>
                    <span className="mt-1 inline-block text-[11.5px] text-accent-600">
                      {open ? "Hide the laws behind this" : "See the laws behind this →"}
                    </span>
                  </button>
                  {open && r.meta && (
                    <div className="px-3 pb-3">
                      <DimensionLaws
                        laws={laws}
                        meta={r.meta}
                        jurisName={name}
                        stateName={stateName}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-400">
        Percentiles compare this place against the ~2,300 cities and counties in
        the corpus, using model-scored dimensions (writing density, how much
        conduct is regulated, how much is left to officials).{" "}
        <a href="/about" className="underline hover:text-ink-700">
          How this works
        </a>
        .
      </p>
    </section>
  );
}
