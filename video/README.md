# Pinky Promise — product demo video (Remotion)

An 85-second, 1920×1080, 30 fps demo of the app, built with [Remotion](https://remotion.dev).
Scene-by-scene plan and the feature audit it is grounded in: [STORYBOARD.md](STORYBOARD.md).

This folder is self-contained. It reads the app (`../frontend`, `../backend`) but never writes to it.

## Commands

```bash
npm install
npm run sync-assets   # copy the app's artwork + design tokens (from frontend/src/styles.css)
npm run capture       # screenshot the real running app into public/shots (starts its Vite dev server)
npm run studio        # preview and scrub every scene
npm run render        # → out/pinky-promise-demo.mp4
```

Each scene is also its own composition (`scene-cold-open`, `scene-live-call`, …) for quick stills:
`npx remotion still scene-live-call out/check.png --frame=300`.

## How it stays true to the app

- **Real screens:** Home, Verify, Caller codes, Practice, Progress and the Analysts board are
  screenshots of the running app, captured by `scripts/capture.mjs` (Chrome, reduced motion on so
  every frame is settled).
- **Rebuilt screens:** the incoming call, briefing, live call, "This was a fake call." and results
  screens are re-created from the app's own markup and Tailwind classes (`src/ui/app.tsx` notes the
  source of each), so they can animate frame by frame.
- **Same design system:** `src/app-tokens.css` is generated from `frontend/src/styles.css` (colors,
  radii, shadows, glows, glass surfaces); the font is the app's Nunito Sans; Penny's poses and the
  logo are the app's PNGs.
- **Real AI output:** the caller's lines in the call scene come from a real Gemini practice call saved
  by the backend. The 🚩 taps are added to show the feature; the score (6, Low risk) is what the app's
  rubric gives for that outcome.
- **Honest labels:** caller codes are marked as demo-only (no texts are sent), and the Analysts board
  as illustrative data, as the app itself says.

No API keys, `.env` values or personal data are used or embedded.
