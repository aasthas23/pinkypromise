import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  Gift,
  Headset,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Siren,
  Clock,
  Send,
  Volume2,
  VolumeX,
  Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mascot, MascotBubble } from "@/components/safe/Mascot";
import { PageTitle } from "@/components/safe/AppShell";
import { scenarios, type Difficulty } from "@/lib/mock-data";
import { simulationService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useDemo } from "@/lib/store";
import { callPreferencesService } from "@/lib/services";
import { nextCallDate } from "@/lib/analytics";
import {
  listenOnce,
  speakLine,
  speechInputSupported,
  stopSpeaking,
  unlockSpeech,
  type Listening,
} from "@/lib/call-voice";
import type {
  OutcomeDefinition,
  ScenarioSummary,
  SessionView,
  TranscriptEntry,
} from "@/lib/simulator-api";
import { DEFAULT_OUTCOMES } from "@/lib/sim-result";
import { CallBriefing } from "@/components/safe/CallBriefing";

export const Route = createFileRoute("/practice")({
  head: () => ({
    meta: [
      { title: "Scam Call Simulator — Pinky Promise" },
      {
        name: "description",
        content: "Practice spotting scam tactics with safe, fictional training calls.",
      },
      { property: "og:title", content: "Scam Call Simulator — Pinky Promise" },
      {
        property: "og:description",
        content: "Practice spotting scam tactics with safe, fictional training calls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Practice,
});

const icons = { beginner: Gift, intermediate: Headset, advanced: Siren };

function Practice() {
  const s = useDemo();
  const nextDate = nextCallDate(s.biweeklyConsentAt);
  const [source, setSource] = useState<"practice" | "biweekly">("practice");
  const [pick, setPick] = useState<Difficulty>("intermediate");
  const [inCall, setInCall] = useState(false);
  return (
    <div>
      <PageTitle title="Practice calls" />
      <MascotBubble mood="bounce" size={100}>
        Let's practice together! I'll help you spot the tricks.
      </MascotBubble>
      <section className="mt-4 border-y border-mint-foreground/15 bg-mint/45 px-4 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Biweekly scam simulations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One call every two weeks · optional
            </p>
          </div>
          <Switch
            id="biweekly-calls"
            aria-label="Opt in to biweekly calls"
            checked={s.biweeklyOptIn}
            onCheckedChange={callPreferencesService.setBiweeklyOptIn}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          With your permission, T-Mobile would send simulated scam calls and disclose that the call
          was fake at the end. Results help analysts understand which tactics need more practice.
          You can opt out anytime.
        </p>
        <p role="status" className="mt-3 font-bold text-primary-deep">
          {s.biweeklyOptIn ? "You're opted in" : "You're opted out"}
        </p>
        {s.biweeklyOptIn && nextDate && (
          <p className="mt-1 text-sm text-muted-foreground">
            Demo next call: {new Date(nextDate).toLocaleDateString()}
          </p>
        )}
        {s.biweeklyOptIn && (
          <Button
            variant="soft"
            className="mt-3"
            onClick={() => {
              setSource("biweekly");
              setInCall(true);
            }}
          >
            Preview a biweekly call
          </Button>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Demo preference only. No real calls are scheduled or placed.
        </p>
      </section>
      <h2 className="mt-6 text-xl font-black">Start a practice call</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Explore calls you might receive from someone claiming to be T-Mobile.
      </p>
      <div role="radiogroup" aria-label="Difficulty" className="mt-6 space-y-3">
        {scenarios.map((s) => {
          const Icon = icons[s.id];
          const on = pick === s.id;
          return (
            <Button
              variant="ghost"
              key={s.id}
              role="radio"
              aria-checked={on}
              onClick={() => setPick(s.id)}
              className={cn(
                "h-auto w-full whitespace-normal rounded-2xl border-2 p-4 text-left shadow-soft transition-colors",
                on ? "border-primary bg-pink" : "border-border bg-card/85",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 grid size-10 shrink-0 place-items-center rounded-full",
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em]">
                    <span className="text-primary-deep">{s.label}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3" />
                      {s.duration}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-black">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.blurb}</p>
                </div>
              </div>
            </Button>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button
          variant="hero"
          size="lg"
          className="w-full sm:w-auto"
          onClick={() => {
            setSource("practice");
            setInCall(true);
          }}
        >
          Start Practice Call
        </Button>
        <p className="text-sm text-muted-foreground">
          Demo Simulation · fictional caller. Type, tap or speak your replies; don’t share real
          details. The transcript saves automatically.
        </p>
      </div>
      <AnimatePresence>
        {inCall && (
          <CallScreen difficulty={pick} source={source} onClose={() => setInCall(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Practice call. Tries the live simulator first: the backend runs the T-Mobile
 * scenario step by step, Claude writes the caller's lines, and the browser
 * speaks them. If the practice server can't be reached, the scripted demo
 * call plays instead so the demo never breaks.
 */
function CallScreen({
  difficulty,
  source,
  onClose,
}: {
  difficulty: Difficulty;
  source: "practice" | "biweekly";
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { mode: "connecting" }
    | { mode: "live"; session: SessionView; scenario: ScenarioSummary | undefined }
    | { mode: "scripted"; reason: string }
  >({ mode: "connecting" });
  // Explain the purpose before anything rings, so no one worries they're "actually being scammed".
  const [briefed, setBriefed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    simulationService.startLiveCall(difficulty).then(
      ({ session, scenario }) => !cancelled && setState({ mode: "live", session, scenario }),
      () =>
        !cancelled &&
        setState({
          mode: "scripted",
          reason:
            "The live practice caller isn’t available right now, so this is the scripted demo call.",
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [difficulty]);

  if (!briefed)
    return (
      <CallBriefing
        title={scenarios.find((x) => x.id === difficulty)?.title ?? "Practice call"}
        outcomes={(state.mode === "live" && state.scenario?.learningOutcomes) || DEFAULT_OUTCOMES}
        handsOnFlags={state.mode !== "scripted"}
        onStart={() => setBriefed(true)}
        onCancel={onClose}
      />
    );
  if (state.mode === "scripted")
    return (
      <ScriptedCall
        difficulty={difficulty}
        source={source}
        onClose={onClose}
        notice={state.reason}
      />
    );
  if (state.mode === "live")
    return (
      <LiveCall
        initial={state.session}
        scenario={state.scenario}
        difficulty={difficulty}
        source={source}
        onClose={onClose}
      />
    );
  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-label="Practice call"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink bg-call-glow text-ink-foreground"
    >
      <Mascot mood="think" size={110} />
      <p role="status" className="font-bold">
        Setting up your practice call…
      </p>
    </motion.div>
  );
}

/** Reveals transcript entries one at a time, speaking caller lines aloud. */
function usePlayback(
  entries: TranscriptEntry[],
  voiceOn: boolean,
  voice: { pitch?: number; rate?: number } | null | undefined,
  halted: boolean,
) {
  const [played, setPlayed] = useState(0);
  const [speakingId, setSpeakingId] = useState<string>();
  const entriesRef = useRef(entries);
  const voiceOnRef = useRef(voiceOn);
  useEffect(() => {
    entriesRef.current = entries;
  });
  useEffect(() => {
    voiceOnRef.current = voiceOn;
    if (!voiceOn) stopSpeaking();
  }, [voiceOn]);

  // Key on the current entry's id so a response that adds no lines can't restart the line in progress.
  const currentId = !halted && played < entries.length ? entries[played]?.id : undefined;
  useEffect(() => {
    if (!currentId) return;
    const entry = entriesRef.current.find((e) => e.id === currentId);
    if (!entry) return;
    const ac = new AbortController();
    const next = () => {
      if (ac.signal.aborted) return;
      setSpeakingId(undefined);
      setPlayed((p) => p + 1);
    };
    const t = setTimeout(
      () => {
        if (entry.speaker !== "caller") return next();
        setSpeakingId(entry.id);
        void speakLine(entry.text, { enabled: voiceOnRef.current, voice, signal: ac.signal }).then(
          next,
        );
      },
      entry.speaker === "caller" ? 450 : entry.speaker === "sms" ? 900 : 0,
    );
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [currentId, voice]);

  useEffect(() => () => stopSpeaking(), []);

  if (halted) return { visible: entries, playing: false, speakingId: undefined };
  const current = entries[played];
  const showing =
    played < entries.length && current?.speaker === "caller" && speakingId === current.id
      ? played + 1
      : Math.min(played, entries.length);
  return { visible: entries.slice(0, showing), playing: played < entries.length, speakingId };
}

function LiveCall({
  initial,
  scenario,
  difficulty,
  source,
  onClose,
}: {
  initial: SessionView;
  scenario: ScenarioSummary | undefined;
  difficulty: Difficulty;
  source: "practice" | "biweekly";
  onClose: () => void;
}) {
  const fallback = scenarios.find((s) => s.id === difficulty) ?? scenarios[0];
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [session, setSession] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [voiceOn, setVoiceOn] = useState(true);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState<Listening | null>(null);
  const [hungUp, setHungUp] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [flagsTapped, setFlagsTapped] = useState(0);
  const [flagNote, setFlagNote] = useState<string>();
  const txRef = useRef<HTMLDivElement>(null);

  const caller = scenario?.caller;
  const callerName = caller?.displayName ?? fallback?.caller.replace(/"/g, "") ?? "Unknown caller";
  const { visible, playing, speakingId } = usePlayback(
    session.transcript,
    voiceOn,
    caller?.voice,
    hungUp,
  );
  const ringing = session.status === "ringing";
  const callOver = session.status === "ended" && !playing;
  const node = session.node;
  const canRespond = session.status === "active" && !playing && !pending && !listening && !!node;
  const freeText = session.freeTextAvailable && !!node?.acceptsSpeech;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    txRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [visible.length, pending, canRespond]);
  // The flag confirmation fades after a moment so the status line frees up.
  useEffect(() => {
    if (!flagNote) return;
    const t = setTimeout(() => setFlagNote(undefined), 3000);
    return () => clearTimeout(t);
  }, [flagNote, flagsTapped]);

  const act = async (fn: () => Promise<SessionView>) => {
    setPending(true);
    setError(undefined);
    try {
      setSession(await fn());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setPending(false);
    }
  };

  const hangUp = async () => {
    listening?.stop();
    stopSpeaking();
    setHungUp(true);
    if (session.status !== "active") return;
    try {
      setSession(await simulationService.hangUp(session.sessionId));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn’t reach the practice server to end the call.",
      );
    }
  };

  const close = () => {
    if (session.status === "active")
      void simulationService.hangUp(session.sessionId).catch(() => {});
    stopSpeaking();
    onClose();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // Hands-on cue spotting: the user flags tactics as they happen. No right/wrong feedback until the debrief.
  const spotRedFlag = () => {
    const n = flagsTapped + 1;
    setFlagsTapped(n);
    setFlagNote(`Red flag ${n} noted. We’ll review it after the call.`);
    simulationService.spotRedFlag(session.sessionId).catch(() => {
      setFlagsTapped((c) => Math.max(0, c - 1));
      setFlagNote("Couldn’t save that flag. Try tapping again.");
    });
  };

  const answer = () => {
    unlockSpeech(); // must happen inside the tap for iOS to allow speech
    void act(() => simulationService.answer(session.sessionId));
  };
  const decline = () => void act(() => simulationService.decline(session.sessionId));
  const send = async (text: string) => {
    const t = text.trim();
    if (!t || !canRespond) return;
    if (await act(() => simulationService.say(session.sessionId, t))) setDraft("");
  };
  const talk = async () => {
    if (listening) return listening.stop();
    stopSpeaking();
    const l = listenOnce();
    setListening(l);
    try {
      const heard = await l.result;
      setListening(null);
      if (heard) await act(() => simulationService.say(session.sessionId, heard));
      else setError("Didn’t catch that. Try again or type your reply.");
    } catch (e) {
      setListening(null);
      setError(e instanceof Error ? e.message : "Voice input failed.");
    }
  };
  const finish = async () => {
    setFinishing(true);
    try {
      await simulationService.finishLiveCall(session, difficulty, source);
      void navigate({ to: "/results" });
    } catch (e) {
      setFinishing(false);
      setError(e instanceof Error ? e.message : "Couldn’t load your results.");
    }
  };

  const secs =
    session.answeredAtMs && !callOver
      ? Math.max(0, Math.floor((now - session.answeredAtMs) / 1000))
      : 0;
  const micReady = freeText && speechInputSupported();
  const clock = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-label="Practice call"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-ink bg-call-glow text-ink-foreground"
    >
      {finishing ? (
        <div className="m-auto flex flex-col items-center gap-4 text-center">
          <Mascot mood="think" size={140} />
          <p className="text-xl font-black">Reviewing your call…</p>
          <p className="text-ink-foreground/60">
            Checking your choices against the scenario’s safety rules.
          </p>
        </div>
      ) : callOver ? (
        <div className="m-auto flex max-w-lg flex-col items-center gap-4 px-6 text-center">
          <Mascot mood="happy" size={130} />
          <h2 className="text-3xl font-black">This was a fake call.</h2>
          <p>
            A safe scam simulation, not a real request from T-Mobile. Your account wasn’t at risk.
          </p>
          <p role="status" className="text-sm text-ink-foreground/70">
            {error ??
              `${flagsTapped ? `You flagged ${flagsTapped} red flag${flagsTapped > 1 ? "s" : ""}. ` : ""}Your results show which tactics you caught and what to practice next.${session.transcriptFile ? " The call transcript was saved automatically." : ""}`}
          </p>
          <Button variant="hero" size="lg" onClick={finish}>
            See my results
          </Button>
        </div>
      ) : (
        <>
          {/* Fixed-height header and controls; only the transcript grows, so nothing jumps. */}
          <header className="flex items-center gap-3 p-4">
            <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-primary text-xl font-black">
              {!reduce && ringing && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-primary/30"
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              {callerName.replace(/\W/g, "")[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black">{callerName}</p>
              <p className="truncate text-sm text-ink-foreground/80">
                {ringing
                  ? `Incoming · ${caller?.displayNumber ?? "Unknown number"}`
                  : `${clock} · ${speakingId ? "Caller is speaking" : canRespond ? "Your turn" : "Practice call"}`}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-ink-foreground/10 px-3 py-1 text-xs font-bold text-ink-foreground/80">
              Demo · {fallback?.label}
            </span>
          </header>
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-4">
            {ringing ? (
              <p className="m-auto text-center text-lg">
                Fictional caller. Answer to start practicing.
              </p>
            ) : (
              <div
                ref={txRef}
                aria-live="polite"
                className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2"
              >
                {visible.map((l) =>
                  l.speaker === "system" ? (
                    <p key={l.id} className="text-center text-sm text-ink-foreground/80">
                      {l.text}
                    </p>
                  ) : (
                    <motion.p
                      key={l.id}
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2 text-base leading-relaxed",
                        l.speaker === "user" ? "ml-auto bg-primary" : "bg-ink-foreground/15",
                      )}
                    >
                      {l.speaker === "sms" && <b>Text from {l.sender}: </b>}
                      {l.text}
                    </motion.p>
                  ),
                )}
                {pending && (
                  <p className="max-w-[85%] rounded-2xl bg-ink-foreground/15 px-4 py-2 text-base">
                    <span aria-hidden>…</span>
                    <span className="sr-only">Waiting for the caller…</span>
                  </p>
                )}
                {!visible.length && !pending && (
                  <p className="text-center text-sm text-ink-foreground/80">Connecting…</p>
                )}
              </div>
            )}
            {/* One reserved line for status, so messages don't push the layout around. */}
            <p role="status" className="min-h-6 py-1 text-center text-sm text-ink-foreground/80">
              {error ?? flagNote ?? session.notice ?? ""}
            </p>
            {canRespond && node && (
              <div className="space-y-2 pb-2">
                {node.options.map((o) => (
                  <Button
                    key={o.id}
                    variant="call"
                    onClick={() =>
                      void act(() => simulationService.choose(session.sessionId, o.id))
                    }
                    className="h-auto w-full justify-start whitespace-normal rounded-2xl px-4 py-3 text-left text-base"
                  >
                    {o.keypad ? `Press ${o.keypad}` : o.label}
                  </Button>
                ))}
                {freeText && (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send(draft);
                    }}
                  >
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={280}
                      placeholder="Or type your own reply…"
                      aria-label="Your reply to the caller. Don’t type real personal information."
                      className="h-12 rounded-2xl border-0 bg-ink-foreground/10 text-base text-ink-foreground placeholder:text-ink-foreground/70"
                    />
                    <Button
                      type="submit"
                      variant="hero"
                      size="icon"
                      className="size-12 shrink-0"
                      disabled={!draft.trim()}
                      aria-label="Send reply"
                    >
                      <Send />
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 px-4 py-6">
            {ringing ? (
              <>
                <Button
                  variant="destructive"
                  size="icon"
                  className="size-16"
                  aria-label="Decline call"
                  disabled={pending}
                  onClick={decline}
                >
                  <PhoneOff />
                </Button>
                <Button
                  variant="mint"
                  size="icon"
                  className="size-16"
                  aria-label="Answer call"
                  disabled={pending}
                  onClick={answer}
                >
                  <Phone />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="call"
                  size="icon"
                  className="size-14"
                  aria-label={
                    listening
                      ? "Stop listening"
                      : micReady
                        ? "Speak your reply"
                        : "Voice replies aren’t available in this browser"
                  }
                  aria-pressed={!!listening}
                  disabled={!micReady || (!canRespond && !listening)}
                  onClick={talk}
                >
                  {listening ? <MicOff /> : <Mic />}
                </Button>
                <Button
                  variant="call"
                  size="icon"
                  className="size-14"
                  aria-label={voiceOn ? "Mute caller voice" : "Unmute caller voice"}
                  aria-pressed={!voiceOn}
                  onClick={() => setVoiceOn(!voiceOn)}
                >
                  {voiceOn ? <Volume2 /> : <VolumeX />}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="size-16"
                  aria-label="End call"
                  onClick={hangUp}
                >
                  <PhoneOff />
                </Button>
                <Button
                  variant="call"
                  size="icon"
                  className="size-14"
                  aria-label={`That’s a red flag${flagsTapped ? ` (${flagsTapped} flagged)` : ""}`}
                  disabled={session.status !== "active"}
                  onClick={spotRedFlag}
                >
                  <Flag />
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

function ScriptedCall({
  difficulty,
  source,
  onClose,
  notice,
}: {
  difficulty: Difficulty;
  source: "practice" | "biweekly";
  onClose: () => void;
  notice?: string;
}) {
  const sc = scenarios.find((s) => s.id === difficulty) ?? scenarios[0];
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [secs, setSecs] = useState(0);
  const [lines, setLines] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ending, setEnding] = useState(false);
  const [disclosed, setDisclosed] = useState(false);
  const txRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!sc || lines >= sc.script.length) return;
    const t = setTimeout(() => setLines((l) => l + 1), lines === 0 ? 900 : 2200);
    return () => clearTimeout(t);
  }, [lines, sc]);
  useEffect(() => {
    txRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [lines]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  if (!sc) return null;
  const end = () => setDisclosed(true);
  const finish = async () => {
    setEnding(true);
    await simulationService.evaluate(difficulty, source);
    navigate({ to: "/results" });
  };
  const speaking = lines < sc.script.length && sc.script[lines]?.who === "caller";

  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-label="Practice call"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-ink bg-call-glow text-ink-foreground"
    >
      {ending ? (
        <div className="m-auto flex flex-col items-center gap-4 text-center">
          <Mascot mood="think" size={140} />
          <p className="text-xl font-black">Analyzing your call…</p>
          <p className="text-ink-foreground/60">Our mock AI coach is reviewing the tactics.</p>
        </div>
      ) : disclosed ? (
        <div className="m-auto flex max-w-lg flex-col items-center gap-4 px-6 text-center">
          <Mascot mood="happy" size={130} />
          <h2 className="text-3xl font-black">This was a fake call.</h2>
          <p>
            A safe scam simulation — not a real request from T-Mobile. Your account wasn't at risk.
          </p>
          <p className="text-sm text-ink-foreground/70">
            Your demo results help identify scam tactics to practice next.
          </p>
          <Button variant="hero" size="lg" onClick={finish}>
            See my results
          </Button>
        </div>
      ) : (
        <>
          {/* Same fixed layout as the live call: only the transcript grows. */}
          <header className="flex items-center gap-3 p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-xl font-black">
              {sc.caller.replace(/\W/g, "")[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black">{sc.caller}</p>
              <p className="truncate text-sm text-ink-foreground/80">
                {String(Math.floor(secs / 60)).padStart(2, "0")}:
                {String(secs % 60).padStart(2, "0")} ·{" "}
                {speaking ? "Caller is speaking" : "Practice call"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-ink-foreground/10 px-3 py-1 text-xs font-bold text-ink-foreground/80">
              Demo · {sc.label}
            </span>
          </header>
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-4">
            {notice && (
              <p
                role="status"
                className="rounded-xl bg-ink-foreground/10 px-3 py-2 text-center text-sm text-ink-foreground/80"
              >
                {notice}
              </p>
            )}
            <div
              ref={txRef}
              aria-live="polite"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2"
            >
              {sc.script.slice(0, lines).map((l, i) => (
                <motion.p
                  key={i}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2 text-base leading-relaxed",
                    l.who === "caller" ? "bg-ink-foreground/15" : "ml-auto bg-primary",
                  )}
                >
                  {l.text}
                </motion.p>
              ))}
              {lines === 0 && (
                <p className="text-center text-sm text-ink-foreground/80">Connecting…</p>
              )}
              {lines >= sc.script.length && (
                <p role="status" className="rounded-xl bg-mint p-3 font-bold text-mint-foreground">
                  This was a fake call — a safe scam simulation.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center gap-5 px-4 py-6">
            <Button
              variant="call"
              size="icon"
              className="size-14"
              aria-label={muted ? "Unmute" : "Mute"}
              aria-pressed={muted}
              onClick={() => setMuted(!muted)}
            >
              {muted ? <MicOff /> : <Mic />}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="size-16"
              aria-label="End call"
              onClick={end}
            >
              <PhoneOff />
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
}
