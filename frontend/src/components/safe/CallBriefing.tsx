import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { Mascot } from "@/components/safe/Mascot";
import { Button } from "@/components/ui/button";
import { speakLine } from "@/lib/call-voice";
import type { OutcomeDefinition } from "@/lib/simulator-api";

/**
 * Shown before every practice call. Learners play themselves receiving the call
 * ("learning by doing"), so the purpose and safety are spelled out first in
 * plain language, along with the explicit outcomes the debrief will assess.
 */
export function CallBriefing({
  title,
  outcomes,
  handsOnFlags,
  onStart,
  onCancel,
}: {
  title: string;
  outcomes: OutcomeDefinition[];
  handsOnFlags: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  const [reading, setReading] = useState<AbortController | null>(null);
  useEffect(() => () => reading?.abort(), [reading]);
  // Escape closes, like the call screens it opens.
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);

  // handsOnFlags is false only for the scripted fallback, which plays without replies.
  const steps = handsOnFlags
    ? [
        "Reply as yourself. Never use real details.",
        "Tap 🚩 when something feels off.",
        "Hang up anytime.",
      ]
    : ["Listen for the tricks.", "Hang up anytime."];
  const script = [
    "You can’t be scammed here.",
    `This is a practice call: ${title}. No real person is calling.`,
    `You’ll practice: ${outcomes.map((o) => o.title).join("; ")}.`,
    steps.join(" "),
  ].join(" ");

  const toggleRead = () => {
    if (reading) {
      reading.abort();
      setReading(null);
      return;
    }
    const ac = new AbortController();
    setReading(ac);
    void speakLine(script, { enabled: true, signal: ac.signal }).then(() =>
      setReading((r) => (r === ac ? null : r)),
    );
  };

  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-labelledby="briefing-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink bg-call-glow text-ink-foreground"
    >
      <div className="flex items-center justify-between p-4 text-sm font-bold text-ink-foreground/70">
        <span className="rounded-full bg-ink-foreground/10 px-3 py-1">
          Before your practice call
        </span>
      </div>
      <div className="m-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 pb-8 text-center">
        <Mascot mood="loving" size={110} />
        <h2 id="briefing-title" className="text-3xl font-black">
          You can’t be scammed here.
        </h2>
        <p>“{title}” is a practice call. No real person is calling.</p>

        <section
          aria-labelledby="practice-heading"
          className="w-full space-y-2 rounded-3xl bg-ink-foreground/5 p-4 text-left"
        >
          <h3 id="practice-heading" className="font-black">
            You’ll practice
          </h3>
          <ul className="list-disc space-y-1 pl-5">
            {outcomes.map((o) => (
              <li key={o.id}>{o.title}</li>
            ))}
          </ul>
          <h3 className="pt-2 font-black">How it works</h3>
          <ul className="list-disc space-y-1 pl-5">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>

        <Button variant="hero" size="lg" onClick={onStart}>
          Start the call
        </Button>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="call" onClick={toggleRead} aria-pressed={!!reading}>
            {reading ? <VolumeX /> : <Volume2 />} {reading ? "Stop reading" : "Read this to me"}
          </Button>
          <Button variant="call" onClick={onCancel}>
            Not now
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
