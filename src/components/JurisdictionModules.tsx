import { useEffect, useRef, useState } from "react";
import type { Jurisdiction } from "../lib/topics";
import { DATA_BASE_URL } from "../lib/clientData";
import PlacePortrait from "./PlacePortrait";
import CommonQuestions from "./CommonQuestions";
import LawBrowser from "./LawBrowser";

// The /patterns explorer topics, matched against a town's law titles so we can
// link out to "how every town handles this" for the rules this town actually has.
const ZOOM_TOPICS = [
  { id: "dogs", label: "Dangerous dogs", re: /dangerous dog|vicious dog|pit bull/i },
  { id: "fireworks", label: "Fireworks", re: /firework/i },
  { id: "chickens", label: "Backyard chickens", re: /chicken|fowl|poultry/i },
  { id: "noise", label: "Noise", re: /\bnoise\b/i },
  {
    id: "str",
    label: "Short-term rentals",
    re: /short.?term rental|vacation rental|transient (lodging|occupanc)|\bairbnb\b/i,
  },
];

// One client island for the whole jurisdiction page. It fetches the (potentially
// multi-MB) per-jurisdiction file ONCE and shares the parsed document across the
// portrait, questions, and browse modules — avoiding the up-to-3x refetch we'd
// incur if each module fetched on its own.
//
// `name` is passed in from the page (sourced from index.json, where the geocoder
// repairs OCR-glued slug names like "Newyorkcity" → "New York City"). We use it
// instead of the per-jurisdiction file's `data.name`, which carries the raw
// build-time name and is not regenerated when only the manifest name changes.
export default function JurisdictionModules({
  jurisId,
  name,
}: {
  jurisId: string;
  name: string;
}) {
  const [data, setData] = useState<Jurisdiction | null>(null);
  const [err, setErr] = useState(false);

  // A search typed in the prominent top bar is handed to the full LawBrowser
  // below via a fresh object (new identity each submit, so the same term twice
  // still fires LawBrowser's seed effect, which scrolls the browse into view).
  const [seed, setSeed] = useState<{ q: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${DATA_BASE_URL}/${jurisId}.json`)
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

  // Deep-link from the /patterns breadth tiles (e.g. /tn/chattanooga?q=chicken):
  // seed the browse with the term so it searches and scrolls into view on load.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSeed({ q });
  }, []);

  if (err)
    return (
      <p className="mt-8 text-[14px] text-ink-500">
        Could not load this jurisdiction’s data.
      </p>
    );
  if (!data)
    return <p className="mt-8 text-[14px] text-ink-400">Loading local laws…</p>;

  const zoomTopics = ZOOM_TOPICS.filter((t) =>
    data.laws.some((l) => t.re.test(l.title)),
  );

  return (
    <>
      {/* Prominent, up-front search. The full browse (lenses, topic filters,
          chips) lives at the bottom; this makes it obvious from the top of the
          page that every rule is searchable, and jumps you there on submit. */}
      <TopSearch
        name={name}
        count={data.laws.length}
        onSearch={(q) => setSeed({ q })}
      />

      <PlacePortrait portrait={data.portrait} name={name} laws={data.laws} />
      <CommonQuestions questions={data.questions} laws={data.laws} name={name} />

      <section className="mt-12 border-t border-[var(--rule)] pt-8">
        <h2 className="font-display text-[20px] font-semibold text-ink-900">
          Dig deeper: browse every rule
        </h2>
        <p className="mt-1 text-[13.5px] text-ink-500">
          The full set of substantive ordinances, by topic, with search.
        </p>
        <div className="mt-5">
          <LawBrowser jurisId={jurisId} data={data} seed={seed} />
        </div>
      </section>

      {zoomTopics.length > 0 && (
        <section className="mt-12 border-t border-[var(--rule)] pt-8">
          <h2 className="font-display text-[20px] font-semibold text-ink-900">
            The bigger picture
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-500">
            See how towns across the country handle the same rules.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {zoomTopics.map((t) => (
              <a
                key={t.id}
                href={`/patterns#${t.id}`}
                className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13.5px] text-ink-700 transition hover:border-accent-500 hover:text-ink-900"
              >
                {t.label} →
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// Top-of-page search prompt. It doesn't search on its own — it forwards the term
// to the real LawBrowser below (single source of search truth) and lets that
// component scroll itself into view.
function TopSearch({
  name,
  count,
  onSearch,
}: {
  name: string;
  count: number;
  onSearch: (q: string) => void;
}) {
  const [value, setValue] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(value.trim());
  };

  return (
    <div className="mt-2 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <label
        htmlFor="top-search"
        className="block text-[14px] font-semibold text-ink-900"
      >
        Search {name}’s laws
      </label>
      <p className="mt-0.5 text-[12.5px] text-ink-500">
        Look up any rule in the full {count.toLocaleString()}-ordinance code — or
        read the highlights below first.
      </p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          id="top-search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="noise, chickens, fences, permits, parking…"
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[14px] placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-ink-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-ink-700"
        >
          Search
        </button>
      </form>
    </div>
  );
}
