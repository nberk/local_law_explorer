// Nearest-jurisdiction geolocation helpers.
//
// Coordinates now live on each JurisdictionSummary (`lat`/`lon`), filled in by
// pipeline/geocode_jurisdictions.py. This file is pure and runs in the browser: a
// user's precise coordinates (from the Geolocation API) never leave the device —
// we only compare them against the jurisdiction coordinate table.
import type { JurisdictionSummary } from "./topics";

export type LatLon = { lat: number; lon: number };

// Beyond this, we tell the user plainly that we don't cover their town yet. With
// full coverage this rarely fires, but a remote ZIP can still be far from any
// covered place.
export const COVERAGE_RADIUS_MILES = 50;

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance between two points, in miles. */
export function haversineMiles(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

export type NearestResult = {
  id: string; // jurisdiction id, e.g. "ca/san_francisco"
  distanceMiles: number;
  withinCoverage: boolean; // distance <= COVERAGE_RADIUS_MILES
};

/** Nearest jurisdiction of a given type to a coordinate, or null if none in that
 * type has coordinates. Entries with null coords are skipped. */
function nearestOfType(
  here: LatLon,
  jurisdictions: JurisdictionSummary[],
  type: "city" | "county",
): NearestResult | null {
  let best: NearestResult | null = null;
  for (const j of jurisdictions) {
    if (j.type !== type || j.lat == null || j.lon == null) continue;
    const d = haversineMiles(here, { lat: j.lat, lon: j.lon });
    if (!best || d < best.distanceMiles) {
      best = {
        id: j.id,
        distanceMiles: d,
        withinCoverage: d <= COVERAGE_RADIUS_MILES,
      };
    }
  }
  return best;
}

/** Both layers of local law apply to one location, so return the nearest city AND
 * the nearest county independently. Either can be null. */
export function nearestByType(
  lat: number,
  lon: number,
  jurisdictions: JurisdictionSummary[],
): { city: NearestResult | null; county: NearestResult | null } {
  const here: LatLon = { lat, lon };
  return {
    city: nearestOfType(here, jurisdictions, "city"),
    county: nearestOfType(here, jurisdictions, "county"),
  };
}

/** Human-friendly distance ("12 mi", "1,430 mi"). */
export function formatMiles(miles: number): string {
  return `${Math.round(miles).toLocaleString()} mi`;
}
