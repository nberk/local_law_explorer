// Brand tokens mirrored from src/styles/global.css so the reel matches the site.
import { loadFont as loadSerif } from "@remotion/google-fonts/SourceSerif4";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const serif = loadSerif("normal", { weights: ["600", "700"] }).fontFamily;
export const sans = loadSans("normal", {
  weights: ["400", "500", "600", "700"],
}).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500"] }).fontFamily;

export const C = {
  bg: "#fbfbf9",
  ink900: "#161610",
  ink800: "#28281f",
  ink700: "#3d3d35",
  ink600: "#535349",
  ink500: "#6b6b63",
  ink400: "#8a8a82",
  ink300: "#b6b6af",
  ink200: "#d8d8d4",
  ink100: "#ececea",
  ink50: "#f7f7f6",
  accent500: "#3d63b3",
  accent600: "#2f4d99",
  accent700: "#243c79",
  accent300: "#9eb4dd",
  white: "#ffffff",
} as const;

// Topic palette (from src/lib/topics.ts TOPIC_COLOR).
export const TOPIC: Record<string, string> = {
  Zoning: "#3d63b3",
  Buildings: "#9eb4dd",
  Business: "#535349",
  Nuisance: "#8a8a82",
  Other: "#d8d8d4",
};
