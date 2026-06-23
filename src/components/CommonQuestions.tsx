import {
  QUESTIONS_META,
  TOPIC_BADGE,
  sourceSearchUrl,
  type QuestionMatch,
  type Law,
} from "../lib/topics";

// Module 2 — everyday "Can I ...?" questions answered by surfacing the rule(s)
// that mention the topic. A keyword match is NOT a yes/no answer, so the framing
// routes the reader to the actual text and never asserts the legal outcome.
export default function CommonQuestions({
  questions,
  laws,
  name,
  stateName,
}: {
  questions: QuestionMatch[];
  laws: Law[];
  name: string;
  stateName: string;
}) {
  const byId = new Map(laws.map((l) => [l.id, l]));
  const matchOf = new Map(questions.map((q) => [q.id, q.matches]));

  return (
    <section className="mt-12">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-ink-500">
        Common questions
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
        Everyday questions, matched to the rules that mention them. A keyword
        match is not a legal answer — open the rule and verify against the
        official {name} code.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {QUESTIONS_META.map((meta) => {
          const ids = matchOf.get(meta.id) ?? [];
          const matched = ids.map((id) => byId.get(id)).filter(Boolean) as Law[];
          const empty = matched.length === 0;
          return (
            <div
              key={meta.id}
              className="rounded-lg border border-[var(--rule)] bg-white p-4"
            >
              <h3 className="font-display text-[15.5px] font-semibold leading-snug text-ink-900">
                {meta.question}
              </h3>

              {empty ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-400">
                  No specific rule found in {name}’s code. This may be
                  unregulated locally, or set by county or state law not shown
                  here.
                </p>
              ) : (
                <ul className="mt-2.5 space-y-2.5">
                  {matched.map((law) => (
                    <li key={law.id}>
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
                      <a
                        href={sourceSearchUrl(name, stateName, law)}
                        target="_blank"
                        rel="noopener"
                        className="mt-0.5 block text-[13.5px] font-medium leading-snug text-ink-800 transition hover:text-accent-700"
                      >
                        {law.title}
                      </a>
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-500">
                        {law.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
