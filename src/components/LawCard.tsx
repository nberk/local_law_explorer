import { useState } from "react";
import { TOPIC_BADGE, OPACITY_FLAG, sourceSearchUrl, type Law } from "../lib/topics";

const SNIPPET = 360;

// A single ordinance card: topic badge, section id, optional density flag, the
// cleaned title, a (truncated, expandable) snippet, and a best-effort link to
// the official code. Shared by the law browser and the Notable Rules module.
export default function LawCard({
  law,
  jurisName,
  stateName,
  tag,
  highlight = false,
}: {
  law: Law;
  jurisName: string;
  stateName: string;
  tag?: string; // optional category chip (e.g. the Notable Rules reason)
  highlight?: boolean; // emphasize when arrived at via a deep link from search
}) {
  // Deep-linked laws open expanded so the visitor lands on the full text.
  const [open, setOpen] = useState(highlight);
  const long = law.content.length > SNIPPET;
  const text = open || !long ? law.content : law.content.slice(0, SNIPPET) + "…";
  const opaque = law.scores.opacity !== null && law.scores.opacity >= OPACITY_FLAG;

  return (
    <div
      className={
        "rounded-lg border bg-white p-4 " +
        (highlight
          ? "border-accent-500 ring-2 ring-accent-200"
          : "border-[var(--rule)]")
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            "rounded px-1.5 py-0.5 text-[10.5px] font-medium " +
            (TOPIC_BADGE[law.topic] || TOPIC_BADGE.Other)
          }
        >
          {law.topic}
        </span>
        {tag && (
          <span className="rounded border border-accent-100 bg-accent-50 px-1.5 py-0.5 text-[10.5px] font-medium text-accent-700">
            {tag}
          </span>
        )}
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
