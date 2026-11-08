import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Gift, Headset, Mic, MicOff, PhoneOff, Siren, Clock, Captions } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mascot, MascotBubble } from "@/components/safe/Mascot";
import { PageTitle } from "@/components/safe/AppShell";
import { scenarios, type Difficulty } from "@/lib/mock-data";
import { simulationService } from "@/lib/services";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useDemo } from "@/lib/store";
import { callPreferencesService } from "@/lib/services";
import { nextCallDate } from "@/lib/analytics";

export const Route = createFileRoute("/practice")({
  head: () => ({ meta: [{ title: "Scam Call Simulator — Pinky Promise" }, { name: "description", content: "Practice spotting scam tactics with safe, fictional training calls." }, { property: "og:title", content: "Scam Call Simulator — Pinky Promise" }, { property: "og:description", content: "Practice spotting scam tactics with safe, fictional training calls." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
      <MascotBubble mood="bounce" size={100}>Let's practice together! I'll help you spot the tricks.</MascotBubble>
      <section className="mt-4 border-y border-mint-foreground/15 bg-mint/45 px-4 py-5">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-black">Biweekly scam simulations</h2><p className="mt-1 text-sm text-muted-foreground">One call every two weeks · optional</p></div><Switch id="biweekly-calls" aria-label="Opt in to biweekly calls" checked={s.biweeklyOptIn} onCheckedChange={callPreferencesService.setBiweeklyOptIn} /></div>
        <p className="mt-3 text-sm text-muted-foreground">With your permission, T-Mobile would send simulated scam calls and disclose that the call was fake at the end. Results help analysts understand which tactics need more practice. You can opt out anytime.</p>
        <p role="status" className="mt-3 font-bold text-primary-deep">{s.biweeklyOptIn ? "You're opted in" : "You're opted out"}</p>
        {s.biweeklyOptIn && nextDate && <p className="mt-1 text-sm text-muted-foreground">Next practice call: {new Date(nextDate).toLocaleDateString()}</p>}
        {s.biweeklyOptIn && <Button variant="soft" className="mt-3" onClick={() => { setSource("biweekly"); setInCall(true); }}>Preview a biweekly call</Button>}
        <p className="mt-3 text-xs text-muted-foreground">Practice preference only. No real calls are scheduled or placed.</p>
      </section>
      <h2 className="mt-6 text-xl font-black">Start a practice call</h2>
      <p className="mt-1 text-sm text-muted-foreground">Explore calls you might receive from someone claiming to be T-Mobile.</p>
      <div role="radiogroup" aria-label="Difficulty" className="mt-6 space-y-3">
        {scenarios.map((s) => {
          const Icon = icons[s.id]; const on = pick === s.id;
          return (
            <Button variant="ghost" key={s.id} role="radio" aria-checked={on} onClick={() => setPick(s.id)}
              className={cn("h-auto w-full whitespace-normal rounded-2xl border-2 p-4 text-left shadow-soft transition-colors", on ? "border-primary bg-pink" : "border-border bg-card/85")}>
              <div className="flex items-start gap-3">
                <span className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-full", on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}><Icon /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em]"><span className="text-primary-deep">{s.label}</span><span className="flex items-center gap-1 text-muted-foreground"><Clock className="size-3" />{s.duration}</span></div>
                  <h3 className="mt-2 text-lg font-black">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.blurb}</p>
                </div>
              </div>
            </Button>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button variant="hero" size="lg" className="w-full sm:w-auto" onClick={() => { setSource("practice"); setInCall(true); }}>Start Practice Call</Button>
        <p className="text-sm text-muted-foreground">Practice simulation · scripted, fictional, nothing is recorded.</p>
      </div>
      <AnimatePresence>{inCall && <CallScreen difficulty={pick} source={source} onClose={() => setInCall(false)} />}</AnimatePresence>
    </div>
  );
}

function CallScreen({ difficulty, source, onClose }: { difficulty: Difficulty; source: "practice" | "biweekly"; onClose: () => void }) {
  const sc = scenarios.find((s) => s.id === difficulty) ?? scenarios[0];
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [secs, setSecs] = useState(0);
  const [lines, setLines] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showTx, setShowTx] = useState(true);
  const [ending, setEnding] = useState(false);
  const [disclosed, setDisclosed] = useState(false);
  const txRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!sc || lines >= sc.script.length) return;
    const t = setTimeout(() => setLines((l) => l + 1), lines === 0 ? 900 : 2200);
    return () => clearTimeout(t);
  }, [lines, sc]);
  useEffect(() => { txRef.current?.scrollTo({ top: 99999, behavior: "smooth" }); }, [lines]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  if (!sc) return null;
  const end = () => setDisclosed(true);
  const finish = async () => { setEnding(true); await simulationService.evaluate(difficulty, source); navigate({ to: "/results" }); };
  const speaking = lines < sc.script.length && sc.script[lines]?.who === "caller";

  return (
    <motion.div role="dialog" aria-modal aria-label="Practice call" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-ink bg-call-glow text-ink-foreground">
      {ending ? (
        <div className="m-auto flex flex-col items-center gap-4 text-center"><Mascot mood="think" size={140} /><p className="text-xl font-black">Analyzing your call…</p><p className="text-ink-foreground/60">Our mock AI coach is reviewing the tactics.</p></div>
      ) : disclosed ? (
        <div className="m-auto flex max-w-lg flex-col items-center gap-4 px-6 text-center"><Mascot mood="happy" size={130} /><h2 className="text-3xl font-black">This was a fake call.</h2><p>A safe scam simulation — not a real request from T-Mobile. Your account wasn't at risk.</p><p className="text-sm text-ink-foreground/70">Your demo results help identify scam tactics to practice next.</p><Button variant="hero" size="lg" onClick={finish}>See my results</Button></div>
      ) : (<>
        <div className="flex items-center justify-between p-4 text-sm font-bold text-ink-foreground/70"><span className="rounded-full bg-ink-foreground/10 px-3 py-1">Practice call · {sc.label}</span><span aria-live="off">{String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</span></div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <div className="relative">
            {!reduce && <motion.span className="absolute inset-0 rounded-full bg-primary/30" animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
            <span className="relative grid size-28 place-items-center rounded-full bg-primary text-4xl font-black">{sc.caller.replace(/\W/g, "")[0]}</span>
          </div>
          <div className="text-center"><p className="text-2xl font-black">{sc.caller}</p><p className="text-ink-foreground/60">Unknown number · fictional caller</p></div>
          <div className="flex h-16 items-center gap-1.5" aria-hidden>
            {Array.from({ length: 28 }).map((_, i) => (
              <motion.span key={i} className="w-1.5 rounded-full bg-primary" animate={reduce ? { height: 12 } : { height: speaking ? [8, 20 + ((i * 37) % 44), 8] : [6, 10, 6] }}
                transition={{ duration: 0.6 + (i % 5) * 0.1, repeat: Infinity, ease: "easeInOut" }} />
            ))}
          </div>
          {showTx && (
            <div ref={txRef} aria-live="polite" className="max-h-56 w-full max-w-lg space-y-2 overflow-y-auto rounded-3xl bg-ink-foreground/5 p-4">
              {sc.script.slice(0, lines).map((l, i) => (
                <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("max-w-[85%] rounded-2xl px-4 py-2 text-sm", l.who === "caller" ? "bg-ink-foreground/10" : "ml-auto bg-primary")}>{l.text}</motion.p>
              ))}
              {lines === 0 && <p className="text-center text-sm text-ink-foreground/50">Connecting…</p>}
              {lines >= sc.script.length && <p role="status" className="rounded-xl bg-mint p-3 font-bold text-mint-foreground">This was a fake call — a safe scam simulation.</p>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-5 p-8">
          <Button variant="call" size="icon" className="size-14" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? <MicOff /> : <Mic />}</Button>
          <Button variant="destructive" size="icon" className="size-16" aria-label="End call" onClick={end}><PhoneOff /></Button>
          <Button variant="call" size="icon" className="size-14" aria-label="Toggle transcript" aria-pressed={showTx} onClick={() => setShowTx(!showTx)}><Captions /></Button>
        </div>
      </>)}
    </motion.div>
  );
}
