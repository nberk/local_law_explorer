// Where a place sits on the national 0–100 scale for one dimension. Unlike a bare
// dot, it fills from the low end to the value and marks the "typical town" (50th
// percentile), so the reader sees position *relative to everyone else*, not an
// abstract point. Shared by the Place Portrait and the rankings page.
export default function NationalPositionBar({
  pct,
  showValue = true,
}: {
  pct: number;
  showValue?: boolean;
}) {
  const x = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 flex-1 rounded-full bg-ink-100">
        {/* fill from the low end to this place's position */}
        <div
          className="absolute left-0 top-0 h-1.5 rounded-full bg-accent-300"
          style={{ width: `${x}%` }}
        />
        {/* "typical town" reference mark at the 50th percentile */}
        <div
          className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-ink-400/70"
          style={{ left: "50%" }}
          title="Typical U.S. town (50th percentile)"
        />
        {/* this place's marker */}
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-600 ring-2 ring-white"
          style={{ left: `${x}%` }}
        />
      </div>
      {showValue && (
        <span className="w-6 shrink-0 text-right font-mono text-[10.5px] text-ink-400">
          {Math.round(x)}
        </span>
      )}
    </div>
  );
}
