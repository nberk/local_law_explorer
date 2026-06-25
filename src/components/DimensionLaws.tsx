import { useMemo, useState } from "react";
import type { DimensionMeta, Law } from "../lib/topics";
import LawCard from "./LawCard";

// The laws behind one portrait dimension: this town's own laws ranked by the raw
// model score, with a scrubber and jump-to-extreme buttons. Turns an abstract
// percentile ("denser than 80% of towns") into the actual paragraphs that earned
// it — the score becomes inspectable instead of asserted.
export default function DimensionLaws({
  laws,
  meta,
}: {
  laws: Law[];
  meta: DimensionMeta;
}) {
  // Rank by raw z-score, highest first (index 0 = the "most" extreme). Drop laws
  // with no score for this axis (defensive — populated 100% in spot checks).
  const ranked = useMemo(
    () =>
      laws
        .map((l) => ({ law: l, score: l.scores[meta.key] }))
        .filter((r): r is { law: Law; score: number } => r.score !== null && r.score !== undefined)
        .sort((a, b) => b.score - a.score),
    [laws, meta.key],
  );

  const [pos, setPos] = useState(0);

  if (ranked.length === 0)
    return (
      <p className="mt-3 text-[13px] text-ink-400">
        No scored laws to show for this dimension.
      </p>
    );

  const max = ranked.length - 1;
  const clamped = Math.min(pos, max);
  const current = ranked[clamped];

  return (
    <div className="mt-3 rounded-lg border border-[var(--rule)] bg-ink-50/50 p-3">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <button
          onClick={() => setPos(0)}
          className="font-medium text-accent-700 transition hover:text-accent-500"
        >
          ← {meta.mostLabel}
        </button>
        <button
          onClick={() => setPos(max)}
          className="font-medium text-ink-500 transition hover:text-ink-900"
        >
          {meta.leastLabel} →
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={max}
        value={clamped}
        onChange={(e) => setPos(Number(e.target.value))}
        style={{ accentColor: "#3d63b3" }}
        className="mt-2 w-full cursor-pointer"
        aria-label={`Scrub this town's laws by ${meta.label}`}
      />

      <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-ink-400">
        <span>
          #{clamped + 1} of {ranked.length.toLocaleString()}
        </span>
        <span>
          {meta.label}: {current.score >= 0 ? "+" : ""}
          {current.score.toFixed(2)} (estimate)
        </span>
      </div>

      <div className="mt-2">
        <LawCard law={current.law} />
      </div>
    </div>
  );
}
