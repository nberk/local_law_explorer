// Deterministic readability facts computed from the raw ordinance text. These
// are plain arithmetic on the text itself (not model output), so showing them
// explains *why* a law reads as dense. Paired with the opacity score (a model
// estimate) in the spectrum explorer.

export interface Readability {
  words: number;
  sentences: number;
  avgSentenceLen: number; // words per sentence
  longestSentence: number; // words in the longest sentence
  grade: number; // Flesch-Kincaid grade level
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 0;
  if (w.endsWith("e") && n > 1) n -= 1; // crude silent-e correction
  return Math.max(1, n);
}

export function readability(text: string): Readability {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentenceParts = clean
    .split(/[.!?;:]+(?=\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sentences = Math.max(1, sentenceParts.length);
  const wordList = clean.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  const words = Math.max(1, wordList.length);
  const syllables = wordList.reduce((a, w) => a + countSyllables(w), 0);
  const longestSentence = sentenceParts.reduce(
    (m, s) => Math.max(m, s.split(/\s+/).filter(Boolean).length),
    0,
  );
  // Flesch-Kincaid grade level.
  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return {
    words,
    sentences,
    avgSentenceLen: words / sentences,
    longestSentence,
    grade: Math.max(0, grade),
  };
}

export function gradeLabel(grade: number): string {
  if (grade >= 16) return "graduate";
  if (grade >= 13) return "college";
  if (grade >= 9) return "high school";
  return "middle school";
}

// z-score -> approximate national percentile via the standard-normal CDF.
// opacity is a corpus-standardized z, so Phi(z) estimates "denser than X% of US
// provisions." Abramowitz & Stegun 26.2.17; clamped to [1,99] for sane copy.
export function zToPercentile(z: number): number {
  const b1 = 0.31938153,
    b2 = -0.356563782,
    b3 = 1.781477937,
    b4 = -1.821255978,
    b5 = 1.330274429,
    p = 0.2316419,
    c = 0.39894228;
  const az = Math.abs(z);
  const t = 1 / (1 + p * az);
  const phi = c * Math.exp((-az * az) / 2);
  let prob = 1 - phi * (b1 * t + b2 * t * t + b3 * t ** 3 + b4 * t ** 4 + b5 * t ** 5);
  if (z < 0) prob = 1 - prob;
  return Math.min(99, Math.max(1, Math.round(prob * 100)));
}
