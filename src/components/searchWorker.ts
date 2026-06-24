// Web Worker: holds the int8 law-vector matrix and ranks it against a query
// vector. Kept off the main thread so the 44k-row dot-product never janks typing
// or scrolling. The query vector comes from the Workers AI function; the law
// vectors are the committed public/data/search/vectors.bin.

let vectors: Int8Array | null = null;
let count = 0;
let dim = 384;

type InitMsg = { type: "init"; buffer: ArrayBuffer; count: number; dim: number };
type RankMsg = { type: "rank"; reqId: number; vector: number[]; topK?: number };

self.onmessage = (e: MessageEvent<InitMsg | RankMsg>) => {
  const msg = e.data;

  if (msg.type === "init") {
    vectors = new Int8Array(msg.buffer);
    count = msg.count;
    dim = msg.dim;
    (self as unknown as Worker).postMessage({ type: "ready" });
    return;
  }

  if (msg.type === "rank") {
    const topK = msg.topK ?? 30;
    if (!vectors) {
      (self as unknown as Worker).postMessage({
        type: "ranked",
        reqId: msg.reqId,
        results: [],
      });
      return;
    }
    const q = msg.vector;
    // Dot product of (float, normalized) query against each int8 row. The 1/127
    // quantization scale is a constant, so it doesn't affect the ranking.
    const results: { i: number; score: number }[] = [];
    let minTop = -Infinity;
    for (let i = 0; i < count; i++) {
      const off = i * dim;
      let s = 0;
      for (let d = 0; d < dim; d++) s += q[d] * vectors[off + d];
      // Keep a running top-K to avoid sorting all 44k.
      if (results.length < topK) {
        results.push({ i, score: s });
        if (results.length === topK) {
          results.sort((a, b) => a.score - b.score);
          minTop = results[0].score;
        }
      } else if (s > minTop) {
        results[0] = { i, score: s };
        results.sort((a, b) => a.score - b.score);
        minTop = results[0].score;
      }
    }
    results.sort((a, b) => b.score - a.score);
    (self as unknown as Worker).postMessage({
      type: "ranked",
      reqId: msg.reqId,
      results,
    });
  }
};
