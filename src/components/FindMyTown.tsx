import { useEffect, useMemo, useRef, useState } from "react";
import { type JurisdictionSummary } from "../lib/topics";
import { loadIndexClient } from "../lib/clientData";
import { nearestByType, formatMiles, type NearestResult } from "../lib/geo";
import TopicBar from "./TopicBar";

// Lazy-loaded ZIP → [lat, lon, countyId?] table (US only). Only fetched when a
// user actually types a ZIP. The optional third element is the id of the county
// that contains the ZIP (when we cover it), so ZIP lookups return the EXACT
// county rather than the nearest centroid.
type ZipEntry = [number, number, string?];
let zipTablePromise: Promise<Record<string, ZipEntry>> | null = null;
function loadZipTable() {
  if (!zipTablePromise) {
    zipTablePromise = fetch("/data/geo/zip-centroids.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return zipTablePromise;
}

type Source = "connection" | "device" | "zip" | "city";

type Result = {
  city: NearestResult | null;
  county: NearestResult | null;
  countyExact: boolean; // county came from exact ZIP containment, not nearest centroid
  source: Source;
};

const SOURCE_LABEL: Record<Source, string> = {
  connection: "based on your internet connection",
  device: "based on your device location",
  zip: "based on the ZIP you entered",
  city: "based on the place you searched",
};

function ResultCard({
  jur,
  near,
  kind,
  exact,
  source,
}: {
  jur: JurisdictionSummary;
  near: NearestResult;
  kind: "city" | "county";
  exact: boolean;
  source: Source;
}) {
  const heading = kind === "city" ? "Your city" : "Your county";
  // The county card never claims exact containment unless it came from a ZIP
  // match: a nearest-centroid county is only an approximation.
  const approxCounty = kind === "county" && !exact;
  const farCity = kind === "city" && !near.withinCoverage;

  return (
    <div>
      <div className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-500 font-medium">
        {heading}
      </div>
      {farCity && (
        <p className="mb-2 text-[12.5px] leading-relaxed text-ink-600">
          We don’t have your town in the dataset yet. The closest city we cover is{" "}
          <strong className="text-ink-800">{jur.name}</strong>, about{" "}
          <strong className="text-ink-800">{formatMiles(near.distanceMiles)}</strong>{" "}
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
          <span className="font-mono text-[12px] text-ink-400">{jur.state}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink-500">
          <span>{jur.stateName}</span>
          {!exact && near.distanceMiles > 0 && (
            <>
              <span className="text-ink-300">·</span>
              <span className="font-mono text-ink-600">
                {formatMiles(near.distanceMiles)} away
              </span>
            </>
          )}
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
            {approxCounty
              ? "Nearest county we cover"
              : kind === "county"
                ? "Your county"
                : near.withinCoverage
                  ? "Your city"
                  : "Closest city"}{" "}
            · {SOURCE_LABEL[source]}
          </span>
          <span className="text-ink-400">open →</span>
        </div>
      </a>
      {approxCounty && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-400">
          Approximate — matched to the nearest county center, not the exact county
          you’re inside.
        </p>
      )}
    </div>
  );
}

export default function FindMyTown() {
  const [jurisdictions, setJurisdictions] = useState<
    JurisdictionSummary[] | null
  >(null);
  const byId = useMemo(
    () => new Map((jurisdictions ?? []).map((j) => [j.id, j])),
    [jurisdictions],
  );

  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const triedConnection = useRef(false);

  useEffect(() => {
    let alive = true;
    loadIndexClient()
      .then((d) => alive && setJurisdictions(d.jurisdictions))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const resolveCoords = (
    lat: number,
    lon: number,
    source: Source,
    exactCountyId?: string,
  ) => {
    if (!jurisdictions) return;
    const near = nearestByType(lat, lon, jurisdictions);
    let county = near.county;
    let countyExact = false;
    if (exactCountyId && byId.has(exactCountyId)) {
      county = { id: exactCountyId, distanceMiles: 0, withinCoverage: true };
      countyExact = true;
    }
    setResult({ city: near.city, county, countyExact, source });
    setStatus("");
  };

  // Best-effort zero-click guess from the IP-geo function. Silent on failure
  // (e.g. local `astro dev`, which has no Pages Functions).
  useEffect(() => {
    if (triedConnection.current || !jurisdictions) return;
    triedConnection.current = true;
    let alive = true;
    fetch("/api/where")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d || typeof d.lat !== "number") return;
        setResult((cur) => {
          if (cur) return cur; // user already acted
          const near = nearestByType(d.lat, d.lon, jurisdictions);
          return {
            city: near.city,
            county: near.county,
            countyExact: false,
            source: "connection",
          };
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [jurisdictions]);

  const useDevice = () => {
    if (!("geolocation" in navigator)) {
      setStatus("Your browser can’t share a precise location. Try a ZIP below.");
      return;
    }
    // Geolocation only works over a secure origin (https or localhost). Over
    // plain http (e.g. a LAN IP) the call silently never resolves, so bail with
    // a clear message instead of spinning forever.
    if (!window.isSecureContext) {
      setStatus(
        "Location sharing needs a secure (https) connection. Try a ZIP below.",
      );
      return;
    }
    setBusy(true);
    setStatus("Asking your browser for your location…");

    // Some browser/OS combinations (e.g. Chrome on macOS with system Location
    // Services off) never fire EITHER callback and ignore the spec `timeout`,
    // which leaves the spinner stuck. A wall-clock backstop guarantees we always
    // exit the busy state; `settled` makes whichever fires first win and ignores
    // any late stragglers.
    let settled = false;
    let guard: ReturnType<typeof setTimeout>;
    const finish = (after?: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      setBusy(false);
      after?.();
    };
    guard = setTimeout(() => {
      finish(() =>
        setStatus(
          "Still waiting on your browser’s location — it may be blocked at the system level. Try a ZIP below.",
        ),
      );
    }, 12000);

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        finish(() =>
          resolveCoords(pos.coords.latitude, pos.coords.longitude, "device"),
        ),
      () =>
        finish(() =>
          setStatus(
            "Couldn’t get your location (permission denied or unavailable). Try a ZIP below.",
          ),
        ),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = manual.trim();
    if (!raw || !jurisdictions) return;
    setStatus("");

    // 5-digit ZIP → centroid (+ exact county) lookup.
    const zip = raw.match(/\b(\d{5})\b/)?.[1];
    if (zip) {
      setBusy(true);
      setStatus("Looking up that ZIP…");
      const table = await loadZipTable();
      setBusy(false);
      const pt = table[zip];
      if (pt) {
        resolveCoords(pt[0], pt[1], "zip", pt[2]);
      } else {
        setStatus(`We couldn’t place ZIP ${zip}. Try a nearby ZIP.`);
      }
      return;
    }

    // Otherwise, match a covered place by name, then resolve both layers from its
    // coordinates.
    const s = raw.toLowerCase();
    const hit =
      jurisdictions.find((j) => j.name.toLowerCase() === s) ??
      jurisdictions.find((j) => j.name.toLowerCase().includes(s));
    if (hit && hit.lat != null && hit.lon != null) {
      resolveCoords(hit.lat, hit.lon, "city");
    } else if (hit) {
      // Matched a place with no coordinates — show just that one.
      setResult({
        city: hit.type === "city" ? { id: hit.id, distanceMiles: 0, withinCoverage: true } : null,
        county: hit.type === "county" ? { id: hit.id, distanceMiles: 0, withinCoverage: true } : null,
        countyExact: hit.type === "county",
        source: "city",
      });
    } else {
      setStatus(
        "We couldn’t find that place. Try a 5-digit ZIP or a city or county name.",
      );
    }
  };

  const cityJur = result?.city ? byId.get(result.city.id) : undefined;
  const countyJur = result?.county ? byId.get(result.county.id) : undefined;
  const hasAny = result && (cityJur || countyJur);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={useDevice}
          disabled={busy || !jurisdictions}
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
            placeholder="ZIP code, city, or county…"
            className="w-52 rounded-md border border-ink-200 bg-white px-3 py-2 text-[14px] placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !jurisdictions}
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

      {hasAny && (
        <div className="mt-5 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          {result!.city && cityJur && (
            <ResultCard
              jur={cityJur}
              near={result!.city}
              kind="city"
              exact={false}
              source={result!.source}
            />
          )}
          {result!.county && countyJur && (
            <ResultCard
              jur={countyJur}
              near={result!.county}
              kind="county"
              exact={result!.countyExact}
              source={result!.source}
            />
          )}
        </div>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-400 max-w-md">
        Both your city and your county make local law, so we show the nearest of
        each. Your precise location never leaves your browser — we only compare it
        against the jurisdictions we cover.
      </p>
    </div>
  );
}
