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
