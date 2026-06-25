import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { loadIndexClient } from "../lib/clientData";
import { type JurisdictionSummary } from "../lib/topics";

// A national map: every covered jurisdiction is a dot at its lat/lon. It uses
// ONLY index.json (already memoized via loadIndexClient) and never touches the
// multi-MB per-jurisdiction
// R2 files; the heavy fetch happens on the place page after a dot is clicked.
//
// Leaflet is imported dynamically inside the effect (not at module top level) so
// it never runs during Astro's server render, where `window` is undefined.

// All dots share one color. We deliberately do NOT color by topic: the topic
// labels are noisy machine estimates and a rainbow map implied a precision the
// data doesn't have. Dot SIZE (law count) is the only encoded signal; the
// city-filled / county-ring distinction is shape, not color.
const DOT_COLOR = "#3d63b3"; // accent-500

// Total law count → radius in px. sqrt compresses an ~50…8,200 range so a tiny
// town stays visible and a huge one doesn't swallow the map.
function radius(total: number): number {
  const t = total > 0 ? total : 1;
  return Math.max(3, Math.min(15, 2 + Math.sqrt(t) / 9));
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

function tooltipHtml(j: JurisdictionSummary): string {
  const total = (j.counts.total ?? 0).toLocaleString();
  const kind = j.type === "county" ? "county" : "city";
  const rough = j.portraitTeaser?.lowConfidence
    ? `<div style="color:#a8a8a0;margin-top:2px">few laws — rough estimate</div>`
    : "";
  return (
    `<div style="font-weight:600;color:#27272a">${esc(j.name)}` +
    `<span style="color:#a8a8a0;font-weight:400"> · ${esc(j.state)}</span></div>` +
    `<div style="color:#6b6b64;margin-top:3px">${total} laws on record · ${kind}</div>` +
    rough +
    `<div style="color:#9a9a92;margin-top:3px;font-size:11px">click to open →</div>`
  );
}

type Status = "loading" | "ready" | "error";

export default function JurisdictionMap() {
  const elRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        const { jurisdictions } = await loadIndexClient();
        if (cancelled || !elRef.current) return;

        const pts = jurisdictions.filter(
          (j) => j.lat != null && j.lon != null,
        );

        // preferCanvas → all circleMarkers draw on one <canvas>, so 2,287 dots
        // pan smoothly without 2,287 DOM nodes.
        map = L.map(elRef.current, {
          preferCanvas: true,
          minZoom: 3,
          maxZoom: 12,
          worldCopyJump: false,
          scrollWheelZoom: false, // avoid hijacking page scroll; box/zoom buttons still work
        });
        // Frame the lower-48 to the container instead of a fixed zoom, so the map
        // fills the (wide, short) box without a dead band of ocean up top. AK/HI
        // dots are still plotted and reachable by panning/zooming out.
        map.fitBounds(
          [
            [24.5, -124.7],
            [49.4, -66.9],
          ],
          { padding: [12, 12] },
        );

        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          {
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 19,
          },
        ).addTo(map);

        for (const j of pts) {
          const r = radius(j.counts.total ?? 0);
          const isCounty = j.type === "county";
          const m = L.circleMarker([j.lat as number, j.lon as number], {
            radius: r,
            color: DOT_COLOR,
            weight: isCounty ? 1.6 : 0.6,
            // Counties = hollow rings (an area, not a point); cities = filled.
            fillColor: DOT_COLOR,
            fillOpacity: isCounty ? 0 : 0.62,
            opacity: isCounty ? 0.95 : 0.85,
          });
          m.bindTooltip(tooltipHtml(j), {
            direction: "top",
            offset: [0, -r],
            opacity: 1,
            className: "jmap-tip",
          });
          m.on("click", () => {
            window.location.href = `/${j.id}`;
          });
          m.addTo(map);
        }

        if (cancelled) {
          map.remove();
          return;
        }
        setShown(pts.length);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, []);

  return (
    <div>
      <div className="relative">
        <div
          ref={elRef}
          role="application"
          aria-label="Map of covered US cities and counties"
          className="h-[68vh] min-h-[460px] w-full overflow-hidden rounded-xl border border-ink-200 bg-ink-50"
        />
        {status !== "ready" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="text-[14px] text-ink-400">
              {status === "error"
                ? "Could not load the map."
                : "Loading map…"}
            </p>
          </div>
        )}
      </div>

      {/* Legend. One color for every dot; size and shape carry the meaning. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: DOT_COLOR, opacity: 0.62 }}
          />
          City (filled)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full border-[1.5px]"
            style={{ borderColor: DOT_COLOR }}
          />
          County (ring)
        </span>
        <span className="inline-flex items-center gap-1.5 text-ink-500">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: DOT_COLOR, opacity: 0.62 }}
          />
          <span
            className="inline-block h-3.5 w-3.5 rounded-full"
            style={{ background: DOT_COLOR, opacity: 0.62 }}
          />
          Bigger = more laws on record
        </span>
        {status === "ready" && (
          <span className="text-ink-400">{shown.toLocaleString()} places shown.</span>
        )}
      </div>
    </div>
  );
}
