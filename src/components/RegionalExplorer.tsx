import { useEffect, useMemo, useState } from "react";
import {
  loadPatterns,
  loadStatePaths,
  regionAverages,
  REGION_LABEL,
  type PatternsData,
  type StatePaths,
} from "../lib/patternsData";

// Subjects offered in the §03 dropdown, in display order. Labels fall back to a
// prettified key when patterns.json's `labels` map doesn't carry one.
const SUBJECT_ORDER = [
  "snow_removal",
  "fireworks",
  "marijuana",
  "curfew",
  "dangerous_dogs",
  "golf_cart",
  "loitering",
  "chickens",
  "open_burning",
  "peddlers",
];
const SUBJECT_LABEL_OVERRIDE: Record<string, string> = {
  snow_removal: "Snow removal",
  dangerous_dogs: "Dangerous dogs (breed bans)",
  golf_cart: "Golf carts / ATVs",
  open_burning: "Open burning",
  curfew: "Juvenile curfew",
  peddlers: "Door-to-door sales",
  chickens: "Backyard chickens",
};

// Sequential coral ramp (light → dark) keyed to share. Single hue = magnitude.
const RAMP = ["#FAECE7", "#F5C4B3", "#F0997B", "#D85A30", "#993C1D"];
const NO_DATA = "#ece9e1";
const colorOf = (share: number) => RAMP[Math.min(RAMP.length - 1, Math.floor(share * RAMP.length))];

const REGION_COLOR: Record<string, string> = {
  NE: "#3f6d99",
  MW: "#3f7d54",
  S: "#b4532a",
  W: "#c79434",
};

// §03 "The rules change at the state line" — pick a subject, see where it's common.
// The map (hero) answers "where"; the four-region rollup answers "how big is the
// gap". Both lead with the punchline so the subject is obvious at a glance.
export default function RegionalExplorer() {
  const [data, setData] = useState<PatternsData | null>(null);
  const [paths, setPaths] = useState<StatePaths | null>(null);
  const [err, setErr] = useState(false);
  const [subject, setSubject] = useState("fireworks");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    Promise.all([loadPatterns(), loadStatePaths()])
      .then(([d, p]) => {
        setData(d);
        setPaths(p);
      })
      .catch(() => setErr(true));
  }, []);

  const subjects = useMemo(
    () => (data ? SUBJECT_ORDER.filter((s) => data.regional[s] && data.regionalNotes[s]) : []),
    [data],
  );

  const labelFor = (s: string) =>
    SUBJECT_LABEL_OVERRIDE[s] ??
    data?.labels[s] ??
    s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  if (err)
    return <p className="mt-6 text-[14px] text-ink-500">Could not load the data.</p>;
  if (!data || !paths)
    return <p className="mt-6 text-[14px] text-ink-400">Loading the map…</p>;

  const shares = data.regional[subject];
  const rollup = regionAverages(shares, data.region, data.stateN);
  const top = rollup[0];
  const bottom = rollup[rollup.length - 1];
  const allStates = Object.entries(shares).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="regional-subject" className="text-[13px] text-ink-500">
          Subject
        </label>
        <select
          id="regional-subject"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setShowAll(false);
          }}
          className="rounded-md border border-ink-200 bg-white px-3 py-2 text-[14px] text-ink-800 focus:border-accent-500 focus:outline-none"
        >
          {subjects.map((s) => (
            <option key={s} value={s}>
              {labelFor(s)}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-4 text-[15px] font-medium text-ink-900">
        {labelFor(subject)}:{" "}
        <span style={{ color: "#993C1D" }}>
          {REGION_LABEL[top.region]} {Math.round(top.share * 100)}%
        </span>{" "}
        <span className="text-ink-400">→</span>{" "}
        <span className="text-ink-500">
          {REGION_LABEL[bottom.region]} {Math.round(bottom.share * 100)}%
        </span>
      </p>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-500">
        {data.regionalNotes[subject]}
      </p>

      {/* map (hero) */}
      <div className="mt-5">
        <svg
          viewBox={`0 0 ${paths.width} ${paths.height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${labelFor(subject)} share of city codes by state`}
        >
          {Object.entries(paths.paths).map(([code, d]) => {
            const v = shares[code];
            return (
              <path
                key={code}
                d={d}
                fill={v == null ? NO_DATA : colorOf(v)}
                stroke="#fbfbf9"
                strokeWidth={0.7}
              >
                <title>
                  {data.stateNames[code] ?? code.toUpperCase()}
                  {v == null ? ": no data" : `: ${Math.round(v * 100)}%`}
                </title>
              </path>
            );
          })}
        </svg>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-400">
          <span>0%</span>
          <span className="flex overflow-hidden rounded-sm">
            {RAMP.map((c) => (
              <span key={c} className="h-2.5 w-7" style={{ background: c }} />
            ))}
          </span>
          <span>100%</span>
          <span className="ml-auto">gray = no data</span>
        </div>
      </div>

      {/* four-region rollup */}
      <div className="mt-7 max-w-xl">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
          By region
        </p>
        {rollup.map((r) => {
          const pct = Math.round(r.share * 100);
          return (
            <div key={r.region} className="my-2.5 flex items-center gap-3">
              <span className="w-[84px] shrink-0 text-[13.5px] text-ink-800">
                {REGION_LABEL[r.region]}
              </span>
              <span className="relative h-[22px] flex-1 overflow-hidden rounded-md bg-ink-100">
                <span
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{ width: `${pct}%`, background: "#D85A30" }}
                />
              </span>
              <span className="w-10 shrink-0 text-right font-mono text-[13px] tabular-nums text-ink-500">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* detail on demand: all states ranked, colored by region */}
      <button
        onClick={() => setShowAll(!showAll)}
        className="mt-5 text-[12.5px] text-accent-600 hover:text-accent-700"
      >
        {showAll ? "Hide the state-by-state detail ▴" : `Show all ${allStates.length} states ▾`}
      </button>
      {showAll && (
        <div className="mt-3 max-w-xl">
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-500">
            {Object.entries(REGION_LABEL).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: REGION_COLOR[k] }} />
                {label}
              </span>
            ))}
          </div>
          {allStates.map(([code, share]) => {
            const pct = Math.round(share * 100);
            return (
              <div key={code} className="my-1 flex items-center gap-3">
                <span className="w-[112px] shrink-0 text-right text-[12.5px] text-ink-700">
                  {data.stateNames[code] ?? code.toUpperCase()}
                </span>
                <span className="relative h-[13px] flex-1 overflow-hidden rounded-full bg-ink-100">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${pct}%`, background: REGION_COLOR[data.region[code]] ?? "#8a8a82" }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right font-mono text-[12px] tabular-nums text-ink-500">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
