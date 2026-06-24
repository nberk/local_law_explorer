// Build-time data access. Reads the JSON the pipeline emitted into public/data.
import fs from "node:fs";
import path from "node:path";
import type { Jurisdiction, JurisdictionSummary } from "./topics";

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

export function loadJurisdiction(state: string, slug: string): Jurisdiction {
  const file = path.join(DATA_DIR, state.toLowerCase(), `${slug}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

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

// The most opaque laws across the pilots, for the Legalese-o-Meter page.
export interface LegaleseLaw {
  jurisId: string;
  jurisName: string;
  state: string;
  slug: string;
  title: string;
  section: string | null;
  topic: string;
  opacity: number;
  content: string;
}

export interface LegaleseFile {
  generated: string;
  laws: LegaleseLaw[];
}

export function loadLegalese(): LegaleseFile {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "legalese.json"), "utf-8"));
}
