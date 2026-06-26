import { useEffect, useRef, useState } from "react";
import {
  loadPatterns,
  type PatternsData,
  type ApproachTopic,
  type ApproachLaw,
} from "../lib/patternsData";

// Light tint pairs [background, text] assigned to a topic's approaches by index,
// so each approach reads as a distinct tag in the swipe rail.
const APPROACH_TINTS: [string, string][] = [
  ["#E1F5EE", "#0F6E56"],
  ["#FAECE7", "#993C1D"],
  ["#EAF3DE", "#3B6D11"],
  ["#E6F1FB", "#0C447C"],
  ["#EEEDFE", "#3C3489"],
  ["#FAEEDA", "#854F0B"],
  ["#FBEAF0", "#72243E"],
  ["#F1EFE8", "#444441"],
];

// §02 "Same problem, different playbook" — pick a topic, see its menu of approaches
// and the real ordinances. Laws render as a horizontal swipe rail (not a tall
// stack) so a 15-law topic stays one line.
export default function ApproachExplorer() {
  const [data, setData] = useState<PatternsData | null>(null);
  const [err, setErr] = useState(false);
  const [topicId, setTopicId] = useState("dogs");
  const [approach, setApproach] = useState("all");

  useEffect(() => {
    let cleanup = () => {};
    loadPatterns()
      .then((d) => {
        setData(d);
        // Deep-link support: /patterns#noise preselects the Noise topic and
        // scrolls this section into view (the topic id is not a DOM id, so the
        // browser's own anchor scroll won't reach it). Runs on load and on any
        // later hash change, so an in-page link works without a reload too.
        const applyHash = () => {
          const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
          if (hash && d.topics.some((t) => t.id === hash)) {
            setTopicId(hash);
            setApproach("all");
            requestAnimationFrame(() =>
              document.getElementById("approaches")?.scrollIntoView({ behavior: "smooth" }),
            );
          }
        };
        applyHash();
        window.addEventListener("hashchange", applyHash);
        cleanup = () => window.removeEventListener("hashchange", applyHash);
      })
      .catch(() => setErr(true));
    return () => cleanup();
  }, []);

  if (err)
    return <p className="mt-6 text-[14px] text-ink-500">Could not load the data.</p>;
  if (!data)
    return <p className="mt-6 text-[14px] text-ink-400">Loading topics…</p>;

  const topic = data.topics.find((t) => t.id === topicId) ?? data.topics[0];
  const tintFor = (id: string) =>
    APPROACH_TINTS[topic.approaches.findIndex((a) => a.id === id)] ??
    APPROACH_TINTS[APPROACH_TINTS.length - 1];

  return (
    <div className="mt-6">
      {/* topic tabs */}
      <div className="flex flex-wrap gap-2">
        {data.topics.map((t) => {
          const active = t.id === topic.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTopicId(t.id);
                setApproach("all");
              }}
              className={
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-[13.5px] transition " +
                (active
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")
              }
            >
              <span aria-hidden>{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* topic header: question + prevalence + intro + split */}
      <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="font-display text-[22px] font-semibold leading-snug text-ink-900">
            {topic.question}
          </h3>
          <p
            className="mt-2 text-[15px] leading-relaxed text-ink-600"
            dangerouslySetInnerHTML={{ __html: topic.intro }}
          />
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[28px] leading-none text-ink-900">
            {Math.round((data.topicPrev[topic.id] ?? 0) * 100)}%
          </div>
          <div className="mt-1 text-[12px] text-ink-500">of cities</div>
        </div>
      </div>

      {topic.split && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SplitCard label={topic.split.a[0]} pct={topic.split.a[1]} color="#3f7d54" />
          <SplitCard label={topic.split.b[0]} pct={topic.split.b[1]} color="#b4532a" />
        </div>
      )}

      {/* approach filter menu */}
      <div className="mt-7 flex flex-wrap gap-2">
        <FilterChip
          active={approach === "all"}
          onClick={() => setApproach("all")}
          label="All approaches"
        />
        {topic.approaches.map((a) => (
          <FilterChip
            key={a.id}
            active={approach === a.id}
            onClick={() => setApproach(a.id)}
            label={a.name}
            tint={tintFor(a.id)}
          />
        ))}
      </div>

      <p className="mt-4 text-[12px] text-ink-400">
        Summaries are AI paraphrases, not the law. Open the actual text and verify.
      </p>

      <Rail topic={topic} approach={approach} tintFor={tintFor} />
    </div>
  );
}

function SplitCard({ label, pct, color }: { label: string; pct: string; color: string }) {
  const w = parseInt(pct, 10) || 0;
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="font-mono text-[20px] text-ink-900">{pct}</div>
      <div className="mt-0.5 text-[13px] text-ink-600">{label}</div>
      <span className="mt-2 block h-[6px] overflow-hidden rounded-full bg-ink-100">
        <span className="block h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      </span>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  tint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tint?: [string, string];
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-3 py-1.5 text-[12.5px] transition " +
        (active
          ? "bg-ink-900 text-white"
          : "border border-ink-200 bg-white text-ink-600 hover:border-ink-300")
      }
    >
      <span className="flex items-center gap-1.5">
        {tint && !active && (
          <span className="h-2 w-2 rounded-full" style={{ background: tint[1] }} />
        )}
        {label}
      </span>
    </button>
  );
}

function Rail({
  topic,
  approach,
  tintFor,
}: {
  topic: ApproachTopic;
  approach: string;
  tintFor: (id: string) => [string, string];
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const laws = topic.laws.filter((l) => approach === "all" || l.approach === approach);
  const scroll = (dir: number) =>
    railRef.current?.scrollBy({ left: dir * 276, behavior: "smooth" });

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] text-ink-400">
          {laws.length} {laws.length === 1 ? "law" : "laws"}
        </span>
        <span className="flex gap-1.5">
          <RailButton onClick={() => scroll(-1)} label="scroll left">
            ‹
          </RailButton>
          <RailButton onClick={() => scroll(1)} label="scroll right">
            ›
          </RailButton>
        </span>
      </div>
      <div
        ref={railRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]"
      >
        {laws.map((law, i) => (
          <LawCard key={i} law={law} tint={tintFor(law.approach)} name={topic.approaches.find((a) => a.id === law.approach)?.name ?? law.approach} />
        ))}
      </div>
    </div>
  );
}

function RailButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-md border border-ink-200 bg-white text-[16px] leading-none text-ink-500 transition hover:border-ink-300 hover:text-ink-900"
    >
      {children}
    </button>
  );
}

function LawCard({ law, tint, name }: { law: ApproachLaw; tint: [string, string]; name: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex w-[264px] shrink-0 snap-start flex-col rounded-xl border border-ink-200 bg-white p-4">
      <span
        className="mb-2.5 self-start rounded-md px-2 py-1 text-[10.5px]"
        style={{ background: tint[0], color: tint[1] }}
      >
        {name}
      </span>
      <div className="text-[12px] text-ink-400">
        {law.city}, {law.state}
      </div>
      <div className="mt-0.5 text-[14px] font-medium leading-snug text-ink-900">
        {law.title}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">{law.plain}</p>
      <button
        onClick={() => setShow(!show)}
        className="mt-3 self-start text-[12px] text-accent-600 hover:text-accent-700"
      >
        {show ? "Hide actual law ▴" : "Show actual law ▾"}
      </button>
      {show && (
        <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 p-2.5">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-400">
            Actual text (OCR'd)
          </p>
          <p className="font-mono text-[11.5px] leading-relaxed text-ink-700">
            {law.text}
          </p>
        </div>
      )}
    </div>
  );
}
