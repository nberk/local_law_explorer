// Nearest-pilot geolocation helpers.
//
// LOCUS has no coordinates, so the 19 pilot locations are hand-maintained here
// (approximate city centers). This is a deliberate exception to the "all data
// comes from the pipeline" rule — see docs/global-semantic-search.md (Feature 2).
//
// Everything in this file is pure and runs in the browser: a user's precise
// coordinates (from the Geolocation API) never leave the device — we only
// compare them against these 19 fixed points.

export type LatLon = { lat: number; lon: number };

// Keyed by jurisdiction id (matches index.json / the `/${id}` route).
export const JURISDICTION_COORDS: Record<string, [number, number]> = {
  "il/chicago": [41.8781, -87.6298],
  "ca/san_diego": [32.7157, -117.1611],
  "ca/san_francisco": [37.7749, -122.4194],
  "mi/detroit": [42.3314, -83.0458],
  "wa/seattle": [47.6062, -122.3321],
  "or/portland": [45.5152, -122.6784],
  "md/baltimore": [39.2904, -76.6122],
  "ga/atlanta": [33.749, -84.388],
  "la/new_orleans": [29.9511, -90.0715],
  "hi/honolulu": [21.3069, -157.8583],
  "tx/houston": [29.7604, -95.3698],
  "ak/utqiagvik": [71.2906, -156.7886],
  "nm/cloudcroft": [32.9553, -105.7414],
  "ny/lake_placid_village": [44.2795, -73.9799],
  "pa/state_college_borough": [40.7934, -77.86],
  "id/grangeville": [45.9265, -116.1224],
  "ia/steamboatrock": [42.403, -93.064],
  "mt/terry": [46.7919, -105.3108],
  "wi/marshfield": [44.6688, -90.1718],
};

// Beyond this, we tell the user plainly that we don't cover their town yet.
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

/** Find the nearest pilot jurisdiction to a coordinate. */
export function nearestPilot(lat: number, lon: number): NearestResult {
  const here: LatLon = { lat, lon };
  let best: NearestResult | null = null;
  for (const [id, [jlat, jlon]] of Object.entries(JURISDICTION_COORDS)) {
    const d = haversineMiles(here, { lat: jlat, lon: jlon });
    if (!best || d < best.distanceMiles) {
      best = { id, distanceMiles: d, withinCoverage: d <= COVERAGE_RADIUS_MILES };
    }
  }
  // JURISDICTION_COORDS is non-empty, so best is always set.
  return best!;
}

/** Human-friendly distance ("12 mi", "1,430 mi"). */
export function formatMiles(miles: number): string {
  return `${Math.round(miles).toLocaleString()} mi`;
}
