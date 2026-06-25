import { useState } from "react";
import {
  QUESTIONS_META,
  TOPIC_BADGE,
  type QuestionMatch,
  type Law,
} from "../lib/topics";

const SNIPPET = 280;

// One matched law inside a question card: badge + section + title, then the
// VERBATIM ordinance text (expandable when long). A keyword match is not a yes/no
// answer, so we show the actual rule and let the reader judge — no external link,
// no asserted outcome.
function MatchedLaw({ law }: { law: Law }) {
  const [open, setOpen] = useState(false);
  const long = law.content.length > SNIPPET;
  const text = open || !long ? law.content : law.content.slice(0, SNIPPET) + "…";

  return (
    <li className="border-t border-[var(--rule)] pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            "rounded px-1.5 py-0.5 text-[10px] font-medium " +
            (TOPIC_BADGE[law.topic] || TOPIC_BADGE.Other)
          }
        >
          {law.topic}
        </span>
        {law.section && (
          <span className="font-mono text-[10.5px] text-ink-400">
            {law.section}
          </span>
        )}
      </div>
      <h4 className="mt-0.5 text-[13.5px] font-semibold leading-snug text-ink-800">
        {law.title}
      </h4>
      <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-600">
        {text}
      </p>
      {long && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-[12px] text-accent-600 transition hover:text-accent-700"
        >
          {open ? "Show less" : "Show full text"}
        </button>
      )}
    </li>
  );
}

// Module 2 — everyday "Can I ...?" questions answered by surfacing the rule(s)
// that mention the topic. A keyword match is NOT a yes/no answer, so the framing
// routes the reader to the actual text and never asserts the legal outcome.
export default function CommonQuestions({
  questions,
  laws,
  name,
}: {
  questions: QuestionMatch[];
  laws: Law[];
  name: string;
}) {
  const byId = new Map(laws.map((l) => [l.id, l]));
  const matchOf = new Map(questions.map((q) => [q.id, q.matches]));

  // Only surface questions that actually matched a local rule. A keyword match
  // is not a yes/no answer, but a question with zero matches has nothing to
  // show, so we drop the card entirely instead of rendering an empty stub.
  const answered = QUESTIONS_META.map((meta) => {
    const ids = matchOf.get(meta.id) ?? [];
    const matched = ids
      .map((id) => byId.get(id))
      .filter(Boolean) as Law[];
    return { meta, matched };
  }).filter((q) => q.matched.length > 0);

  // Nothing matched anywhere in this place's code — hide the whole section.
  if (answered.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
        Everyday questions
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
        Common everyday questions, with the actual {name} rules that mention them
        shown in full. A keyword match is not a legal answer — read the text and
        verify against the official {name} code.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {answered.map(({ meta, matched }) => (
          <div
            key={meta.id}
            className="rounded-lg border border-[var(--rule)] bg-white p-4"
          >
            <h3 className="font-display text-[15.5px] font-semibold leading-snug text-ink-900">
              {meta.question}
            </h3>

            <ul className="mt-3 space-y-2.5">
              {matched.map((law) => (
                <MatchedLaw key={law.id} law={law} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
