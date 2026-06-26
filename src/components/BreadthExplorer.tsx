import { useEffect, useState } from "react";
import {
  loadPatterns,
  tierOf,
  TIERS,
  CATEGORY_META,
  CATEGORY_COLOR,
  type PatternsData,
  type PrevalenceSubject,
} from "../lib/patternsData";

// §01 "Your town has a law about that" — the breadth view. Subjects ranked by how
// many city codes carry a rule, grouped into tiers, filterable by category. Tap a
// row to reveal example towns; each example links to that town's page with the
// relevant law seeded into its search (see scripts/build_patterns.py for the id
// resolution and the per-subject `q` term).
export default function BreadthExplorer() {
  const [data, setData] = useState<PatternsData | null>(null);
  const [err, setErr] = useState(false);
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadPatterns()
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  if (err)
    return <p className="mt-6 text-[14px] text-ink-500">Could not load the data.</p>;
  if (!data)
    return <p className="mt-6 text-[14px] text-ink-400">Loading subjects…</p>;

  const subjects = data.prevalence.filter((s) => cat === "all" || s.cat === cat);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        <Chip active={cat === "all"} onClick={() => setCat("all")} label="All" />
        {CATEGORY_META.map((c) => (
          <Chip
            key={c.id}
            active={cat === c.id}
            onClick={() => setCat(c.id)}
            label={c.label}
            color={c.color}
          />
        ))}
      </div>

      <div className="mt-7">
        {TIERS.map((tier) => {
          const rows = subjects.filter((s) => tierOf(s.share) === tier.id);
          if (!rows.length) return null;
          return (
            <div key={tier.id} className="mt-6 first:mt-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
                  {tier.label}
                </span>
                <span className="h-px flex-1 bg-[var(--rule)]" />
              </div>
              <div className="mt-3">
                {rows.map((s) => (
                  <Row
                    key={s.key}
                    subject={s}
                    open={open === s.key}
                    onToggle={() => setOpen(open === s.key ? null : s.key)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition " +
        (active
          ? "bg-ink-900 text-white"
          : "border border-ink-200 bg-white text-ink-600 hover:border-ink-300")
      }
    >
      {color && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: active ? "#fff" : color }}
        />
      )}
      {label}
    </button>
  );
}

function Row({
  subject,
  open,
  onToggle,
}: {
  subject: PrevalenceSubject;
  open: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round(subject.share * 100);
  const color = CATEGORY_COLOR[subject.cat] ?? "#8a8a82";
  return (
    <div className={open ? "rounded-lg bg-ink-50" : ""}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-ink-50"
      >
        <span className="flex w-[120px] shrink-0 items-center gap-2 text-[13.5px] text-ink-800 sm:w-[150px]">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          {subject.label}
        </span>
        <span className="relative h-[9px] flex-1 overflow-hidden rounded-full bg-ink-100">
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, background: color }}
          />
        </span>
        <span className="w-9 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-ink-500">
          {pct}%
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pl-[134px] sm:pl-[164px]">
          <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-400">
            Towns with this rule
          </p>
          <div className="flex flex-wrap gap-1.5">
            {subject.examples.map((ex, i) =>
              ex.id ? (
                <a
                  key={i}
                  href={`/${ex.id}?q=${encodeURIComponent(subject.q)}`}
                  className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[12.5px] text-ink-700 transition hover:border-accent-500 hover:text-ink-900"
                >
                  {ex.name}
                </a>
              ) : (
                <span
                  key={i}
                  className="rounded-md border border-transparent bg-white px-2.5 py-1 text-[12.5px] text-ink-400"
                >
                  {ex.name}
                </span>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
