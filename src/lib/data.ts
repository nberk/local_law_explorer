// Build-time data access. Reads the JSON the pipeline emitted into public/data.
import fs from "node:fs";
import path from "node:path";
import type { JurisdictionSummary } from "./topics";

const DATA_DIR = path.join(process.cwd(), "public", "data");

export interface CorpusStats {
  total_laws: number;
  states: number;
  cities: number;
  counties: number;
  topics: string[];
}

export interface IndexFile {
  corpus: CorpusStats;
  jurisdictions: JurisdictionSummary[];
}

export function loadIndex(): IndexFile {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "index.json"), "utf-8"));
}

// NOTE: there is intentionally no build-time loadJurisdiction(). At full scale
// reading per-jurisdiction files during `astro build` would pull ~4.6 GB. The
// heavy `laws[]` is always fetched client-side from PUBLIC_DATA_BASE_URL (R2);
// pages use only the summary fields from index.json. See docs/full-rollout.md.

// National percentile breakpoints, used to place an arbitrary town on the
// national distribution. Portrait percentiles for the pilot towns are already
// resolved in their per-jurisdiction JSON; this is the source of record and the
// basis for client-side placement once coverage expands beyond the prebuilt set.
export interface BaselinesFile {
  generated: string;
  n_jurisdictions: number;
  dimensions: Record<string, { breakpoints: number[] }>;
  topicShares: Record<string, { breakpoints: number[] }>;
}

export function loadBaselines(): BaselinesFile {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "baselines.json"), "utf-8"));
}

// Spectrum explorers (their own page): ~20 real laws sampled across a score dimension
// (opacity, paternalism), each with a hand-authored plain-language translation
// shown alongside the original text. Built by pipeline/spectrum.py.
export interface SpectrumLaw {
  jurisId: string;
  jurisName: string;
  state: string;
  slug: string;
  title: string;
  section: string | null;
  topic: string;
  score: number; // raw z-score for the dimension (percentile derived client-side)
  content: string;
  plain: string | null; // plain-language translation; null until authored
}

export interface SpectrumFile {
  generated: string;
  spectra: Record<string, { key: string; laws: SpectrumLaw[] }>;
}

export function loadSpectrum(): SpectrumFile {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "spectrum.json"), "utf-8"));
}
