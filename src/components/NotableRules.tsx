import {
  NOTABLE_REASON_LABEL,
  type NotableRef,
  type Law,
} from "../lib/topics";
import LawCard from "./LawCard";

// Module 3 — distinctive ordinances surfaced by a text-only heuristic. It
// matches words, not meaning, so it can be wrong; the copy says so. When nothing
// clears the bar (e.g. a charter-only corpus) the section renders nothing.
export default function NotableRules({
  notable,
  laws,
  name,
}: {
  notable: NotableRef[];
  laws: Law[];
  name: string;
}) {
  const byId = new Map(laws.map((l) => [l.id, l]));
  const refs = notable
    .map((n) => ({ law: byId.get(n.id), reason: n.reason }))
    .filter((r) => r.law) as { law: Law; reason: string }[];

  if (refs.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
        Notable rules
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
        A text-only heuristic surfaced these as distinctive. It matches words,
        not meaning, so treat it as a curiosity, not a survey of {name}’s code.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {refs.map(({ law, reason }) => (
          <LawCard
            key={law.id}
            law={law}
            tag={NOTABLE_REASON_LABEL[reason] ?? reason}
          />
        ))}
      </div>
    </section>
  );
}
