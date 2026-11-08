# CLAUDE.md — Scam Coach Simulator

## Project mission

Build **Scam Coach**, a mobile-first, research-informed, realistic **scam-call training simulator** for a T-Mobile-track hackathon. The simulator is a module of a broader customer safety app. It teaches people to respond safely to suspicious calls through realistic practice, not multiple-choice quizzes.

**Core experience:** choose a scenario → receive a clearly labeled **simulated** incoming call → answer and interact naturally → hang up or reach a scenario ending → receive a personalized, evidence-linked debrief → optionally retry.

**Our positioning:** complement existing carrier scam identification/blocking tools by supporting customer judgment, verification, and recovery. Do **not** claim this is an official T-Mobile product or that the app has access to T-Mobile's Scam Shield data.

## Technology and constraints

- **Client:** React Native + Expo + TypeScript.
- **Navigation:** Expo Router if already installed; follow the existing project's navigation conventions otherwise.
- **State:** Prefer simple React state/hooks for local components; use the project's existing state solution, or Zustand if multiple screens share the simulator session.
- **Audio (MVP):** Use Expo-supported audio playback/recording APIs (`expo-audio`) and, when appropriate, `expo-speech`. Confirm compatibility with the project's installed Expo SDK before adding dependencies.
- **Voice (optional):** A real-time speech service can be integrated behind an abstraction. If it needs native WebRTC, plan for an Expo **development build**, not Expo Go. Never assume a service or API is already configured.
- **Backend:** Only introduce a server when needed for protecting keys, real-time sessions, or model orchestration. Never embed LLM or speech-provider secret keys in a client bundle or `EXPO_PUBLIC_*` variables.
- **Platform:** Prioritize iOS and Android. Keep the prototype usable without special carrier permissions or real call access.
- **No genuine carrier integration in MVP:** Incoming calls are in-app simulations. Never represent a simulator screen as an actual OS/cellular incoming call.

## Instructions for Claude working in this repository

1. **Inspect the repository first** (`package.json`, `app.json`/`app.config.*`, Expo SDK, routing structure, existing components, lint/test scripts). Do not assume file structure or install overlapping libraries.
2. Make **small, working, incremental changes**. State the files you will edit, implement them, and run the checks available in the repository.
3. Prefer **typed interfaces, modular functions, accessible UI, and predictable state transitions** over clever abstractions.
4. Use **Expo-supported** solutions first. Flag any library that requires a development build, native modules, permissions, or backend setup.
5. Keep a **functional scripted fallback** even if AI/audio services are unavailable. Demo reliability is a priority.
6. Never claim a feature is implemented, tested, or connected to T-Mobile unless the code and available configuration establish that fact.
7. When requirements are ambiguous, choose the simplest demoable approach, document the assumption, and continue.
8. Follow existing formatting, lint rules, file organization, and dependency versions. Do not rewrite unrelated parts of the app.
9. Do not commit credentials, tokens, transcripts, or real personal information.
10. At the end of a coding task, summarize what changed, how to run it, what was actually tested, and remaining limitations.

## MVP scope (priority order)

### P0 — must work in a hackathon demo

1. **Scenario selection** with at least one scenario: *Fake T-Mobile Account Security / SIM-swap warning*.
2. **Simulated incoming-call screen** with an explicit `SIMULATION` label and Answer / Decline actions.
3. **In-call screen** with call status, speaker/audio state (if supported), mute (if recording), and Hang Up. Controls must perform their advertised actions.
4. **Conversation engine:** scripted branches that react to user decisions; support at least verification, compliance, challenge, and hang-up paths. If real speech input is infeasible, implement tap-to-respond or text input without pretending speech recognition exists.
5. **Behavioral event logging** for session-level actions.
6. **Personalized debrief** showing observable choices, red flags encountered, recommended safer alternatives, and retry.
7. **Demo reset** so the same scenario can be replayed quickly.

### P1 — add after P0 is stable

- Speech-to-text input and voice output, with permissions and clear user feedback.
- LLM-generated natural dialogue constrained by a deterministic scenario state machine.
- Short excerpts from the interaction in the debrief, only with appropriate consent.
- Additional scenarios (bank impersonation, delivery scam, fake job offer).

### Out of scope for MVP

- Accessing actual cellular-call audio, caller IDs, or T-Mobile internal fraud classifications.
- Automatically placing or intercepting phone calls.
- Claiming to classify a real-world caller as safe or fraudulent.
- Collecting real OTPs, passwords, payment credentials, or account numbers.
- Production fraud detection or a substitute for official carrier/bank support.

## User experience principles

- **Simulation disclosure:** At setup and on the call screen, explicitly indicate the call is simulated. Make exit/hang-up available at all times.
- **Immersive, not deceptive:** Use lifelike pacing, voice, and tension, but avoid confusing users into thinking a real account is at risk.
- **No mid-call answer spoilers by default:** Let users make choices. Debrief afterward. Optional help may be offered clearly as a training hint.
- **Agency over panic:** Encourage independent verification using a number/app/site the user opens themselves. Do not teach users to distrust all callers indiscriminately.
- **Accessible:** Large touch targets, meaningful screen reader labels, adequate contrast, reduced-motion support, captions/transcripts for audio, and a non-voice fallback.
- **Supportive feedback:** Avoid shaming or blaming language. Explain tactics and actionable next steps.
- **Privacy:** Request microphone permission only when needed; do not retain raw audio or transcripts by default. If retention is introduced, ask for explicit consent and offer deletion.

