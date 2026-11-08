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
import { backendSimulatorService, simulationService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useDemo } from "@/lib/store";
import { callPreferencesService } from "@/lib/services";
import { nextCallDate } from "@/lib/analytics";
import { unlockSpeech } from "@/lib/call-voice";
import { MicListener, VoicePlayer } from "@/lib/live-audio";
import type { LiveEvent, LiveSession, OutcomeDefinition } from "@/lib/simulator-api";
import { DEFAULT_OUTCOMES } from "@/lib/sim-result";
import { CallBriefing, type CallMode } from "@/components/safe/CallBriefing";

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
  const [liveCallState, setLiveCallState] = useState<{
    loading: boolean;
    sessionId: string | null;
    transcriptEntries: Array<{ speaker: string; text: string }>;
    transcriptText: string;
    error: string | null;
  }>({ loading: false, sessionId: null, transcriptEntries: [], transcriptText: "", error: null });

  const handleLiveCall = async () => {
    setLiveCallState({ loading: true, sessionId: null, transcriptEntries: [], transcriptText: "", error: null });
    try {
      const result = await backendSimulatorService.runTestCall("account-security-sim-swap");
      setLiveCallState({
        loading: false,
        sessionId: result.sessionId,
        transcriptEntries: result.transcriptEntries,
        transcriptText: result.transcriptText,
        error: null,
      });
    } catch (error) {
      setLiveCallState({
        loading: false,
        sessionId: null,
        transcriptEntries: [],
        transcriptText: "",
        error: error instanceof Error ? error.message : "Unable to start the live test call right now.",
      });
    }
  };

  return (
    <div>
      <PageTitle title="Practice" />
      <MascotBubble mood="bounce" size={100}>Ready to practice?</MascotBubble>

      <section className="mt-4 rounded-2xl border border-mint-foreground/15 bg-mint/45 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-deep">Biweekly</p>
            <h2 className="text-lg font-black">Practice reminders</h2>
          </div>
          <Switch
            id="biweekly-calls"
            aria-label="Opt in to biweekly calls"
            checked={s.biweeklyOptIn}
            onCheckedChange={callPreferencesService.setBiweeklyOptIn}
          />
        </div>
        {s.biweeklyOptIn && nextDate && (
          <p className="mt-2 text-sm text-muted-foreground">Next: {new Date(nextDate).toLocaleDateString()}</p>
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
            Preview
          </Button>
        )}
      </section>

      <section className="mt-5 rounded-3xl border border-pink/50 bg-card/95 p-3 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-deep">Live test</p>
            <h2 className="mt-1 text-lg font-black">Quick call</h2>
          </div>
          <Button variant="hero" size="sm" onClick={handleLiveCall} disabled={liveCallState.loading}>
            {liveCallState.loading ? "Calling…" : "Get call"}
          </Button>
        </div>

        {liveCallState.error && (
          <p className="mt-3 rounded-2xl border border-red-500/50 bg-red-50 px-3 py-2 text-sm text-red-700">
            {liveCallState.error}
          </p>
        )}

        {liveCallState.transcriptEntries.length > 0 && (
          <div className="mt-4 rounded-2xl border border-border bg-muted/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-black text-primary-deep">Transcript</p>
              {liveCallState.sessionId && (
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {liveCallState.sessionId}
                </span>
              )}
            </div>
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {liveCallState.transcriptEntries.map((entry, index) => (
                <p
                  key={`${entry.speaker}-${index}`}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    entry.speaker === "caller"
                      ? "bg-card text-foreground"
                      : "ml-auto bg-primary text-primary-foreground",
                  )}
                >
                  <span className="font-black uppercase tracking-[0.08em]">
                    {entry.speaker === "caller" ? "Caller" : entry.speaker === "user" ? "You" : entry.speaker}:
                  </span>{" "}
                  {entry.text}
                </p>
              ))}
            </div>
            {liveCallState.transcriptText && (
              <pre className="mt-4 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-ink p-3 text-xs text-ink-foreground">
                {liveCallState.transcriptText}
              </pre>
            )}
          </div>
        )}
      </section>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-lg font-black">Choose a scenario</h2>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {scenarios.length} options
        </span>
      </div>

      <div role="radiogroup" aria-label="Difficulty" className="mt-3 space-y-3">
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
                "h-auto w-full whitespace-normal rounded-2xl border-2 p-3 text-left shadow-soft transition-colors",
                on ? "border-primary bg-pink" : "border-border bg-card/85",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full",
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.12em]">
                    <span className="text-primary-deep">{s.label}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3" />
                      {s.duration}
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-black">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.blurb}</p>
                </div>
              </div>
            </Button>
          );
        })}
      </div>

      <div className="mt-5">
        <Button
          variant="hero"
          size="lg"
          className="w-full"
          onClick={() => {
            setSource("practice");
            setInCall(true);
          }}
        >
          Start call
        </Button>
      </div>
      <AnimatePresence>
        {inCall && <CallScreen difficulty={pick} source={source} onClose={() => setInCall(false)} />}
      </AnimatePresence>
    </div>
  );
}

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
    | { mode: "ai"; session: LiveSession; outcomes: OutcomeDefinition[] }
    | { mode: "scripted"; reason: string }
  >({ mode: "connecting" });
  const [mode, setMode] = useState<CallMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([simulationService.aiStatus(), simulationService.startAiCall(difficulty)]).then(
      ([status, session]) =>
        !cancelled && setState({ mode: "ai", session, outcomes: status.learningOutcomes }),
      (e: unknown) =>
        !cancelled &&
        setState({
          mode: "scripted",
          reason: `${e instanceof Error ? e.message : "The practice server is unavailable."} Playing the scripted demo call instead.`,
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [difficulty]);

  if (!mode)
    return (
      <CallBriefing
        title={scenarios.find((x) => x.id === difficulty)?.title ?? "Practice call"}
        outcomes={state.mode === "ai" ? state.outcomes : DEFAULT_OUTCOMES}
        handsOnFlags={state.mode !== "scripted"}
        aiCaller={state.mode !== "scripted"}
        onStart={setMode}
        onCancel={onClose}
      />
    );

  if (state.mode === "scripted")
    return <ScriptedCall difficulty={difficulty} source={source} onClose={onClose} notice={state.reason} />;

  if (state.mode === "ai")
    return <AiCall initial={state.session} mode={mode} difficulty={difficulty} source={source} onClose={onClose} />;

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

type Line = { id: string; speaker: "caller" | "user" | "system"; text: string };
type Phase = "ringing" | "thinking" | "caller" | "listening" | "hearing" | "sending" | "ended";
const SILENCE_PROMPT_MS = 9000;
const CHAT_PACE_MS = (text: string) => Math.min(1200, 250 + text.length * 8);

const STATUS: Record<Phase, string> = {
  ringing: "",
  thinking: "The caller is responding…",
  caller: "",
  listening: "Listening… just talk when you’re ready.",
  hearing: "Hearing you…",
  sending: "Transcribing…",
  ended: "",
};

function AiCall({
  initial,
  mode,
  difficulty,
  source,
  onClose,
}: {
  initial: LiveSession;
  mode: CallMode;
  difficulty: Difficulty;
  source: "practice" | "biweekly";
  onClose: () => void;
}) {
  const label = scenarios.find((s) => s.id === difficulty)?.label;
  const sid = initial.sessionId;
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<Phase>("ringing");
  const [error, setError] = useState<string>();
  const [mic, setMic] = useState<"text" | "off" | "on" | "muted" | "unavailable">(
    mode === "text" ? "text" : "off",
  );
  const [voiceOn, setVoiceOn] = useState(mode === "voice");
  const [draft, setDraft] = useState("");
  const [callerSpeaking, setCallerSpeaking] = useState(false);
  const [answeredAt, setAnsweredAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [flagsTapped, setFlagsTapped] = useState(0);
  const [flagNote, setFlagNote] = useState<string>();
  const [finishing, setFinishing] = useState(false);
  const [savedFile, setSavedFile] = useState<string | null>(null);
  const txRef = useRef<HTMLDivElement>(null);
  const player = useRef<VoicePlayer | null>(null);
  const listener = useRef<MicListener | null>(null);
  const abort = useRef<AbortController | null>(null);
  const streaming = useRef(false);
  const ending = useRef(false);
  const voiceRef = useRef(mode === "voice");
  const shownCaller = useRef<string | undefined>(undefined);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const promptedSilence = useRef(false);

  const callOver = phase === "ended";
  const active = !callOver && phase !== "ringing";

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    txRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [lines.length, phase]);

  const clearSilence = () => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = undefined;
    }
  };

  const endLocally = () => {
    clearSilence();
    abort.current?.abort();
    player.current?.stop();
    listener.current?.stop();
    setCallerSpeaking(false);
    setPhase("ended");
  };

  const listen = () => {
    if (ending.current) return endLocally();
    setPhase("listening");
    if (listener.current) listener.current.paused = false;
    clearSilence();
    if (!promptedSilence.current && listener.current && !listener.current.muted) {
      silenceTimer.current = setTimeout(() => {
        promptedSilence.current = true;
        void send({ silence: true });
      }, SILENCE_PROMPT_MS);
    }
  };

  const showCaller = (entryId: string, text: string) => {
    shownCaller.current = entryId;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.id === entryId);
      if (i < 0) return [...ls, { id: entryId, speaker: "caller", text }];
      const next = ls.slice();
      const existing = next[i];
      if (!existing) return next;
      next[i] = { ...existing, text: `${existing.text} ${text}` };
      return next;
    });
  };

  const consume = async (events: AsyncGenerator<LiveEvent>) => {
    streaming.current = true;
    setPhase("thinking");
    try {
      for await (const ev of events) {
        if (ev.type === "user") {
          setLines((ls) => [...ls, { id: ev.entry.id, speaker: "user", text: ev.entry.text }]);
          setPhase("thinking");
        } else if (ev.type === "no_speech") {
          setError("Sorry, I didn’t catch that. Try again, or type your reply.");
        } else if (ev.type === "caller") {
          player.current?.enqueue({
            id: ev.utteranceId,
            url: initial.speechAvailable ? simulationService.aiVoiceUrl(sid, ev.utteranceId) : null,
            speak: voiceRef.current,
            text: ev.text,
            onStart: () => {
              setCallerSpeaking(true);
              if (listener.current) listener.current.callerSpeaking = true;
              setPhase("caller");
              showCaller(ev.entryId, ev.text);
            },
            onEnd: () => {},
          });
        } else if (ev.type === "done") {
          if (ev.ended) ending.current = true;
          setSavedFile(ev.session.transcriptFile);
        } else if (ev.type === "error") {
          setError(ev.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The call connection had a problem.");
    } finally {
      streaming.current = false;
      if (!player.current?.busy) idle();
    }
  };

  const idle = () => {
    setCallerSpeaking(false);
    if (listener.current) listener.current.callerSpeaking = false;
    if (streaming.current) return;
    if (ending.current) return endLocally();
    listen();
  };

  const send = async (
    reply: { audio: Blob } | { text: string } | { silence: true },
    interrupted = false,
  ) => {
    if (ending.current) return;
    clearSilence();
    setError(undefined);
    if (listener.current) listener.current.paused = true;
    setPhase("audio" in reply ? "sending" : "thinking");
    const heard = interrupted ? player.current?.heard.slice(-20) ?? [] : undefined;
    abort.current = new AbortController();
    await consume(
      simulationService.sayToAiCaller(
        sid,
        reply,
        interrupted ? { interrupted, heard: heard ?? [] } : {},
        abort.current.signal,
      ),
    );
  };

  const startMic = async () => {
    if (!MicListener.supported()) {
      setMic("unavailable");
      setError("Voice replies aren’t supported in this browser. You can type your replies instead.");
      return;
    }
    if (listener.current) {
      listener.current.paused = false;
      listener.current.muted = false;
      setMic("on");
      return;
    }
    let interruptedNext = false;
    const l = new MicListener({
      onSpeechStart: () => {
        clearSilence();
        if (player.current?.busy || streaming.current) {
          interruptedNext = true;
          player.current?.stop();
          abort.current?.abort();
          setCallerSpeaking(false);
        }
        setPhase("hearing");
      },
      onUtterance: (audio) => {
        const interrupted = interruptedNext;
        interruptedNext = false;
        void send({ audio }, interrupted);
      },
    });
    try {
      await l.start();
      listener.current = l;
      l.paused = streaming.current || !!player.current?.busy;
      setMic("on");
    } catch (e) {
      setMic("unavailable");
      setError(e instanceof Error ? e.message : "The microphone isn’t available. You can type your replies instead.");
    }
  };

  const answer = () => {
    unlockSpeech();
    player.current = new VoicePlayer(undefined, mode === "text" ? CHAT_PACE_MS : undefined);
    player.current.unlock();
    player.current.onIdle = idle;
    setAnsweredAt(Date.now());
    if (mode === "voice") void startMic();
    abort.current = new AbortController();
    void consume(simulationService.answerAiCall(sid, abort.current.signal));
  };

  const decline = async () => {
    try {
      await simulationService.declineAiCall(sid);
    } catch {
      // ending locally anyway
    }
    endLocally();
  };

  const hangUp = async () => {
    ending.current = true;
    endLocally();
    try {
      const v = await simulationService.hangUpAiCall(sid);
      setSavedFile(v.transcriptFile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t reach the practice server to end the call.");
    }
  };

  const close = () => {
    if (active) void simulationService.hangUpAiCall(sid).catch(() => {});
    endLocally();
    onClose();
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  useEffect(
    () => () => {
      clearTimeout(silenceTimer.current);
      abort.current?.abort();
      player.current?.stop();
      listener.current?.stop();
    },
    [],
  );

  const spotRedFlag = () => {
    setFlagsTapped((n) => n + 1);
    setFlagNote("Red flag noted. We’ll review it after the call.");
    setTimeout(() => setFlagNote(undefined), 4000);
    simulationService.spotRedFlag(sid, shownCaller.current).catch(() => {
      setFlagNote("Couldn’t save that flag. Try tapping again.");
    });
  };

  const toggleMute = () => {
    const l = listener.current;
    if (!l) {
      if (mic === "text") {
        voiceRef.current = true;
        setVoiceOn(true);
        void startMic();
      }
      return;
    }
    l.muted = !l.muted;
    setMic(l.muted ? "muted" : "on");
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await simulationService.finishAiCall(sid, difficulty, source);
      void navigate({ to: "/results" });
    } catch (e) {
      setFinishing(false);
      setError(e instanceof Error ? e.message : "Couldn’t load your results.");
    }
  };

  const secs = answeredAt && !callOver ? Math.max(0, Math.floor((now - answeredAt) / 1000)) : 0;
  const clock = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  const ringing = phase === "ringing";
  const activity = callerSpeaking
    ? "Caller is speaking"
    : phase === "hearing"
      ? "Listening to you"
      : phase === "listening"
        ? "Your turn"
        : phase === "sending"
          ? "Transcribing"
          : "Caller is responding";
  const typing = active && mic !== "on" && mic !== "off";
  const canType = typing && (phase === "listening" || phase === "hearing");
  const status =
    mic === "muted" && phase === "listening"
      ? "Your mic is muted. Type a reply, or unmute to talk."
      : mic === "text" && phase === "listening"
        ? "Your turn. Type your reply."
        : STATUS[phase];

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
          <p className="text-ink-foreground/60">Checking your choices against the scenario’s safety rules.</p>
        </div>
      ) : callOver ? (
        <div className="m-auto flex max-w-lg flex-col items-center gap-4 px-6 text-center">
          <Mascot mood="happy" size={130} />
          <h2 className="text-3xl font-black">This was a fake call.</h2>
          <p>A safe scam simulation, not a real request from T-Mobile. Your account wasn’t at risk.</p>
          <p role="status" className="text-sm text-ink-foreground/70">
            {error ??
              `${flagsTapped ? `You flagged ${flagsTapped} red flag${flagsTapped > 1 ? "s" : ""}. ` : ""}Your results show which tactics you caught and what to practice next.${savedFile ? " The call transcript was saved automatically." : ""}`}
          </p>
          <Button variant="hero" size="lg" onClick={finish}>
            See my results
          </Button>
        </div>
      ) : (
        <>
          <header className="flex items-center gap-3 p-4">
            <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-primary text-xl font-black">
              {!reduce && ringing && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-primary/30"
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              {initial.callerDisplay.replace(/\W/g, "")[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black">{initial.callerDisplay}</p>
              <p className="truncate text-sm text-ink-foreground/80">
                {ringing ? `Incoming · ${initial.callerNumber}` : `${clock} · ${activity}`}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-ink-foreground/10 px-3 py-1 text-xs font-bold text-ink-foreground/80">
              Demo · {label} · AI caller
            </span>
          </header>
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-4">
            {ringing ? (
              <p className="m-auto text-center text-lg">Fictional AI caller. Answer to start practicing.</p>
            ) : (
              <div ref={txRef} aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
                {lines.map((l) =>
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
                      {l.text}
                    </motion.p>
                  ),
                )}
                {(phase === "thinking" || phase === "sending") && lines.length > 0 && (
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2 text-base",
                      phase === "sending" ? "ml-auto bg-primary" : "bg-ink-foreground/15",
                    )}
                  >
                    <span aria-hidden>…</span>
                    <span className="sr-only">
                      {phase === "sending" ? "Transcribing your reply…" : "Waiting for the caller…"}
                    </span>
                  </p>
                )}
                {!lines.length && <p className="text-center text-sm text-ink-foreground/80">Connecting…</p>}
              </div>
            )}
            <p role="status" className="min-h-6 py-1 text-center text-sm text-ink-foreground/80">
              {error ?? flagNote ?? status}
            </p>
            {typing && (
              <div className="space-y-2 pb-2">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = draft.trim();
                    if (!t || !canType) return;
                    setDraft("");
                    void send({ text: t });
                  }}
                >
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={280}
                    placeholder="Type your reply…"
                    aria-label="Your reply to the caller. Don’t type real personal information."
                    className="h-12 rounded-2xl border-0 bg-ink-foreground/10 text-base text-ink-foreground placeholder:text-ink-foreground/70"
                  />
                  <Button
                    type="submit"
                    variant="hero"
                    size="icon"
                    className="size-12 shrink-0"
                    disabled={!draft.trim() || !canType}
                    aria-label="Send reply"
                  >
                    <Send />
                  </Button>
                </form>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 px-4 py-6">
            {ringing ? (
              <>
                <Button variant="destructive" size="icon" className="size-16" aria-label="Decline call" onClick={decline}>
                  <PhoneOff />
                </Button>
                <Button variant="mint" size="icon" className="size-16" aria-label="Answer call" onClick={answer}>
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
                    mic === "text"
                      ? "Switch to a voice call (uses your microphone)"
                      : mic === "unavailable"
                        ? "Microphone unavailable. Type your replies instead."
                        : mic === "muted"
                          ? "Unmute microphone"
                          : "Mute microphone"
                  }
                  aria-pressed={mic === "muted"}
                  disabled={mic === "unavailable" || mic === "off"}
                  onClick={toggleMute}
                >
                  {mic === "on" || mic === "text" ? <Mic /> : <MicOff />}
                </Button>
                <Button
                  variant="call"
                  size="icon"
                  className="size-14"
                  aria-label={voiceOn ? "Mute caller voice" : "Unmute caller voice"}
                  aria-pressed={!voiceOn}
                  onClick={() => {
                    voiceRef.current = !voiceOn;
                    setVoiceOn(!voiceOn);
                  }}
                >
                  {voiceOn ? <Volume2 /> : <VolumeX />}
                </Button>
                <Button variant="destructive" size="icon" className="size-16" aria-label="End call" onClick={hangUp}>
                  <PhoneOff />
                </Button>
                <Button
                  variant="call"
                  size="icon"
                  className="size-14"
                  aria-label={`That’s a red flag${flagsTapped ? ` (${flagsTapped} flagged)` : ""}`}
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
          <p>A safe scam simulation — not a real request from T-Mobile. Your account wasn't at risk.</p>
          <p className="text-sm text-ink-foreground/70">Your demo results help identify scam tactics to practice next.</p>
          <Button variant="hero" size="lg" onClick={finish}>
            See my results
          </Button>
        </div>
      ) : (
        <>
          <header className="flex items-center gap-3 p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-xl font-black">
              {sc.caller.replace(/\W/g, "")[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black">{sc.caller}</p>
              <p className="truncate text-sm text-ink-foreground/80">
                {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")} · {speaking ? "Caller is speaking" : "Practice call"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-ink-foreground/10 px-3 py-1 text-xs font-bold text-ink-foreground/80">
              Demo · {sc.label}
            </span>
          </header>
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-4">
            {notice && (
              <p role="status" className="rounded-xl bg-ink-foreground/10 px-3 py-2 text-center text-sm text-ink-foreground/80">
                {notice}
              </p>
            )}
            <div ref={txRef} aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
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
              {lines === 0 && <p className="text-center text-sm text-ink-foreground/80">Connecting…</p>}
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
            <Button variant="destructive" size="icon" className="size-16" aria-label="End call" onClick={end}>
              <PhoneOff />
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
}
