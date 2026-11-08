import { Bot, FileSearch, Flag, LockKeyhole, MessageSquare, Mic, ScrollText, Volume2 } from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";
import { ActiveCall, Briefing, type CallLine, CallOver, RingingCall } from "../ui/app";
import { clamp, FeatureCard, fontFamily, InkStage, Kicker, Phone, useSpring, Words } from "../ui/core";

/** 6 · Briefing before every call (components/safe/CallBriefing.tsx). */
export function BriefingScene() {
  const frame = useCurrentFrame();
  const enter = useSpring(0, { damping: 18, stiffness: 80 });
  const scroll = interpolate(frame, [70, 140], [0, 140], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const glow = (a: number, b: number) => interpolate(frame, [a, a + 8, b - 8, b], [0, 1, 1, 0], clamp);
  return (
    <InkStage>
      <Phone y={(1 - enter) * 120} scale={1.18} dark>
        <Briefing scroll={scroll} voiceGlow={glow(95, 145)} readGlow={glow(140, 185)} textPress={interpolate(frame, [186, 192, 198], [0, 1, 0], clamp)} />
      </Phone>
      <div style={{ position: "absolute", left: 90, top: 250, width: 560, display: "flex", flexDirection: "column", gap: 24 }}>
        <Kicker delay={6} light>
          Before every call
        </Kicker>
        <FeatureCard dark icon={<ScrollText size={28} />} title="Clearly a simulation" body="A plain-language briefing first: you can’t be scammed here." delay={16} />
        <FeatureCard dark icon={<Bot size={28} />} title="AI, disclosed up front" body="The caller is an AI, and the app says so before you begin." delay={42} />
      </div>
      <div style={{ position: "absolute", right: 90, top: 330, width: 560, display: "flex", flexDirection: "column", gap: 24 }}>
        <FeatureCard
          dark
          icon={<Mic size={28} />}
          title="Type or talk"
          body="Text chat by default, or a voice call with speech recognition and an AI voice."
          delay={92}
        />
        <FeatureCard dark icon={<Volume2 size={28} />} title="Read this to me" body="The briefing can be read aloud for anyone who’d rather listen." delay={138} />
      </div>
    </InkStage>
  );
}

// Caller lines: verbatim from a real AI practice call saved by the app
// (backend/data/call_transcripts/tmobile_unauthorized_change_20261108_105000_4a3116_transcript.txt);
// c3 drops its opening "You're welcome." because the reply it answered is skipped.
const SCRIPT: { id: string; speaker: "caller" | "user"; text: string; at: number; typeFrom?: number }[] = [
  {
    id: "c1",
    speaker: "caller",
    text: "Hi, yes, am I speaking with the account holder? This is Jordan with T-Mobile Account Services, calling about an urgent security alert on your line.",
    at: 56,
  },
  { id: "u1", speaker: "user", text: "Hey, this is the account holder.", at: 118, typeFrom: 84 },
  {
    id: "c2",
    speaker: "caller",
    text: "Okay, great. We’re seeing some suspicious activity on your account right now—someone just added a new line and ordered an iPhone 16 Pro Max, and it’s scheduled to ship out today. Did you authorize that?",
    at: 150,
  },
  { id: "u2", speaker: "user", text: "Um no, I didn’t.", at: 244, typeFrom: 220 },
  {
    id: "c3",
    speaker: "caller",
    text: "To get this stopped and secure your account against whoever accessed it, I just need to verify your identity with the one-time passcode that was just sent to your phone. Can you read that back to me?",
    at: 276,
  },
  { id: "u3", speaker: "user", text: "Um, I’m not sure you’re real. T-Mobile says that they’ll never call me for a one-time password.", at: 418, typeFrom: 346 },
  {
    id: "c4",
    speaker: "caller",
    text: "I completely understand why you’d be cautious, but if I don’t get this code right now, that phone ships out and you’re going to be billed for it. Just read me the numbers so we can cancel this order before it’s too late.",
    at: 452,
  },
  { id: "u4", speaker: "user", text: "I know a scam when I see one.", at: 560, typeFrom: 526 },
];
const FLAGS = [
  { at: 190, tactic: "Fear about your account or money" },
  { at: 320, tactic: "Asked for a one-time code or PIN" },
  { at: 496, tactic: "Countdown pressure" },
];
const ANSWER = 30;
const HANG_UP = 600;

/** 7 · The live call: the app's AiCall screen replaying a real AI conversation. */
export function LiveCall() {
  const frame = useCurrentFrame();
  const enter = useSpring(0, { damping: 18, stiffness: 80 });
  const lines: CallLine[] = SCRIPT.map((l) => ({ ...l, p: interpolate(frame, [l.at, l.at + 14], [0, 1], clamp) })).filter((l) => l.p > 0);

  // "…" while the caller is responding: from the previous user line (or answer) to the caller line.
  const callerTurns = SCRIPT.filter((l) => l.speaker === "caller");
  let thinking = 0;
  for (const c of callerTurns) {
    const prev = SCRIPT[SCRIPT.indexOf(c) - 1];
    const start = (prev?.at ?? ANSWER) + 6;
    if (frame >= start && frame < c.at + 4) thinking = Math.min(interpolate(frame, [start, start + 8], [0, 1], clamp), interpolate(frame, [c.at - 2, c.at + 4], [1, 0], clamp));
  }

  // Typing into the reply box, then a tap on Send.
  let draft = "";
  let sendPress = 0;
  for (const u of SCRIPT.filter((l) => l.typeFrom !== undefined)) {
    const end = u.at - 6;
    if (frame >= u.typeFrom! && frame < u.at) {
      const n = Math.round(interpolate(frame, [u.typeFrom!, end], [0, u.text.length], clamp));
      draft = u.text.slice(0, n);
      sendPress = interpolate(frame, [end, end + 3, u.at], [0, 1, 0], clamp);
    }
  }

  const flagPress = Math.max(...FLAGS.map((f) => interpolate(frame, [f.at, f.at + 4, f.at + 12], [0, 1, 0], clamp)));
  const lastFlag = [...FLAGS].reverse().find((f) => frame >= f.at);
  const flagNote = lastFlag && frame < lastFlag.at + 120 ? "Red flag noted. We’ll review it after the call." : undefined;
  const callerResponding = thinking > 0.5;
  const status = flagNote ?? (callerResponding ? "The caller is responding…" : "Your turn. Type your reply.");
  const secs = Math.max(0, Math.floor((frame - ANSWER) / 30));
  const clock = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  const answered = interpolate(frame, [ANSWER - 4, ANSWER + 6], [0, 1], clamp);
  const endPress = interpolate(frame, [HANG_UP, HANG_UP + 5, HANG_UP + 14], [0, 1, 0], clamp);
  const push = interpolate(frame, [0, 660], [1.1, 1.16]);

  return (
    <InkStage>
      <Phone x={-250} y={(1 - enter) * 120} scale={push} dark shadow={1.4}>
        <div style={{ position: "absolute", inset: 0, opacity: 1 - answered }}>
          <RingingCall ring={(frame % 48) / 48} answerPress={interpolate(frame, [ANSWER - 12, ANSWER - 6, ANSWER], [0, 1, 0], clamp)} />
        </div>
        <div style={{ position: "absolute", inset: 0, opacity: answered }}>
          <ActiveCall
            clock={clock}
            activity={callerResponding ? "Caller is responding" : "Your turn"}
            lines={lines}
            thinking={thinking}
            status={status}
            draft={draft}
            flagPress={flagPress}
            sendPress={sendPress}
            endPress={endPress}
          />
        </div>
      </Phone>

      {/* Flags the learner tapped, collected beside the phone. */}
      <div style={{ position: "absolute", left: 20, top: 300, width: 450, display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-end" }}>
        {FLAGS.map((f) => (
          <FlagChip key={f.tactic} text={f.tactic} delay={f.at + 4} />
        ))}
      </div>

      <div style={{ position: "absolute", left: 1150, top: 120, width: 700, display: "flex", flexDirection: "column", gap: 20 }}>
        <Kicker delay={10} light>
          A live practice call
        </Kicker>
        <Words text="It talks back." delay={16} stagger={4} className="text-ink-foreground" style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.05, marginBottom: 6 }} />
        <FeatureCard dark icon={<MessageSquare size={28} />} title="Written live by AI" body="Each caller line is generated in the moment, so no two calls play out the same." delay={70} active={frame < 160 ? 1 : 0.6} />
        <FeatureCard dark icon={<FileSearch size={28} />} title="Grounded in real scams" body="Patterns from 568 redacted FTC robocall transcripts, with 4 matched to every call." delay={160} active={frame >= 160 && frame < 300 ? 1 : 0.6} />
        <FeatureCard dark icon={<Flag size={28} />} title="Spot it as it happens" body="Tap 🚩 the moment something feels off. Your flags shape the debrief." delay={196} active={frame >= 300 && frame < 440 ? 1 : 0.6} />
        <FeatureCard dark icon={<LockKeyhole size={28} />} title="Private by design" body="Numbers you type are removed before they’re used or saved." delay={440} active={frame >= 440 ? 1 : 0.6} />
      </div>

      <p
        className="text-ink-foreground/60"
        style={{ position: "absolute", left: 60, bottom: 28, fontFamily, fontSize: 19, fontWeight: 600, opacity: interpolate(frame, [80, 100], [0, 1], clamp) }}
      >
        Caller lines are from a real AI practice call (Google Gemini). Names and numbers are fictional.
      </p>
    </InkStage>
  );
}

function FlagChip({ text, delay }: { text: string; delay: number }) {
  const s = useSpring(delay, { damping: 12, stiffness: 150 });
  if (s <= 0.001) return null;
  return (
    <span
      className="bg-primary text-primary-foreground shadow-pop"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 20px",
        borderRadius: 999,
        fontFamily,
        fontSize: 20,
        fontWeight: 800,
        whiteSpace: "nowrap",
        transform: `translateX(${(1 - s) * 60}px) scale(${0.6 + 0.4 * s})`,
        opacity: s,
      }}
    >
      <Flag size={20} />
      {text}
    </span>
  );
}

/** 8 · Call over: the app always says plainly that it was a fake call. */
export function CallOverScene() {
  const frame = useCurrentFrame();
  return (
    <InkStage>
      <Phone x={330} scale={1.16} dark shadow={1.3}>
        <CallOver press={interpolate(frame, [104, 110, 118], [0, 1, 0], clamp)} />
      </Phone>
      <div style={{ position: "absolute", left: 140, top: 340, width: 760 }}>
        <Kicker delay={4} light>
          When you hang up
        </Kicker>
        <Words text="Every call ends with the truth." delay={10} stagger={4} className="text-ink-foreground" style={{ fontSize: 80, fontWeight: 900, lineHeight: 1.05, marginTop: 18 }} accent={["truth"]} />
        <Words
          text="“This was a fake call.” Your account was never at risk."
          delay={34}
          stagger={2}
          className="text-ink-foreground/70"
          style={{ fontSize: 32, fontWeight: 600, marginTop: 24 }}
        />
      </div>
    </InkStage>
  );
}

