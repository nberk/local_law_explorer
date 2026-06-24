// Cloudflare Pages Function: coarse IP-based location for the zero-click
// "Find my town" guess. Reads Cloudflare's edge geo off the request — no
// third-party geocoder, no stored data. Coarse and VPN-fallible by nature, so
// the client treats it only as a soft starting point (the precise-location
// button and manual ZIP entry override it).

interface CfGeo {
  latitude?: string;
  longitude?: string;
  city?: string;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      // Vary by IP-ish; short cache is fine. Edge already knows the geo.
      "cache-control": "no-store",
    },
  });
}

export const onRequestGet = async (context: {
  request: Request & { cf?: CfGeo };
}): Promise<Response> => {
  const cf = context.request.cf;
  const lat = cf?.latitude ? Number.parseFloat(cf.latitude) : NaN;
  const lon = cf?.longitude ? Number.parseFloat(cf.longitude) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json({ error: "no geo" }, 204);
  }
  return json({ lat, lon, city: cf?.city ?? null });
};
