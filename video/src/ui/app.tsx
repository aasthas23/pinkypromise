/**
 * Faithful re-creations of app screens, so they can animate frame by frame.
 * Markup and class names are copied from the app (sources noted per component);
 * where the app uses tailwind-merge (cn), the merged result is written directly.
 */
import { Flag, Home, Menu, MessageSquare, Mic, Phone, PhoneCall, PhoneOff, Send, ShieldCheck, TrendingUp, User, Volume2, VolumeX } from "lucide-react";
import type React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { clamp, Penny, SCREEN_H, SCREEN_W } from "./core";

// components/ui/button.tsx (base + variants), merged.
const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold [&_svg]:size-4 [&_svg]:shrink-0";
const VARIANT = {
  hero: "border-b-[3px] border-primary-deep bg-primary text-primary-foreground shadow-pop",
  soft: "border border-border bg-card/80 text-foreground shadow-soft",
  mint: "bg-mint text-mint-foreground",
  call: "bg-ink-foreground/10 text-ink-foreground",
  destructive: "bg-destructive text-destructive-foreground shadow-sm",
} as const;

export function Btn({
  variant,
  className = "",
  children,
  press = 0,
  style,
}: {
  variant: keyof typeof VARIANT;
  className?: string;
  children: React.ReactNode;
  /** 0..1: a tap (scale down + brighten), for showing the interaction. */
  press?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`${BASE} ${VARIANT[variant]} ${className}`}
      style={{ transform: `scale(${1 - press * 0.08})`, filter: `brightness(${1 + press * 0.15})`, ...style }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- call screens (routes/practice.tsx → AiCall)

export type CallLine = { id: string; speaker: "caller" | "user"; text: string; /** 0..1 reveal */ p: number };

const CALL_FRAME = "flex flex-col overflow-hidden bg-ink bg-call-glow text-ink-foreground";

function CallHeader({ sub, ringing, ring }: { sub: string; ringing?: boolean; ring?: number }) {
  return (
    <header className="flex items-center gap-3 p-4">
      <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-primary text-xl font-black">
        {ringing && ring !== undefined && (
          <span
            className="absolute inset-0 rounded-full bg-primary/30"
            style={{ transform: `scale(${1 + ring * 0.5})`, opacity: 0.6 * (1 - ring) }}
          />
        )}
        T
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-black">T-Mobile Account Services</p>
        <p className="truncate text-sm text-ink-foreground/80">{sub}</p>
      </div>
      <span className="shrink-0 rounded-full bg-ink-foreground/10 px-3 py-1 text-xs font-bold text-ink-foreground/80">
        Demo · Intermediate · AI caller
      </span>
    </header>
  );
}

/** Ringing state. `ring` is the 0..1 phase of the avatar's pulse ring. */
export function RingingCall({ ring, answerPress = 0 }: { ring: number; answerPress?: number }) {
  return (
    <div className={CALL_FRAME} style={{ width: SCREEN_W, height: SCREEN_H }}>
      <CallHeader sub="Incoming · (855) 555-0148" ringing ring={ring} />
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-4">
        <p className="m-auto text-center text-lg">Fictional AI caller. Answer to start practicing.</p>
      </div>
      <div className="flex items-center justify-center gap-4 px-4 py-6">
        <Btn variant="destructive" className="size-16 [&_svg]:size-5">
          <PhoneOff />
        </Btn>
        <Btn variant="mint" className="size-16 [&_svg]:size-5" press={answerPress}>
          <Phone />
        </Btn>
      </div>
    </div>
  );
}

/** Active text-chat call (the default mode). */
export function ActiveCall({
  clock,
  activity,
  lines,
  thinking,
  status,
  draft,
  flagPress = 0,
  endPress = 0,
  sendPress = 0,
}: {
  clock: string;
  activity: string;
  lines: CallLine[];
  thinking: number;
  status: string;
  draft: string;
  flagPress?: number;
  endPress?: number;
  sendPress?: number;
}) {
  return (
    <div className={CALL_FRAME} style={{ width: SCREEN_W, height: SCREEN_H }}>
      <CallHeader sub={`${clock} · ${activity}`} />
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-4">
        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden py-2">
          {lines.map((l) => (
            // grid 0fr→1fr: each new line grows in, pushing older ones up like the app's auto-scroll.
            <div key={l.id} style={{ display: "grid", gridTemplateRows: `${l.p}fr`, opacity: l.p }}>
              <div style={{ minHeight: 0, overflow: "hidden" }}>
                <p
                  className={`mt-3 max-w-[85%] rounded-2xl px-4 py-2 text-base leading-relaxed ${l.speaker === "user" ? "ml-auto bg-primary" : "bg-ink-foreground/15"}`}
                  style={{ marginBottom: 0 }}
                >
                  {l.text}
                </p>
              </div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateRows: `${thinking}fr`, opacity: thinking }}>
            <div style={{ minHeight: 0, overflow: "hidden" }}>
              <p className="mt-3 max-w-[85%] rounded-2xl bg-ink-foreground/15 px-4 py-2 text-base" style={{ width: "fit-content", marginBottom: 0 }}>
                …
              </p>
            </div>
          </div>
        </div>
        <p className="min-h-6 py-1 text-center text-sm text-ink-foreground/80">{status}</p>
        <div className="space-y-2 pb-2">
          <div className="flex gap-2">
            <span
              className={`flex h-12 w-full items-center rounded-2xl border-0 bg-ink-foreground/10 px-4 text-base ${draft ? "text-ink-foreground" : "text-ink-foreground/70"}`}
            >
              {draft || "Type your reply…"}
              {draft && <span className="ml-px inline-block h-5 w-px bg-ink-foreground" />}
            </span>
            <Btn variant="hero" className="size-12 shrink-0" press={sendPress} style={{ opacity: draft ? 1 : 0.5 }}>
              <Send />
            </Btn>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 px-4 py-6">
        <Btn variant="call" className="size-14 [&_svg]:size-5">
          <Mic />
        </Btn>
        <Btn variant="call" className="size-14 [&_svg]:size-5">
          <VolumeX />
        </Btn>
        <Btn variant="destructive" className="size-16 [&_svg]:size-5" press={endPress}>
          <PhoneOff />
        </Btn>
        <Btn
          variant="call"
          className="size-14 [&_svg]:size-5"
          press={flagPress}
          style={{ background: flagPress > 0.05 ? `color-mix(in oklab, var(--primary) ${Math.round(flagPress * 100)}%, rgba(255,255,255,0.1))` : undefined }}
        >
          <Flag />
        </Btn>
      </div>
    </div>
  );
}

/** "This was a fake call." screen shown when an AI call ends. */
export function CallOver({ press = 0 }: { press?: number }) {
  return (
    <div className={CALL_FRAME} style={{ width: SCREEN_W, height: SCREEN_H }}>
      <div className="m-auto flex max-w-lg flex-col items-center gap-4 px-6 text-center">
        <Penny mood="happy" size={130} />
        <h2 className="text-3xl font-black">This was a fake call.</h2>
        <p>A safe scam simulation, not a real request from T-Mobile. Your account wasn’t at risk.</p>
        <p className="text-sm text-ink-foreground/70">
          You flagged 3 red flags. Your results show which tactics you caught and what to practice next. The call transcript was saved automatically.
        </p>
        <Btn variant="hero" className="h-12 px-7 text-base" press={press}>
          See my results
        </Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- briefing (components/safe/CallBriefing.tsx)

const AI_NOTE =
  "The caller is an AI. In a voice call its voice is AI-generated, and what you say is transcribed to run the call; recordings aren’t kept.";

export function Briefing({ scroll, textPress = 0, voiceGlow = 0, readGlow = 0 }: { scroll: number; textPress?: number; voiceGlow?: number; readGlow?: number }) {
  const ring = (g: number): React.CSSProperties => ({ boxShadow: g ? `0 0 0 ${4 * g}px color-mix(in oklab, var(--primary) 55%, transparent)` : undefined });
  return (
    <div className="relative overflow-hidden bg-ink bg-call-glow text-ink-foreground" style={{ width: SCREEN_W, height: SCREEN_H }}>
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        <div className="flex items-center justify-between p-4 text-sm font-bold text-ink-foreground/70">
          <span className="rounded-full bg-ink-foreground/10 px-3 py-1">Before your practice call</span>
        </div>
        <div className="m-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 pb-8 text-center">
          <Penny mood="loving" size={110} />
          <h2 className="text-3xl font-black">You can’t be scammed here.</h2>
          <p>“Fake T-Mobile support rep” is a practice call. No real person is calling.</p>
          <p className="text-sm text-ink-foreground/70">{AI_NOTE}</p>
          <section className="w-full space-y-2 rounded-3xl bg-ink-foreground/5 p-4 text-left">
            <h3 className="font-black">You’ll practice</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Spot the scam tactics</li>
              <li>Keep codes and personal details private</li>
              <li>Check through an official channel</li>
            </ul>
            <h3 className="pt-2 font-black">How it works</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Type your replies, or choose a voice call to talk out loud. Never use real details.</li>
              <li>Tap 🚩 when something feels off.</li>
              <li>Hang up anytime.</li>
            </ul>
          </section>
          <Btn variant="hero" className="h-12 px-7 text-base" press={textPress}>
            <MessageSquare /> Start text chat
          </Btn>
          <Btn variant="call" className="h-12 px-7 text-base" style={ring(voiceGlow)}>
            <Mic /> Start voice call
          </Btn>
          <p className="text-sm text-ink-foreground/70">A voice call uses your microphone.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Btn variant="call" className="h-11 px-5 py-2" style={ring(readGlow)}>
              <Volume2 /> Read this to me
            </Btn>
            <Btn variant="call" className="h-11 px-5 py-2">
              Not now
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- app shell (components/safe/AppShell.tsx)

const NAV = [
  { label: "Home", icon: Home },
  { label: "Verify", icon: ShieldCheck },
  { label: "Practice", icon: PhoneCall },
  { label: "Progress", icon: TrendingUp },
  { label: "Profile", icon: User },
];

export function AppShellFrame({ children, active, scroll = 0 }: { children: React.ReactNode; active: string; scroll?: number }) {
  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ width: SCREEN_W, height: SCREEN_H }}>
      <header className="glass-surface z-20 shrink-0 border-b">
        <div className="flex h-16 w-full items-center gap-2 px-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground">
            <Menu className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <div className="relative flex rounded-full bg-pink/65 p-1 text-xs font-bold">
              <span className="relative z-10 rounded-full bg-card px-3 py-1.5 text-primary shadow-soft">Customer</span>
              <span className="relative z-10 px-3 py-1.5 text-muted-foreground">Employee</span>
            </div>
          </div>
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-deep">
            <Img src={staticFile("app/pinky-promise-emblem-logo.png")} className="size-8 rounded-full object-cover" />
          </span>
        </div>
      </header>
      <main className="min-h-0 w-full flex-1 overflow-hidden px-4 pt-4">
        <div style={{ transform: `translateY(${-scroll}px)` }}>{children}</div>
      </main>
      <nav className="glass-surface z-20 w-full shrink-0 border-t p-2">
        <div className="flex w-full justify-around gap-1">
          {NAV.map(({ label, icon: Icon }) => (
            <span
              key={label}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold ${label === active ? "bg-pink text-primary" : "text-muted-foreground"}`}
            >
              <Icon className="size-4" />
              {label}
            </span>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------- results (routes/results.tsx)

/** ScoreRing (components/safe/ScoreRing.tsx) with the sweep driven by `p`. */
export function ScoreRing({ value, p, size = 220, stroke = 20 }: { value: number; p: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = value * p;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--mint-foreground)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, shown) / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-6xl font-black" style={{ transform: `scale(${0.5 + 0.5 * Math.min(1, p * 1.4)})`, opacity: Math.min(1, p * 2) }}>
            {Math.round(shown)}
          </p>
          <p className="text-sm font-bold text-muted-foreground">vulnerability</p>
        </div>
      </div>
    </div>
  );
}

const SPOTTED = ["Fear about your account or money", "Asked for a one-time code or PIN", "Countdown pressure"];
const MISSED = ["Unexpected call about your account", "Claimed to be T-Mobile", "Asked you to confirm personal details", "Talked you out of checking"];

export function ResultsPage({ ring, chips }: { ring: number; chips: number }) {
  return (
    <div className="space-y-6 pb-6">
      <p className="rounded-xl bg-mint p-4 font-bold text-mint-foreground">
        This was a fake call — a safe scam simulation, not a real T-Mobile account call.
      </p>
      <h1 className="text-3xl font-black">Nice work! Let's see how you did.</h1>
      <section className="rounded-3xl bg-card p-6 shadow-soft">
        <h2 className="text-lg font-black">You held firm</h2>
        <p className="mt-1 text-muted-foreground">The caller gave up without getting anything from you.</p>
        <p className="mt-2 text-xs text-muted-foreground">
          The caller’s lines were written live by AI (Google gemini-3.5-flash-lite) and voiced by AI. Your score comes from the training’s fixed safety rules,
          not from the AI’s judgment.
        </p>
      </section>
      <section className="flex flex-col items-center gap-6 rounded-[2rem] bg-pink p-6 text-center">
        <ScoreRing value={6} p={ring} />
        <div>
          <span className="rounded-full px-3 py-1 text-sm font-black" style={{ background: "var(--mint)", color: "var(--mint-foreground)" }}>
            Low risk
          </span>
          <p className="mt-3 text-lg">
            <b>Lower is better.</b> A low vulnerability score means you resisted scam tactics.
          </p>
        </div>
      </section>
      <section className="rounded-3xl bg-card p-6 shadow-soft">
        <h2 className="text-lg font-black">What You Practiced</h2>
        <ul className="mt-3 space-y-2">
          <li className="rounded-2xl bg-peach px-4 py-2">
            <p className="font-semibold">Spot the scam tactics · Practice next</p>
            <p className="text-sm">
              You flagged 3 of 7 tactics. You missed: unexpected call about your account, claimed to be t-mobile, asked you to confirm personal details and
              talked you out of checking.
            </p>
          </li>
          <li className="rounded-2xl bg-mint px-4 py-2">
            <p className="font-semibold">Keep codes and personal details private · Done</p>
            <p className="text-sm">The caller asked for something sensitive, and you didn’t hand it over.</p>
          </li>
          <li className="rounded-2xl bg-peach px-4 py-2">
            <p className="font-semibold">Check through an official channel · Practice next</p>
            <p className="text-sm">Next time, say “I’ll check through the official app or the number on my bill,” then hang up.</p>
          </li>
        </ul>
      </section>
      <section className="rounded-3xl bg-card p-6 shadow-soft">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <Flag className="size-5" />
          Red Flags You Spotted · 3 of 7
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[...SPOTTED.map((t) => ({ t, on: true })), ...MISSED.map((t) => ({ t, on: false }))].map(({ t, on }, i) => {
            const s = interpolate(chips, [i * 0.1, i * 0.1 + 0.3], [0, 1], clamp);
            return (
              <span
                key={t}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                style={{ transform: `scale(${s})`, opacity: s }}
              >
                {on && <Flag className="size-4" />}
                {t}
              </span>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">🚩 Highlighted: tactics you flagged. Grey: tactics to watch for next time.</p>
      </section>
    </div>
  );
}

