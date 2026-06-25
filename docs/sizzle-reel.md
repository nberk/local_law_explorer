# Sizzle reel (Remotion) — 2026-06-25

A short promo video for Local Law Explorer, built with [Remotion](https://remotion.dev)
(React → video). For posting on social.

## Format

- **Square 1:1, 1080×1080, 30fps, ~19.7s** (592 frames). Square posts cleanly to
  Instagram / LinkedIn / X feeds with no orientation risk.
- No audio track (add music in your posting tool, or see "Adding music" below).

## Where it lives

All source is under `remotion/` (committed). The rendered `.mp4` is a regenerable
artifact in `out/` (gitignored).

```
remotion/
  index.ts      registerRoot entry
  Root.tsx      <Composition id="SizzleSquare" 1080×1080 30fps>
  Sizzle.tsx    the 7 scenes + TransitionSeries assembly
  Donut.tsx     animated topic donut (mirrors TopicFingerprint)
  ui.tsx        FadeUp / Logo / Cursor / Kicker + the useReveal spring helper
  theme.ts      brand tokens + Google fonts (Source Serif 4 / Inter / JetBrains Mono)
remotion.config.ts
```

The reel mirrors the **site's brand**: cream `#fbfbf9` background, near-black ink,
`#3d63b3` accent, the three site fonts, and the real topic colors from
`src/lib/topics.ts`. Stats are the real corpus numbers (2,211,516 ordinances /
1,911 cities / 376 counties / 50 states / 2,287 places).

## Scenes

1. **Hook** — logo + "Know your local laws."
2. **The problem** — local law is scattered across PDFs and a thousand sites.
3. **The scale** — the corpus stat cards, counting up, with the **researcher
   credit** (LOCUS by Peskoff, Barrow, Vu & Davenport, 2026 · CC BY-NC 4.0).
4. **Find your town** — the finder mock (ZIP typed → nearest city + county).
5. **Report card** — the animated topic donut + legend.
6. **Search** — typing "noise" → matching ordinances.
7. **CTA** — logo, headline, `locallaw.nick-berk.com`, "Built by Nick Berk".

## Commands

```bash
bun run reel:studio   # open Remotion Studio to preview/scrub/tweak
bun run reel          # render → out/sizzle-square.mp4
```

First render downloads a headless Chromium (one-time). Rendering takes ~1 min.

## Editing tips

- All motion is driven by `useCurrentFrame()` — **never** CSS transitions or
  Tailwind `animate-*` classes (they don't render). Use the `useReveal()` spring
  helper or `interpolate()`.
- Scene durations + the 16-frame crossfades live in the `TransitionSeries` in
  `Sizzle.tsx`; `SIZZLE_DURATION` (consumed by `Root.tsx`) must equal the sum of
  sequence durations minus the transition overlaps.
- To change copy/stats, edit the scene components in `Sizzle.tsx`.

## Other formats

Only the square composition exists today. To add 9:16 (Reels/TikTok) or 16:9
(YouTube), add another `<Composition>` in `Root.tsx` with the new width/height and
adjust the scene layouts (the current scenes are tuned for a square frame).

## Adding music

Drop an audio file in `public/`, then add `<Audio src={staticFile("track.mp3")} />`
inside the `Sizzle` component. Keep it royalty-free / cleared for social use.
