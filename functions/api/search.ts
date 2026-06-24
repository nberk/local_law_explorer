// Cloudflare Pages Function: embed ONE search query into a vector.
//
// This is the entire serverless surface of the global semantic search. It never
// touches the ordinance text — it only turns the user's question into a 384-dim
// vector (Workers AI, same bge-small model the offline index used). The browser
// downloads public/data/search/vectors.bin and does the cosine ranking itself.
//
// Requires a Workers AI binding named `AI` on the Pages project (set in the
// Cloudflare dashboard → Settings → Functions → bindings).

interface Env {
  AI: {
    run: (
      model: string,
      input: { text: string[] },
    ) => Promise<{ data?: number[][] }>;
  };
}

// bge retrieval convention: the query (not the passages) gets this instruction.
// Must match the offline index's query_embed (fastembed uses the same string).
const QUERY_INSTRUCTION =
  "Represent this sentence for searching relevant passages: ";

const MODEL = "@cf/baai/bge-small-en-v1.5";

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  let body: { q?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (!q) return json({ error: "empty query" }, 400);
  if (q.length > 512) return json({ error: "query too long" }, 400);

  try {
    const out = await env.AI.run(MODEL, { text: [QUERY_INSTRUCTION + q] });
    const vector = out?.data?.[0];
    if (!Array.isArray(vector) || vector.length === 0) {
      return json({ error: "no embedding" }, 502);
    }
    return json({ vector });
  } catch {
    // Client falls back to lexical search when this fails.
    return json({ error: "embedding failed" }, 502);
  }
};
