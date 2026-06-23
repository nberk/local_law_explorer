import { useEffect, useMemo, useState } from "react";
import {
  LENSES,
  TOPICS,
  TOPIC_BADGE,
  OPACITY_FLAG,
  sourceSearchUrl,
  type Jurisdiction,
  type Law,
  type LensId,
} from "../lib/topics";

const PAGE = 60;
const SNIPPET = 360;

// Stopgap until the build pipeline drops administrative front-matter: in the
// default (unsearched) browse, sink the city's own ceremonial provisions and
// pure code-mechanics — they're never what a resident is looking for, and the
// topic classifier often mislabels them (e.g. "Municipal flag" tagged Nuisance).
// Anchored to the city's OWN insignia so we don't catch substantive license rules.
const BOILERPLATE =
  /(municipal flag|city flag|official flag|corporate seal|city seal|official seal|seal and emblem|coat of arms|\bpennant\b|decorations on public|honorary|commemorat|naming and renaming|municipal device|code revision|numbering of code|references? to (the )?(former|section))/i;

function isBoilerplate(law: Law): boolean {
  return law.topic === "Other" || BOILERPLATE.test(law.title || "");
}

function LawCard({
  law,
  jurisName,
  stateName,
}: {
  law: Law;
  jurisName: string;
  stateName: string;
}) {
  const [open, setOpen] = useState(false);
  const long = law.content.length > SNIPPET;
  const text = open || !long ? law.content : law.content.slice(0, SNIPPET) + "…";
  const opaque = law.scores.opacity !== null && law.scores.opacity >= OPACITY_FLAG;

  return (
    <div className="rounded-lg border border-[var(--rule)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            "rounded px-1.5 py-0.5 text-[10.5px] font-medium " +
            (TOPIC_BADGE[law.topic] || TOPIC_BADGE.Other)
          }
        >
          {law.topic}
        </span>
        {law.section && (
          <span className="font-mono text-[11px] text-ink-400">{law.section}</span>
        )}
        {opaque && (
          <span className="rounded border border-ink-100 bg-ink-50 px-1.5 py-0.5 text-[10.5px] text-ink-500">
            densely worded
          </span>
        )}
      </div>
      <h3 className="mt-1.5 font-display text-[16px] font-semibold leading-snug text-ink-900">
        {law.title}
      </h3>
      <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-ink-700">
        {text}
      </p>
      <div className="mt-2.5 flex items-center gap-4 text-[12px]">
        {long && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-ink-500 transition hover:text-ink-900"
          >
            {open ? "Show less" : "Show full text"}
          </button>
        )}
        <a
          href={sourceSearchUrl(jurisName, stateName, law)}
          target="_blank"
          rel="noopener"
          className="text-accent-600 transition hover:text-accent-700"
        >
          Find in official code →
        </a>
      </div>
    </div>
  );
}

export default function LawBrowser({ jurisId }: { jurisId: string }) {
  const [data, setData] = useState<Jurisdiction | null>(null);
  const [err, setErr] = useState(false);
  const [lens, setLens] = useState<LensId>("everyday");
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string>("All");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    fetch(`/data/${jurisId}.json`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [jurisId]);

  // reset paging when filters change
  useEffect(() => setLimit(PAGE), [lens, q, topic]);

  const lensCounts = useMemo(() => {
    const c: Record<string, number> = { everyday: 0, business: 0, renting: 0 };
    data?.laws.forEach((l) => l.lenses.forEach((ln) => (c[ln] = (c[ln] || 0) + 1)));
    return c;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const base = data.laws.filter((l) => {
      if (!l.lenses.includes(lens)) return false;
      if (lens === "everyday" && topic !== "All" && l.topic !== topic) return false;
      if (s && !(l.title.toLowerCase().includes(s) || l.content.toLowerCase().includes(s)))
        return false;
      return true;
    });

    // When searching, rank by where the term matches: title (prefix best) >
    // section number > body-only. Without ranking, an incidental mention in the
    // body of an unrelated law outranks the law that's actually about the term.
    if (s) {
      const rank = (l: Law) => {
        const t = l.title.toLowerCase();
        if (t.includes(s)) return t.startsWith(s) ? 0 : 1;
        if ((l.section || "").toLowerCase().includes(s)) return 2;
        return 3;
      };
      return base
        .map((l, i) => ({ l, i, r: rank(l) }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map((x) => x.l);
    }

    // Default browse: sink administrative/ceremonial boilerplate below the
    // substantive rules; keep source order otherwise.
    return base
      .map((l, i) => ({ l, i, o: isBoilerplate(l) ? 1 : 0 }))
      .sort((a, b) => a.o - b.o || a.i - b.i)
      .map((x) => x.l);
  }, [data, lens, q, topic]);

  if (err)
    return (
      <p className="text-[14px] text-ink-500">
        Could not load this jurisdiction’s data.
      </p>
    );
  if (!data)
    return <p className="text-[14px] text-ink-400">Loading local laws…</p>;

  const activeLens = LENSES.find((l) => l.id === lens)!;

  return (
    <div>
      {/* lens tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--rule)]">
        {LENSES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLens(l.id)}
            className={
              "-mb-px border-b-2 px-3 py-2 text-[13.5px] transition " +
              (lens === l.id
                ? "border-accent-500 font-medium text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-900")
            }
          >
            {l.label}
            <span className="ml-1.5 font-mono text-[11px] text-ink-400">
              {lensCounts[l.id] || 0}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-[13.5px] text-ink-500">{activeLens.blurb}</p>

      {/* controls */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search these laws… (e.g. noise, chickens, fence, permit)"
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[14px] placeholder:text-ink-400 focus:border-accent-500 focus:outline-none sm:max-w-sm"
        />
        {q.trim() && (
          <span className="font-mono text-[12px] text-ink-400">
            {filtered.length.toLocaleString()} matches
          </span>
        )}
      </div>

      {lens === "everyday" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["All", ...TOPICS].map((t) => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={
                "rounded px-2 py-0.5 text-[12px] transition " +
                (topic === t
                  ? "bg-ink-900 text-white"
                  : "border border-ink-200 bg-white text-ink-600 hover:border-ink-400")
              }
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* results */}
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {filtered.slice(0, limit).map((l) => (
          <LawCard
            key={l.id}
            law={l}
            jurisName={data.name}
            stateName={data.stateName}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-6 text-[14px] text-ink-500">
          No laws match. Try a different search term or lens.
        </p>
      )}

      {filtered.length > limit && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setLimit((n) => n + PAGE)}
            className="rounded-md border border-ink-200 bg-white px-4 py-2 text-[13px] font-medium text-ink-700 transition hover:border-ink-400"
          >
            Show more ({(filtered.length - limit).toLocaleString()} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
