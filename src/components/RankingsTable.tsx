import { useMemo, useState } from "react";
import {
  DIMENSION_META,
  type DimensionKey,
  type JurisdictionSummary,
} from "../lib/topics";
import NationalPositionBar from "./NationalPositionBar";

// English ordinal suffix for a whole number (1st, 2nd, 3rd, 11th…). The 11–13
// exception takes "th" despite ending in 1/2/3, so check the last two digits first.
function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

// The value to rank on: inverted dimensions (opacity) use the "plainness"
// percentile so the axis reads in the friendly direction shown elsewhere.
function dimValue(
  j: JurisdictionSummary,
  key: DimensionKey,
  inverted: boolean,
): number | null {
  const d = j.dimensions?.[key];
  if (!d) return null;
  return inverted ? d.displayPercentile ?? 100 - d.percentile : d.percentile;
}

// City ranking — places each pilot on the national distribution for one chosen
// dimension. National-percentile framing, never a leaderboard verdict: a high
// position means the score is higher than most US towns, not "best" or "worst".
export default function RankingsTable({
  jurisdictions,
}: {
  jurisdictions: JurisdictionSummary[];
}) {
  const [active, setActive] = useState<DimensionKey>("opacity");
  const meta = DIMENSION_META.find((m) => m.key === active)!;

  const rows = useMemo(
    () =>
      jurisdictions
        .map((j) => ({ j, v: dimValue(j, active, meta.inverted) }))
        .filter((r): r is { j: JurisdictionSummary; v: number } => r.v !== null)
        .sort((a, b) => b.v - a.v),
    [jurisdictions, active, meta.inverted],
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {DIMENSION_META.map((m) => (
          <button
            key={m.key}
            onClick={() => setActive(m.key)}
            className={
              "rounded px-3 py-1 text-[13px] transition " +
              (active === m.key
                ? "bg-ink-900 text-white"
                : "border border-ink-200 bg-white text-ink-600 hover:border-ink-400")
            }
          >
            {m.rankLabel}
          </button>
        ))}
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-500">
        Sorted by <span className="text-ink-700">{meta.rankLabel.toLowerCase()}</span>.
        Higher = more than the typical US town; the <span className="text-ink-600">│</span>{" "}
        mark is that typical (50th-percentile) town. {meta.note}
      </p>

      <ol className="mt-4 space-y-0.5">
        {rows.map((r, i) => {
          const [state, city] = r.j.id.split("/");
          return (
            <li key={r.j.id}>
              <a
                href={`/${state}/${city}`}
                className="group flex items-center gap-3 rounded-md px-2 py-2 transition hover:bg-ink-50"
              >
                <span className="w-5 shrink-0 font-mono text-[12px] text-ink-400">
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-[14px] font-medium text-ink-800 group-hover:text-accent-700 sm:flex-none sm:w-44">
                  {r.j.name}
                  <span className="ml-1.5 font-mono text-[11px] text-ink-400">
                    {r.j.state}
                  </span>
                </span>
                <span className="hidden flex-1 sm:block">
                  <NationalPositionBar pct={r.v} showValue={false} />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[12px] text-ink-500">
                  {r.v}
                  <span className="text-ink-300">{ordinalSuffix(r.v)}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-[11.5px] leading-relaxed text-ink-400">
        Percentiles place each town against the ~2,287 cities and counties in the
        LOCUS corpus. Machine estimates, shown as percentiles, not verdicts.
      </p>
    </div>
  );
}
