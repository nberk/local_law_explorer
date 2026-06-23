import { useMemo, useState } from "react";
import { TOPICS, TOPIC_COLOR, type JurisdictionSummary } from "../lib/topics";

function TopicBar({ counts }: { counts: Record<string, number> }) {
  const total = counts.total || 1;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      {TOPICS.map((t) => {
        const w = ((counts[t] || 0) / total) * 100;
        if (w <= 0) return null;
        return (
          <div
            key={t}
            style={{ width: `${w}%`, background: TOPIC_COLOR[t] }}
            title={`${t}: ${counts[t]}`}
          />
        );
      })}
    </div>
  );
}

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
      <div className="mt-0.5 text-[12.5px] text-ink-500">{j.stateName}</div>
      <div className="mt-3">
        <TopicBar counts={j.counts} />
      </div>
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

export default function JurisdictionPicker({
  jurisdictions,
}: {
  jurisdictions: JurisdictionSummary[];
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return jurisdictions;
    return jurisdictions.filter(
      (j) =>
        j.name.toLowerCase().includes(s) ||
        j.stateName.toLowerCase().includes(s) ||
        j.state.toLowerCase().includes(s),
    );
  }, [q, jurisdictions]);

  const large = filtered.filter((j) => j.size === "large");
  const small = filtered.filter((j) => j.size === "small");

  return (
    <div>
      <div className="relative max-w-md">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a city or state…"
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[14.5px] placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
        />
      </div>

      {filtered.length === 0 && (
        <p className="mt-6 text-[14px] text-ink-500">
          No jurisdiction matches “{q}”. The pilot release covers a small set of
          cities. Coverage will expand over time.
        </p>
      )}

      {large.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
            Large cities
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {large.map((j) => (
              <Card key={j.id} j={j} />
            ))}
          </div>
        </section>
      )}

      {small.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
            Small towns
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {small.map((j) => (
              <Card key={j.id} j={j} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
