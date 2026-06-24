import { useEffect, useRef, useState } from "react";
import {
  TOPIC_BADGE,
  SUGGESTED_QUESTIONS,
} from "../lib/topics";
import {
  lexicalRank,
  type SearchMeta,
  type SearchManifest,
  type RankedResult,
} from "../lib/search";

type Mode = "idle" | "lexical" | "semantic";
type WorkerRanked = {
  type: "ranked" | "ready";
  reqId?: number;
  results?: { i: number; score: number }[];
};

export default function GlobalSearch({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<RankedResult[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [semanticDown, setSemanticDown] = useState(false);
  const [indexMissing, setIndexMissing] = useState(false);

  const metaRef = useRef<SearchMeta[] | null>(null);
  const manifestRef = useRef<SearchManifest | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const vectorsReadyRef = useRef<Promise<void> | null>(null);
  const reqCounter = useRef(0);
  const pendingReq = useRef(0);

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  // Load the metadata rows (needed for lexical ranking + rendering). ~13 MB,
  // once, cached by the browser thereafter.
  async function ensureMeta() {
    if (metaRef.current) return;
    setLoadingIndex(true);
    try {
      const [manifest, meta] = await Promise.all([
        fetch("/data/search/manifest.json").then((r) => {
          if (!r.ok) throw new Error("index missing");
          return r.json();
        }),
        fetch("/data/search/meta.json").then((r) => {
          if (!r.ok) throw new Error("index missing");
          return r.json();
        }),
      ]);
      manifestRef.current = manifest;
      metaRef.current = meta;
    } finally {
      setLoadingIndex(false);
    }
  }

  // Load the int8 vectors into the worker (~17 MB). Lazily, after meta, so the
  // instant lexical results don't wait on it.
  function ensureVectors(): Promise<void> {
    if (vectorsReadyRef.current) return vectorsReadyRef.current;
    vectorsReadyRef.current = (async () => {
      const manifest = manifestRef.current!;
      const buffer = await fetch("/data/search/vectors.bin").then((r) =>
        r.arrayBuffer(),
      );
      const worker = new Worker(
        new URL("./searchWorker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (e: MessageEvent<WorkerRanked>) => {
        const msg = e.data;
        if (msg.type !== "ranked" || msg.reqId !== pendingReq.current) return;
        const meta = metaRef.current!;
        setResults(
          (msg.results ?? []).map((r) => ({ ...meta[r.i], score: r.score })),
        );
        setMode("semantic");
      };
      worker.postMessage(
        { type: "init", buffer, count: manifest.count, dim: manifest.dim },
        [buffer],
      );
      workerRef.current = worker;
    })();
    return vectorsReadyRef.current;
  }

  async function runSearch(query: string) {
    const text = query.trim();
    if (!text) return;
    setSubmitted(text);
    setSemanticDown(false);

    // 1. Instant lexical pass (after the one-time meta download). If the index
    // hasn't been built/deployed yet, degrade to a clear message rather than
    // erroring (the data files are committed separately; see data:search).
    try {
      await ensureMeta();
    } catch {
      setIndexMissing(true);
      setMode("idle");
      return;
    }
    setResults(lexicalRank(metaRef.current!, text, 30));
    setMode("lexical");

    // 2. Semantic re-rank: embed the query (server) + cosine (worker).
    try {
      await ensureVectors();
      const resp = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: text }),
      });
      if (!resp.ok) throw new Error("embed unavailable");
      const { vector } = await resp.json();
      if (!Array.isArray(vector)) throw new Error("no vector");
      const reqId = ++reqCounter.current;
      pendingReq.current = reqId;
      workerRef.current!.postMessage({ type: "rank", reqId, vector, topK: 30 });
    } catch {
      // Keep the lexical results; just note semantic isn't available.
      setSemanticDown(true);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(q);
  }

  // Run an initial query once on mount — from the prop or the ?q= URL param
  // (static build can't read the param server-side, so we read it here).
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const urlQ =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("q")
        : null;
    const start = (initialQuery || urlQ || "").trim();
    if (start) {
      setQ(start);
      runSearch(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const followups = SUGGESTED_QUESTIONS.filter(
    (s) => s.toLowerCase() !== submitted.toLowerCase(),
  ).slice(0, 6);

  return (
    <div>
      <form onSubmit={onSubmit} className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about a local law… e.g. “can I keep chickens?”"
          className="w-full rounded-lg border border-ink-200 bg-white px-4 py-3 pr-24 text-[15px] placeholder:text-ink-400 focus:border-accent-500 focus:outline-none"
          autoComplete="off"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1.5 rounded-md bg-ink-900 px-4 py-1.5 text-[14px] font-medium text-white transition hover:bg-ink-700"
        >
          Search
        </button>
      </form>

      {/* Empty state: suggested questions */}
      {mode === "idle" && (
        <div className="mt-4">
          <p className="text-[12px] uppercase tracking-wider text-ink-400">
            Try asking
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setQ(s);
                  runSearch(s);
                }}
                className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-700 transition hover:border-ink-300 hover:text-ink-900"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {loadingIndex && (
        <p className="mt-4 text-[13px] text-ink-500">
          Loading the search index (one-time, then it’s instant)…
        </p>
      )}

      {indexMissing && (
        <div className="mt-4 rounded-lg border border-ink-100 bg-ink-50 px-4 py-3 text-[13px] leading-relaxed text-ink-600">
          Search isn’t available yet — the index is still being built. In the
          meantime you can{" "}
          <a href="/" className="underline hover:text-ink-900">
            browse by town
          </a>
          .
        </div>
      )}

      {/* Results */}
      {submitted && mode !== "idle" && (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-ink-500">
              {results.length > 0 ? (
                <>
                  Ordinances most related to{" "}
                  <span className="text-ink-800">“{submitted}”</span> across all
                  pilots
                </>
              ) : (
                <>
                  No matches for{" "}
                  <span className="text-ink-800">“{submitted}”</span> yet.
                </>
              )}
            </p>
            <span className="shrink-0 font-mono text-[11px] text-ink-400">
              {mode === "semantic" ? "ranked by meaning" : "keyword matches"}
            </span>
          </div>

          {semanticDown && (
            <p className="mt-1 text-[11.5px] text-ink-400">
              Meaning-ranking is unavailable right now — showing keyword matches.
            </p>
          )}

          <ul className="mt-3 space-y-2">
            {results.map((r) => (
              <li key={`${r.jId}-${r.id}`}>
                <a
                  href={`/${r.jId}?law=${encodeURIComponent(r.id)}`}
                  className="group block rounded-lg border border-[var(--rule)] bg-white p-4 transition hover:border-ink-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-[15.5px] font-semibold text-ink-900 transition group-hover:text-accent-700">
                      {r.title || "Untitled provision"}
                    </h3>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium ${TOPIC_BADGE[r.topic] ?? TOPIC_BADGE.Other}`}
                    >
                      {r.topic}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-500">
                    <span className="text-ink-700">{r.name}</span>
                    <span className="text-ink-300">·</span>
                    <span className="font-mono">{r.state}</span>
                    {r.section && (
                      <>
                        <span className="text-ink-300">·</span>
                        <span className="font-mono text-ink-400">
                          {r.section}
                        </span>
                      </>
                    )}
                  </div>
                  {r.snippet && (
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-600">
                      {r.snippet}…
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>

          {/* Honesty caveat — these are real laws, not an answer */}
          {results.length > 0 && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-400">
              These are the ordinances most related to your question — not a
              yes/no answer. The ranking is a machine estimate; the text shown is
              the law itself, OCR’d from source. Always confirm against the
              official code.
            </p>
          )}

          {/* Suggested follow-ups */}
          {followups.length > 0 && (
            <div className="mt-4">
              <p className="text-[12px] uppercase tracking-wider text-ink-400">
                Ask something else
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {followups.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setQ(s);
                      runSearch(s);
                    }}
                    className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-700 transition hover:border-ink-300 hover:text-ink-900"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
