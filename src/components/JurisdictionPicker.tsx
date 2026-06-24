import { useEffect, useMemo, useState } from "react";
import { type JurisdictionSummary } from "../lib/topics";
import { loadIndexClient } from "../lib/clientData";
import TopicBar from "./TopicBar";

// At full scale (~2,000 jurisdictions) we never render the whole list. Show a
// short shortlist of the largest places until the user types, then filter and cap
// the rendered results.
const SHORTLIST = 12;
const MAX_RESULTS = 60;

function Card({ j }: { j: JurisdictionSummary }) {
  return (
    <a
      href={`/${j.id}`}
      className="group block rounded-lg border border-[var(--rule)] bg-white p-5 transition hover:border-ink-300 hover:shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[18px] font-semibold text-ink-900 transition group-hover:text-accent-700">
          {j.name}
        </h3>
        <span className="font-mono text-[12px] text-ink-400">{j.state}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-500">
        <span>{j.stateName}</span>
        <span className="text-ink-300">·</span>
        <span className="capitalize">{j.type}</span>
      </div>
      <div className="mt-3">
        <TopicBar counts={j.counts} />
      </div>
      {j.portraitTeaser && (
        <div className="mt-2 text-[12px] italic text-ink-600">
          {j.portraitTeaser.headline}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-500">
        <span>
          <span className="font-mono text-ink-700">
            {j.counts.total.toLocaleString()}
          </span>{" "}
          laws
        </span>
        <span className="text-ink-400">browse →</span>
      </div>
    </a>
  );
}

export default function JurisdictionPicker() {
  const [jurisdictions, setJurisdictions] = useState<JurisdictionSummary[] | null>(
    null,
  );
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    loadIndexClient()
      .then((d) => alive && setJurisdictions(d.jurisdictions))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);

  // Largest-first shortlist for the empty state. index.json is already sorted by
  // law count desc, so a slice is the largest places.
  const shortlist = useMemo(
    () => (jurisdictions ?? []).slice(0, SHORTLIST),
    [jurisdictions],
  );

  const search = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!search || !jurisdictions) return [];
    return jurisdictions
      .filter(
        (j) =>
          j.name.toLowerCase().includes(search) ||
          j.stateName.toLowerCase().includes(search) ||
          j.state.toLowerCase().includes(search),
      )
      .slice(0, MAX_RESULTS + 1); // +1 to detect "more than the cap"
  }, [search, jurisdictions]);

  const capped = matches.length > MAX_RESULTS;
  const shown = search ? matches.slice(0, MAX_RESULTS) : shortlist;

  return (
    <div>
      <div className="relative max-w-md">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            jurisdictions
              ? `Search ${jurisdictions.length.toLocaleString()} cities & counties…`
              : "Search a city or county…"
          }
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[14.5px] placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
        />
      </div>

      {err && (
        <p className="mt-6 text-[14px] text-ink-500">
          Couldn’t load the jurisdiction list. Please refresh.
        </p>
      )}
      {!err && !jurisdictions && (
        <p className="mt-6 text-[14px] text-ink-400">Loading jurisdictions…</p>
      )}

      {jurisdictions && (
        <>
          <h2 className="mt-8 text-[11px] uppercase tracking-wider text-ink-500 font-medium">
            {search
              ? `${matches.length > MAX_RESULTS ? MAX_RESULTS + "+" : shown.length} match${
                  shown.length === 1 ? "" : "es"
                }`
              : "Largest jurisdictions"}
          </h2>

          {search && shown.length === 0 && (
            <p className="mt-3 text-[14px] text-ink-500">
              No city or county matches “{q}”. Try a different spelling or a
              nearby place.
            </p>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((j) => (
              <Card key={j.id} j={j} />
            ))}
          </div>

          {!search && (
            <p className="mt-4 text-[12.5px] text-ink-500">
              Showing the {SHORTLIST} largest. Type above to search all{" "}
              {jurisdictions.length.toLocaleString()} cities and counties.
            </p>
          )}
          {capped && (
            <p className="mt-4 text-[12.5px] text-ink-500">
              Showing the first {MAX_RESULTS}. Keep typing to narrow it down.
            </p>
          )}
        </>
      )}
    </div>
  );
}
