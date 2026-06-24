import { useMemo, useState } from "react";
import type { LegaleseLaw } from "../lib/data";
import { readability, gradeLabel, zToPercentile } from "../lib/readability";

// A semicircular needle gauge from "Plain English" to "Pure Legalese". The
// needle position is the opacity percentile (a model estimate); the facts below
// it are counted straight from the text.
function Gauge({ pct }: { pct: number }) {
  const cx = 150,
    cy = 150,
    R = 120;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (deg: number, r = R) => [cx + r * Math.cos(toRad(deg)), cy - r * Math.sin(toRad(deg))];
  const arc = (a1: number, a2: number, r = R) => {
    const [x1, y1] = pt(a1, r);
    const [x2, y2] = pt(a2, r);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const needleDeg = 180 - (Math.min(100, Math.max(0, pct)) / 100) * 180;
  const [nx, ny] = pt(needleDeg, R - 16);

  return (
    <svg viewBox="0 0 300 176" className="w-full max-w-[320px]">
      <path d={arc(180, 121)} stroke="#6b9e78" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d={arc(119, 61)} stroke="#d9a441" strokeWidth="14" fill="none" />
      <path d={arc(59, 0)} stroke="#c5705d" strokeWidth="14" fill="none" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#161610" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="#161610" />
      <text x="14" y="172" fill="#8a8a82" fontSize="10" fontFamily="monospace">PLAIN</text>
      <text x="286" y="172" fill="#8a8a82" fontSize="10" fontFamily="monospace" textAnchor="end">
        LEGALESE
      </text>
    </svg>
  );
}

function verdictFor(pct: number): string {
  if (pct >= 98) return "Read it three times. Then call a lawyer.";
  if (pct >= 92) return "You'll want to read this twice.";
  if (pct >= 80) return "Heavier going than most.";
  return "Surprisingly readable, for a law.";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--rule)] bg-white px-3 py-2">
      <div className="font-mono text-[15px] text-ink-900">{value}</div>
      <div className="mt-0.5 text-[10.5px] uppercase tracking-wider text-ink-400">{label}</div>
    </div>
  );
}

export default function LegaleseMeter({ laws }: { laws: LegaleseLaw[] }) {
  const [i, setI] = useState(0);
  const [squint, setSquint] = useState(false);

  // All hooks must run before any early return (rules of hooks); guard the data.
  const law = laws[i] ?? laws[0];
  const r = useMemo(() => readability(law?.content ?? ""), [law]);

  if (!laws.length || !law)
    return <p className="text-[14px] text-ink-500">No laws to show.</p>;

  const pct = zToPercentile(law.opacity);
  const [state, city] = law.jurisId.split("/");
  // Blur scales with how dense the law is — the densest never quite resolves.
  const blurPx = (Math.min(100, Math.max(60, pct)) / 100) * 4;

  const another = () => {
    if (laws.length < 2) return;
    let j = i;
    while (j === i) j = Math.floor(Math.random() * laws.length);
    setI(j);
    setSquint(false);
  };

  return (
    <div className="rounded-xl border border-[var(--rule)] bg-white p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-[300px_1fr] sm:items-center">
        <div className="flex flex-col items-center">
          <Gauge pct={pct} />
          <p className="-mt-2 text-center font-display text-[15px] font-medium text-ink-800">
            “{verdictFor(pct)}”
          </p>
        </div>

        <div>
          <p className="text-[13px] text-ink-500">
            Denser than about{" "}
            <span className="font-medium text-ink-900">{pct}%</span> of U.S.
            provisions{" "}
            <span className="text-ink-400">(opacity estimate, z = {law.opacity >= 0 ? "+" : ""}{law.opacity.toFixed(2)})</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Avg sentence" value={`${Math.round(r.avgSentenceLen)} words`} />
            <Stat label="Longest" value={`${r.longestSentence} words`} />
            <Stat label="Reading grade" value={`~${Math.round(r.grade)}`} />
          </div>
          <p className="mt-2 text-[11.5px] text-ink-400">
            About a {gradeLabel(r.grade)} reading level. Sentence and grade stats
            are counted from the text; the density score is a model estimate.
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--rule)] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="font-mono text-[11px] text-ink-400">
              {law.jurisName}
              {law.section ? ` · ${law.section}` : ""}
            </span>
            <h2 className="font-display text-[17px] font-semibold leading-snug text-ink-900">
              {law.title}
            </h2>
          </div>
          <button
            onClick={() => setSquint((s) => !s)}
            className={
              "shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] transition " +
              (squint
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-400")
            }
            title="Blur the text in proportion to its density"
          >
            Squint test
          </button>
        </div>

        <div
          className="mt-3 max-h-72 overflow-y-auto rounded-md border border-[var(--rule)] bg-ink-50/40 p-3"
          style={squint ? { filter: `blur(${blurPx.toFixed(1)}px)` } : undefined}
        >
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-700">
            {law.content}
          </p>
        </div>
        {squint && (
          <p className="mt-2 text-center text-[12px] italic text-ink-400">
            If you can read this, you might be a lawyer.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          onClick={another}
          className="rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition hover:bg-ink-700"
        >
          Show me another baffling law →
        </button>
        <a
          href={`/${state}/${city}`}
          className="text-[13px] text-accent-600 transition hover:text-accent-700"
        >
          More from {law.jurisName} →
        </a>
        <span className="ml-auto font-mono text-[11px] text-ink-400">
          {i + 1} / {laws.length}
        </span>
      </div>
    </div>
  );
}
