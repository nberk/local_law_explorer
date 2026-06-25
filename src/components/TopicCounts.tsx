import { TOPICS, TOPIC_COLOR } from "../lib/topics";

// Numeric topic summary for a jurisdiction: the total ordinance count plus a
// per-topic breakdown. Used on the "find my town" result chips where exact
// numbers read better than the proportional TopicBar. `counts` is the manifest
// counts object (one key per topic plus `total`). Topics are noisy model labels
// and `Other` is the classifier's catch-all (see topics.ts) — this is a rough
// mix, not an official taxonomy; the page-level machine-estimate disclaimer
// covers it.
export default function TopicCounts({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const total = counts.total || 0;
  return (
    <div>
      <div className="font-mono text-[15px] text-ink-900">
        {total.toLocaleString()}{" "}
        <span className="text-[12px] text-ink-500">ordinances</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-600">
        {TOPICS.map((t) => {
          const n = counts[t] || 0;
          if (n <= 0) return null;
          return (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: TOPIC_COLOR[t] }}
                aria-hidden="true"
              />
              {t}{" "}
              <span className="font-mono text-ink-500">
                {n.toLocaleString()}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
