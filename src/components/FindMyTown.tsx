import { useEffect, useMemo, useRef, useState } from "react";
import { type JurisdictionSummary } from "../lib/topics";
import {
  nearestPilot,
  formatMiles,
  type NearestResult,
} from "../lib/geo";
import TopicBar from "./TopicBar";

// Lazy-loaded ZIP → [lat, lon] table (US only). Only fetched when a user
// actually types a ZIP, so the homepage never pays for it up front.
let zipTablePromise: Promise<Record<string, [number, number]>> | null = null;
function loadZipTable() {
  if (!zipTablePromise) {
    zipTablePromise = fetch("/data/geo/zip-centroids.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return zipTablePromise;
}

type Source = "connection" | "device" | "zip" | "city";

type Found = NearestResult & { source: Source };

function ResultCard({
  found,
  jur,
}: {
  found: Found;
  jur: JurisdictionSummary;
}) {
  const sourceLabel: Record<Source, string> = {
    connection: "based on your internet connection",
    device: "based on your device location",
    zip: "based on the ZIP you entered",
    city: "you searched for this place",
  };
  return (
    <div className="mt-5 max-w-md">
      {!found.withinCoverage && (
        <p className="mb-2 text-[12.5px] leading-relaxed text-ink-600">
          We don’t have your town in this pilot yet. The closest place we do
          cover is{" "}
          <strong className="text-ink-800">{jur.name}</strong>, about{" "}
          <strong className="text-ink-800">
            {formatMiles(found.distanceMiles)}
          </strong>{" "}
          away — its rules won’t be your town’s rules, but they’re a start.
        </p>
      )}
      <a
        href={`/${jur.id}`}
        className="group block rounded-lg border border-[var(--rule)] bg-white p-5 transition hover:border-ink-300 hover:shadow-sm"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-[18px] font-semibold text-ink-900 transition group-hover:text-accent-700">
            {jur.name}
          </h3>
          <span className="font-mono text-[12px] text-ink-400">
            {jur.state}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-500">
          <span>{jur.stateName}</span>
          <span className="text-ink-300">·</span>
          <span className="font-mono text-ink-600">
            {formatMiles(found.distanceMiles)} away
          </span>
        </div>
        <div className="mt-3">
          <TopicBar counts={jur.counts} />
        </div>
        {jur.portraitTeaser && (
          <div className="mt-2 text-[12px] italic text-ink-600">
            {jur.portraitTeaser.headline}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-500">
          <span>
            {found.withinCoverage ? "Nearest pilot" : "Closest pilot"} ·{" "}
            {sourceLabel[found.source]}
          </span>
          <span className="text-ink-400">open →</span>
        </div>
      </a>
    </div>
  );
}

export default function FindMyTown({
  jurisdictions,
}: {
  jurisdictions: JurisdictionSummary[];
}) {
  const byId = useMemo(
    () => new Map(jurisdictions.map((j) => [j.id, j])),
    [jurisdictions],
  );

  const [found, setFound] = useState<Found | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const triedConnection = useRef(false);

  const resolve = (lat: number, lon: number, source: Source) => {
    const near = nearestPilot(lat, lon);
    setFound({ ...near, source });
    setStatus("");
  };

  // Best-effort zero-click guess from the IP-geo function. Silent on failure
  // (e.g. local `astro dev`, which has no Pages Functions) — the buttons below
  // always work regardless.
  useEffect(() => {
    if (triedConnection.current) return;
    triedConnection.current = true;
    let alive = true;
    fetch("/api/where")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d || typeof d.lat !== "number") return;
        // Only use it as a soft starting point if the user hasn't acted yet.
        setFound((cur) =>
          cur ? cur : { ...nearestPilot(d.lat, d.lon), source: "connection" },
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const useDevice = () => {
    if (!("geolocation" in navigator)) {
      setStatus("Your browser can’t share a precise location. Try a ZIP below.");
      return;
    }
    setBusy(true);
    setStatus("Asking your browser for your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        resolve(pos.coords.latitude, pos.coords.longitude, "device");
      },
      () => {
        setBusy(false);
        setStatus(
          "Couldn’t get your location (permission denied or unavailable). Try a ZIP below.",
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = manual.trim();
    if (!raw) return;
    setStatus("");

    // 5-digit ZIP → centroid lookup.
    const zip = raw.match(/\b(\d{5})\b/)?.[1];
    if (zip) {
      setBusy(true);
      setStatus("Looking up that ZIP…");
      const table = await loadZipTable();
      setBusy(false);
      const pt = table[zip];
      if (pt) {
        resolve(pt[0], pt[1], "zip");
      } else {
        setStatus(`We couldn’t place ZIP ${zip}. Try a nearby ZIP.`);
      }
      return;
    }

    // Otherwise, match a pilot city/state by name.
    const s = raw.toLowerCase();
    const hit = jurisdictions.find(
      (j) =>
        j.name.toLowerCase() === s ||
        j.name.toLowerCase().includes(s) ||
        j.stateName.toLowerCase() === s,
    );
    if (hit) {
      setFound({
        id: hit.id,
        distanceMiles: 0,
        withinCoverage: true,
        source: "city",
      });
    } else {
      setStatus(
        "We can only place a 5-digit ZIP or one of the pilot cities by name. Try a ZIP.",
      );
    }
  };

  const jur = found ? byId.get(found.id) : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={useDevice}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2 text-[14px] font-medium text-white transition hover:bg-ink-700 disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="10" r="3" />
            <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
          </svg>
          Use my location
        </button>

        <span className="text-[13px] text-ink-400">or</span>

        <form onSubmit={submitManual} className="flex items-center gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="ZIP code or city…"
            inputMode="numeric"
            className="w-40 rounded-md border border-ink-200 bg-white px-3 py-2 text-[14px] placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md border border-ink-200 px-3 py-2 text-[14px] text-ink-700 transition hover:border-ink-300 disabled:opacity-50"
          >
            Go
          </button>
        </form>
      </div>

      {status && (
        <p className="mt-3 text-[12.5px] text-ink-500" role="status">
          {status}
        </p>
      )}

      {found && jur && <ResultCard found={found} jur={jur} />}

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400 max-w-md">
        Your precise location never leaves your browser — we only compare it
        against the {jurisdictions.length} pilot cities to find the closest one.
      </p>
    </div>
  );
}