## Suggested component boundaries (adapt to existing repo)

```text
app/
  simulator/
    index.tsx             # Scenario selection
    incoming.tsx          # Simulated ringing screen
    call.tsx              # Conversation UI
    debrief.tsx           # Behavioral feedback
features/
  simulator/
    scenarios/
      accountSecurity.ts  # Scenario data and branches
    engine/
      scenarioMachine.ts  # Deterministic state changes
      eventTracker.ts     # Behavioral event log
    hooks/
      useSimulator.ts
      useVoiceSession.ts  # Audio transport abstraction
    types.ts
components/
  simulator/
    CallControls.tsx
    CallerDisplay.tsx
    ConversationPanel.tsx
    DebriefTimeline.tsx
```

These are suggestions, not instructions to duplicate an existing architecture.

## Scenario engine contract

Use **deterministic state** for training objectives and evaluation. An LLM, if added, can vary surface dialogue but must not redefine the learning objective or invent scoring criteria.

Example phases:

```text
intro → authority_claim → urgency → simulated_sensitive_request → resolution
                         ↘ user_verifies / refuses / hangs_up → resolution
```

A scenario defines:

- `id`, `title`, `description`, `difficulty`, `learningObjectives`
- phases and allowed transitions
- caller utterances or dialogue intents
- safe simulated response options / input classification
- red flags and explanations
- debrief feedback rules

Keep the scammer portrayal **bounded and training-only**. Use fictional agents, dummy accounts, and fake codes; do not connect to real persons, phone numbers, payment rails, or credential-collection systems.

## Behavioral events and debriefing

Track **observable actions**, not unsupported psychological traits:

```ts
type SimulatorEventType =
  | 'call_answered'
  | 'caller_challenged'
  | 'independent_verification_requested'
  | 'sensitive_information_refused'
  | 'dummy_code_disclosed'
  | 'call_ended'
  | 'hint_requested';

type SimulatorEvent = {
  id: string;
  scenarioId: string;
  timestampMs: number;
  type: SimulatorEventType;
  phase?: string;
};
```

The debrief should distinguish **what happened** from **what we infer**:

- Show the user's observed actions and key scenario moments.
- Explain which behaviors are protective and which are risky, with specific rationale.
- Recommend independent callback through an official source instead of relying on the number displayed by the caller.
- Allow retry and show differences between attempts without overclaiming improved real-world safety.
- Avoid unsupported numeric “fraud detection accuracy” scores. If a training score is used, transparently define its rubric.

## AI voice integration rules (P1)

- Build behind `VoiceSession`-style interface so scripted and real-time implementations are swappable.
- Keep a server-side session/token endpoint for providers requiring secrets; issue short-lived client credentials where supported.
- Enforce scenario phase constraints on the backend, not only through prompt text.
- Support interruption, audio permission denial, network failure, timeout, and immediate hang-up.
- Do not upload or persist recorded speech without explicit opt-in; prefer ephemeral processing.
- Always provide captions or a transcript view in the simulation for accessibility.
- Do not add secretly active microphone listening or background recording.

## Visual direction

- Mobile-native, trustworthy, and calm. Magenta may be used as a T-Mobile-inspired accent; avoid implying official endorsement.
- Call UI should have a dark surface with prominent caller name, simulation label, time, and large Answer / Decline / Hang Up controls.
- Education/debrief screens should use clean light surfaces, readable typography, short explanations, and clear actions.
- Reuse the parent application's existing design tokens where available.

## Quality and acceptance criteria

For the **P0 demo**, the following should work on a physical phone or emulator:

- A user starts the scenario and visibly sees that it is a simulation.
- Answering moves into an interactive scenario; declining and hanging up end it safely.
- At least three distinct user behaviors result in appropriate branches.
- The session records events consistently and displays a debrief grounded in those events.
- A user can replay the scenario without resetting the app.
- Denied permissions, missing audio, and offline conditions fail gracefully.
- No secrets or personal information are collected or exposed.

Run repo-provided lint, TypeScript checks, and tests when available. For scenario logic, prefer unit tests that cover verification, compliance, refusal, hang-up, and reset. Report any checks that could not run.

## Research grounding and claims

The concept is motivated by ACM HCI work on interactive anti-scam training, social-engineering pressure, warning usability, trusted-support networks, and post-scam recovery. **Research on related interventions does not prove this particular app prevents fraud.** Treat any effectiveness statement as a hypothesis until validated through testing.

Possible research measures:

- Does the user independently verify the caller's claim?
- Does the user refuse a request for a dummy one-time code?
- Does the user disengage after clear warning signs?
- Can the user explain the manipulation tactic in the debrief?
- Do protective actions transfer to a different scenario after training?

Do not fabricate study results, citations, user testing outcomes, carrier partnerships, or real-world impact metrics.

## Immediate next task when starting implementation

1. Inspect the repository and identify its Expo SDK, router, styling system, and available scripts.
2. Implement a **single end-to-end scripted scenario** using the existing design system.
3. Wire the event log into a concrete personalized debrief.
4. Run available checks and identify the minimum changes required to add voice later.

**North star:** One believable, polished, safe, repeatable simulated scam call is better than many superficial scenarios.
