# Pinky Promise — product demo storyboard

1920×1080 · 30 fps · 89.5 s (2685 frames; scenes cross-dissolve over 15 frames). Every beat is grounded in a file in the
app; the app itself is read-only. Screens marked **[shot]** are real screenshots
of the running app (`npm run capture`); screens marked **[rebuilt]** are
re-created in Remotion from the app's own markup and Tailwind classes so they
can animate, using the same design tokens (`frontend/src/styles.css`).

## What the app really does (source of truth)

| Feature | Status | Where |
|---|---|---|
| AI practice calls: caller written live by Gemini, grounded in 568 redacted FTC robocall transcripts (4 retrieved per call) | Working | `backend/app/simulator/live/` |
| Six T-Mobile-themed scenarios across Beginner / Intermediate / Advanced | Working | `live/scenarios.py`, `routes/practice.tsx` |
| Briefing before every call: "You can't be scammed here", AI disclosed, text chat (default) or voice call | Working | `components/safe/CallBriefing.tsx` |
| Voice call: speech-to-text + AI voice (Gemini TTS) | Working (needs Gemini quota) | `live/gemini_speech.py`, `lib/live-audio.ts` |
| 🚩 "That's a red flag" button during the call | Working | `routes/practice.tsx` |
| "This was a fake call." disclosure when the call ends | Working | `routes/practice.tsx` |
| Debrief: fixed-rubric vulnerability score, learning outcomes, red flags spotted vs missed | Working | `routes/results.tsx`, `lib/sim-result.ts` |
| Transcript saved automatically | Working | `live/transcript.py` |
| Caller codes (employee issues a 4-digit code, customer checks it) | **Demo only**: "No text messages or notifications are sent" | `routes/verify.tsx`, `routes/employee.verify.tsx` |
| Progress roadmap | Working (demo data store) | `routes/progress.tsx` |
| Employee Analytics dashboard: Penny's Intelligence Brief, tactic effectiveness, department heatmap, fleet trend, coaching priorities, rankings, simulation explorer, CSV export | Working, on **illustrative data** (fictional employees, synced from `fake_analysis.csv`) | `routes/employee.index.tsx`, `components/safe/EmployerDashboard.tsx` |
| Biweekly practice reminders | **Demo only**: "no real calls" | `routes/practice.tsx` |

The call shown in scenes 7–8 uses caller lines **verbatim** (one line drops its opening "You're welcome.", because the reply it answered is skipped) from a real saved AI
call (`backend/data/call_transcripts/tmobile_unauthorized_change_20261108_105000_4a3116_transcript.txt`,
Gemini, grounded in FTC transcripts ftc-0516/0478/0423/0307). The 🚩 taps are
added to show the feature; the score is computed with the app's real rubric
(`scoreFor`: protected 15 − 3×1 protective − 2×3 spotted = **6**, Low risk).

## Scenes

| # | Time | Scene | Visual | On-screen type |
|---|---|---|---|---|
| 1 | 0–6 s | **Cold open: the call** | Ink background with the app's `--glow-call`. A phone slides in ringing: "T-Mobile Account Services · Incoming · (855) 555-0148" [rebuilt from AiCall header], pulse ring on the avatar. | "A familiar voice isn't always a friendly one." (home screen copy) |
| 2 | 6–11 s | **Brand** | Blush canvas wash, emblem logo scales in, Penny (`pinky-puppy-celebrating.png`) bounces in with sparkles. | "Pinky Promise" / "Big heart. Sharper instincts." (home screen copy) |
| 3 | 11–18 s | **Home** | Phone frame with the real Home screen [shot]; callout chips fly out: Verify a caller · Practice a call · My progress. | "Your call safety companion" |
| 4 | 18–25 s | **Verify a caller** | Two phones: Employee "Caller codes" [shot] → Customer "Caller verified!" [shot]. | "Know who's on the other end." + small "Prototype: demo delivery, no texts sent" |
| 5 | 25–31 s | **Choose a scenario** | Practice screen [shot] with the three difficulty cards; highlight sweeps across them. | "Rehearse the call before a real one comes." / "3 difficulty levels · 6 T-Mobile scenarios" |
| 6 | 31–37 s | **Briefing** | Briefing screen [rebuilt from CallBriefing]: "You can't be scammed here.", You'll practice list, Start text chat / Start voice call. | Trust callouts: "Clearly a simulation" · "AI caller, disclosed up front" · "Type or talk: your choice" |
| 7 | 37–58 s | **The live call** | AiCall screen [rebuilt], transcript bubbles appear in sync with the real AI call; user replies type into the input; 🚩 taps pulse with "Red flag noted" status. Side panel: animated labels for what's happening under the hood. | "Written live by AI" · "Grounded in 568 real FTC robocall transcripts" · "Tap 🚩 when something feels off" |
| 8 | 58–62 s | **Call over** | "This was a fake call." screen [rebuilt] with Penny happy. | — |
| 9 | 62–71 s | **Debrief** | Results [rebuilt]: score ring animates to 6 "Low risk", What You Practiced rows, Red flags you spotted · 3 of 7 chips. | "Feedback you can trust." · scored by fixed safety rules, not the AI's opinion |
| 10 | 71–81 s | **Progress & team insight** | Progress roadmap [shot] beside the Employee Analytics dashboard [shot, full-page capture]; the dashboard scrolls through six real sections while a list beside it highlights the current one. | "Confidence you can see." + "Employee Analytics shown with illustrative demo data" |
| 11 | 81–89.5 s | **Close** | Logo + Penny, three trust pillars, end card. | "Practice the call before the real one comes." · "Simulated calls. No real data. Your codes stay yours." |

## Motion language

- Taken from the app: spring entrances (`motion` springs in the app ≈ damping 14–18), the
  25 ms-ish fade/slide page transition, Penny's bounce/think/loving gestures, ScoreRing's
  1.2 s ease-out sweep, the pulse ring on the ringing avatar.
- Cinematic layer: slow push-ins on the phone (scale 1 → 1.04), soft depth-of-field blur on
  background blobs, word-by-word type reveals, cross-dissolves through blush/ink.
- Palette only from the app tokens: primary `#E20074`-family magenta, primary-deep, pink,
  blush, ink, mint/peach (pink-family in this theme).
