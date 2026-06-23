import { TOPICS, TOPIC_COLOR } from "../lib/topics";

// Stacked composition bar showing a jurisdiction's topic mix. Shared by the
// homepage picker and the Place Portrait. `counts` is the manifest counts object
// (keys per topic plus `total`).
export default function TopicBar({
  counts,
  className = "h-1.5",
}: {
  counts: Record<string, number>;
  className?: string;
}) {
  const total = counts.total || 1;
  return (
    <div
      className={`flex ${className} w-full overflow-hidden rounded-full bg-ink-100`}
    >
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
