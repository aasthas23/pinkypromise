import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Flag, PhoneCall, Sparkles, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mascot, MascotBubble } from "@/components/safe/Mascot";
import { ScoreRing } from "@/components/safe/ScoreRing";
import { useDemo } from "@/lib/store";
import { scenarios } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/results")({
  head: () => ({ meta: [{ title: "Simulation Results — Pinky Promise" }, { name: "description", content: "See your scam vulnerability score, the tactics used, and how to improve." }, { property: "og:title", content: "Simulation Results — Pinky Promise" }, { property: "og:description", content: "See your scam vulnerability score, the tactics used, and how to improve." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Results,
});

const ALL_TACTICS = ["Urgency", "Authority", "Fear", "Too-good-to-be-true offer", "Requests for verification codes"];

function Results() {
  const { lastResult: r } = useDemo();
  const [open, setOpen] = useState(false);
  if (!r) return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-[2rem] bg-card p-10 text-center shadow-soft">
      <Mascot mood="curious" size={130} /><h1 className="text-2xl font-black">No results yet</h1><p className="text-muted-foreground">Finish a practice call and your personalized breakdown shows up here.</p>
      <Button asChild variant="hero" size="lg"><Link to="/practice"><PhoneCall /> Start practicing</Link></Button>
    </div>
  );
  const sc = scenarios.find((s) => s.id === r.difficulty);
  if (!sc) return null;
  // Live calls carry what was actually said; the scripted demo falls back to the scenario script.
  const lines = r.transcript ?? sc.script.map((l) => ({ who: l.who, text: l.text, ...(l.flag ? { flag: l.flag } : {}) }));
  const level = r.score < 34 ? { t: "Low risk", c: "var(--mint-foreground)", tr: "var(--mint)" } : r.score < 60 ? { t: "Moderate risk", c: "var(--peach-foreground)", tr: "var(--peach)" } : { t: "High risk", c: "var(--destructive)", tr: "var(--pink)" };

  return (
    <div className="space-y-6">
      <p role="status" className="rounded-xl bg-mint p-4 font-bold text-mint-foreground">This was a fake call — a safe scam simulation, not a real T-Mobile account call.</p>
      <h1 className="text-3xl font-black md:text-4xl">Nice work! Let's see how you did.</h1>
      {r.outcomeTitle && <section className="rounded-3xl bg-card p-6 shadow-soft"><h2 className="text-lg font-black">{r.outcomeTitle}</h2>{r.outcomeSummary && <p className="mt-1 text-muted-foreground">{r.outcomeSummary}</p>}{r.aiCaller && <p className="mt-2 text-xs text-muted-foreground">{r.provenance ?? "The caller’s lines were written live by AI."} Your score comes from the training’s fixed safety rules, not from the AI’s judgment.</p>}</section>}
      <section className="flex flex-col items-center gap-6 rounded-[2rem] bg-pink p-6 text-center">
        <ScoreRing value={r.score} size={220} stroke={20} color={level.c} track="var(--card)" label={`Vulnerability score ${r.score} of 100`}>
          <div><motion.p initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 }} className="text-6xl font-black">{r.score}</motion.p><p className="text-sm font-bold text-muted-foreground">vulnerability</p></div>
        </ScoreRing>
        <div>
          <span className="rounded-full px-3 py-1 text-sm font-black" style={{ background: level.tr, color: level.c }}>{level.t}</span>
          <p className="mt-3 text-lg"><b>Lower is better.</b> A low vulnerability score means you resisted scam tactics. A higher score means the caller influenced you more.</p>
          <div className="mt-4"><MascotBubble mood={r.score < 34 ? "happy" : "loving"} size={80}>{r.score < 34 ? "You crushed it! Scammers don't stand a chance." : "Good instincts! A couple of tricks almost got you — let's train them."}</MascotBubble></div>
        </div>
      </section>

      {r.outcomes && r.outcomes.length > 0 && (
        <section className="rounded-3xl bg-card p-6 shadow-soft"><h2 className="flex items-center gap-2 text-lg font-black"><CheckCircle2 className="size-5" />What You Practiced</h2>
          <ul className="mt-3 space-y-2">{r.outcomes.map((o) => (
            <li key={o.title} className={cn("rounded-2xl px-4 py-2", o.achieved ? "bg-mint" : o.achieved === false ? "bg-peach" : "bg-muted")}>
              <p className="font-semibold">{o.title} · {o.achieved ? "Done" : o.achieved === false ? "Practice next" : "Not practiced this time"}</p>
              <p className="text-sm">{o.detail}</p>
            </li>))}</ul></section>
      )}

      {r.cues && r.cues.spotted.length + r.cues.missed.length > 0 && (
        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="flex items-center gap-2 text-lg font-black"><Flag className="size-5" />Red Flags You Spotted · {r.cues.spotted.length} of {r.cues.spotted.length + r.cues.missed.length}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.cues.spotted.map((t) => <span key={t} className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Flag className="size-4" aria-hidden />{t}<span className="sr-only"> (spotted)</span></span>)}
            {r.cues.missed.map((t) => <span key={t} className="rounded-full bg-muted px-4 py-2 text-sm font-bold text-muted-foreground">{t}<span className="sr-only"> (missed)</span></span>)}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{r.cues.missed.length ? "🚩 Highlighted: tactics you flagged. Grey: tactics to watch for next time." : "You flagged every tactic the caller used."}</p>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-3xl bg-mint p-6"><h2 className="flex items-center gap-2 text-lg font-black text-mint-foreground"><ThumbsUp className="size-5" />What You Did Well</h2>
          <ul className="mt-3 space-y-2">{r.wentWell.map((w) => <li key={w} className="rounded-2xl bg-card/70 px-4 py-2 font-semibold">{w}</li>)}</ul></section>
        <section className="rounded-3xl bg-peach p-6"><h2 className="flex items-center gap-2 text-lg font-black text-peach-foreground"><AlertTriangle className="size-5" />Watch Out For</h2>
          <ul className="mt-3 space-y-2">{r.watchOut.map((w) => <li key={w} className="rounded-2xl bg-card/70 px-4 py-2 font-semibold">{w}</li>)}</ul></section>
      </div>

      <section className="rounded-3xl bg-card p-6 shadow-soft">
        <h2 className="text-lg font-black">Tactics Used Against You</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ALL_TACTICS.map((t, i) => { const used = r.tactics.includes(t); return (
            <motion.span key={t} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 * i, type: "spring" }}
              className={cn("rounded-full px-4 py-2 text-sm font-bold", used ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground line-through")}>{t}</motion.span>); })}
        </div>
      </section>

      <section className="rounded-3xl bg-card shadow-soft">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between p-6 text-left text-lg font-black">Call transcript <ChevronDown className={cn("transition-transform", open && "rotate-180")} /></button>
        {open && <div className="space-y-2 px-6 pb-6">{lines.map((l, i) => (
          <div key={i} className={cn("rounded-2xl px-4 py-2 text-sm", l.flag ? "border-l-4 border-primary bg-pink" : "bg-muted")}>
            {l.who === "system" ? <i>{l.text}</i> : <><b>{l.who === "caller" ? "Caller" : "You"}:</b> {l.text}</>}{l.flag && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{l.flag}</span>}
          </div>))}{r.transcriptFile && <p className="text-xs text-muted-foreground">Saved automatically as {r.transcriptFile.split("/").pop()}</p>}</div>}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="hero" size="xl"><Link to="/progress"><Sparkles /> See My Progress</Link></Button>
        <Button asChild variant="soft" size="xl"><Link to="/practice">Try Again</Link></Button>
      </div>
    </div>
  );
}
