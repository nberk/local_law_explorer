import type { Portrait } from "../lib/topics";

// A thin 0-100 track with a marker showing where this town sits nationally.
function PercentileBar({ pct }: { pct: number }) {
  return (
    <div className="relative h-1 w-full rounded-full bg-ink-100">
      <div
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500"
        style={{ left: `${Math.min(98, Math.max(2, pct))}%` }}
      />
    </div>
  );
}

// Module 1 — how this town's laws compare to the rest of the country, derived
// from the four LOCUS model dimensions and its topic mix. Every statement is a
// machine estimate; the copy says so and links to the method note.
export default function PlacePortrait({
  portrait,
  name,
}: {
  portrait: Portrait;
  name: string;
}) {
  // Lead with the concrete topic stand-outs, then the writing-style dimensions.
  // Skip problem_salience (sentence === null / verifyCopy) until its meaning is
  // confirmed against the paper.
  const rows = [
    ...portrait.topicMix.map((t) => ({ key: t.topic, sentence: t.sentence, pct: t.percentile })),
    ...portrait.dimensions
      .filter((d) => d.sentence && !d.verifyCopy)
      .map((d) => ({ key: d.key, sentence: d.sentence as string, pct: d.displayPercentile ?? d.percentile })),
  ];

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

      {rows.length > 0 && (
        <>
          <p className="mt-4 text-[13.5px] text-ink-500">
            Compared with the rest of the country, {name}…
          </p>
          <ul className="mt-3 space-y-3">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_120px] sm:items-center sm:gap-4">
                <span className="text-[14px] leading-snug text-ink-800">{r.sentence}</span>
                <span className="hidden sm:block">
                  <PercentileBar pct={r.pct} />
                </span>
              </li>
            ))}
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
