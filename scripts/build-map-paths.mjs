// Precompute US state SVG paths for the /patterns regional choropleth.
//
// The site is otherwise self-contained on Cloudflare, so rather than ship d3 +
// topojson to the client (or fetch us-atlas from a CDN at runtime), we project
// the state geometry to SVG path strings ONCE, here, and commit the result. The
// RegionalExplorer island then renders plain <path> elements colored by data —
// no map library in the client bundle.
//
// Output: public/data/us-state-paths.json  { width, height, paths: { AL: "M…" } }
// keyed by USPS code (lowercase) so it joins the regional data (also keyed by
// lowercase postal code) directly.
//
// Run: bun run scripts/build-map-paths.mjs  (or `bun run data:map`)

import { readFileSync, writeFileSync } from "node:fs";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const NAME_TO_USPS = {
  Alabama: "al", Alaska: "ak", Arizona: "az", Arkansas: "ar", California: "ca",
  Colorado: "co", Connecticut: "ct", Delaware: "de", "District of Columbia": "dc",
  Florida: "fl", Georgia: "ga", Hawaii: "hi", Idaho: "id", Illinois: "il",
  Indiana: "in", Iowa: "ia", Kansas: "ks", Kentucky: "ky", Louisiana: "la",
  Maine: "me", Maryland: "md", Massachusetts: "ma", Michigan: "mi", Minnesota: "mn",
  Mississippi: "ms", Missouri: "mo", Montana: "mt", Nebraska: "ne", Nevada: "nv",
  "New Hampshire": "nh", "New Jersey": "nj", "New Mexico": "nm", "New York": "ny",
  "North Carolina": "nc", "North Dakota": "nd", Ohio: "oh", Oklahoma: "ok",
  Oregon: "or", Pennsylvania: "pa", "Rhode Island": "ri", "South Carolina": "sc",
  "South Dakota": "sd", Tennessee: "tn", Texas: "tx", Utah: "ut", Vermont: "vt",
  Virginia: "va", Washington: "wa", "West Virginia": "wv", Wisconsin: "wi",
  Wyoming: "wy",
};

const WIDTH = 960;
const HEIGHT = 600;

const topo = JSON.parse(readFileSync("node_modules/us-atlas/states-10m.json", "utf8"));
const states = feature(topo, topo.objects.states).features;

// geoAlbersUsa defaults (scale 1280, translate [480,300]) fill a 960×600 frame
// and place the Alaska/Hawaii insets correctly.
const path = geoPath(geoAlbersUsa().scale(1280).translate([WIDTH / 2, HEIGHT / 2]));

const paths = {};
let skipped = [];
for (const f of states) {
  const code = NAME_TO_USPS[f.properties.name];
  if (!code) {
    skipped.push(f.properties.name);
    continue;
  }
  const d = path(f);
  if (d) paths[code] = d;
}

writeFileSync(
  "public/data/us-state-paths.json",
  JSON.stringify({ width: WIDTH, height: HEIGHT, paths }),
);

console.log(`wrote public/data/us-state-paths.json — ${Object.keys(paths).length} states`);
if (skipped.length) console.log("skipped (no USPS map):", skipped.join(", "));
