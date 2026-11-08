import { ClipboardCheck, FileText, Heart, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { AppShellFrame, ResultsPage } from "../ui/app";
import { CanvasStage, clamp, FeatureCard, fontFamily, Kicker, LogoMark, Penny, Phone, Shot, useProgress, useSpring, Words } from "../ui/core";
import { Pill } from "./Intro";

/** 9 · Debrief (routes/results.tsx): fixed-rubric score, outcomes, red flags. */
export function Debrief() {
  const frame = useCurrentFrame();
  const enter = useSpring(0, { damping: 18, stiffness: 80 });
  // ScoreRing sweeps for 1.2 s with an ease-out, as in the app.
  const ring = useProgress(34, 36);
  const s1 = interpolate(frame, [104, 160], [0, 640], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const s2 = interpolate(frame, [196, 240], [0, 400], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const chips = interpolate(frame, [228, 272], [0, 1], clamp);
  return (
    <CanvasStage>
      <div style={{ position: "absolute", left: 130, top: 160, width: 840, display: "flex", flexDirection: "column", gap: 22 }}>
        <Kicker delay={6}>Your debrief</Kicker>
        <Words text="Feedback you can trust." delay={12} stagger={4} className="text-foreground" style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.04, marginBottom: 18 }} accent={["trust."]} />
        <FeatureCard icon={<Scale size={28} />} title="Scored by fixed safety rules" body="Not the AI’s opinion. The same rubric every time, and lower is better." delay={40} active={frame < 110 ? 1 : 0.55} />
        <FeatureCard icon={<ClipboardCheck size={28} />} title="What went well, what to practice next" body="Learning outcomes and the red flags you caught or missed, in plain language." delay={108} active={frame >= 110 && frame < 200 ? 1 : 0.55} />
        <FeatureCard icon={<FileText size={28} />} title="Transcript saved automatically" body="Every line kept for review. No downloads, no save prompts." delay={196} active={frame >= 200 ? 1 : 0.55} />
      </div>
      <Phone x={470} y={(1 - enter) * 120} scale={1.12} tilt={-8 + enter * 4}>
        <AppShellFrame active="" scroll={s1 + s2}>
          <ResultsPage ring={ring} chips={chips} />
        </AppShellFrame>
      </Phone>
    </CanvasStage>
  );
}

/** 10 · Progress and team insight (real screenshots). */
export function Insight() {
  const frame = useCurrentFrame();
  const a = useSpring(8, { damping: 18, stiffness: 80 });
  const b = useSpring(24, { damping: 18, stiffness: 80 });
  const drift = interpolate(frame, [0, 195], [0, -24]);
  return (
    <CanvasStage>
      <div style={{ position: "absolute", top: 60, width: "100%", textAlign: "center" }}>
        <Words text="Confidence you can see." delay={4} stagger={4} className="text-foreground" style={{ fontSize: 76, fontWeight: 900 }} />
      </div>
      <Tag x={-330} y={-330} text="For customers · Safety roadmap" delay={16} />
      <Tag x={330} y={-330} text="For T-Mobile teams · Analysts board" delay={32} />
      <Phone x={-330} y={110 + drift + (1 - a) * 700} scale={0.86} rotate={-2} tilt={8}>
        <Shot name="progress" />
      </Phone>
      <Phone x={330} y={110 - drift + (1 - b) * 700} scale={0.86} rotate={2} tilt={-8}>
        <Shot name="analysts" />
      </Phone>
      <p
        className="text-muted-foreground"
        style={{ position: "absolute", bottom: 26, width: "100%", textAlign: "center", fontFamily, fontSize: 20, fontWeight: 600, opacity: interpolate(frame, [40, 60], [0, 1], clamp) }}
      >
        Analysts board shown with illustrative demo data.
      </p>
    </CanvasStage>
  );
}

function Tag({ x, y, text, delay }: { x: number; y: number; text: string; delay: number }) {
  const s = useSpring(delay);
  return (
    <div
      className="glass-surface text-primary-deep"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: `translate(-50%, -50%) translate(${x}px, ${y + (1 - s) * 20}px)`,
        opacity: s,
        padding: "10px 22px",
        borderRadius: 999,
        border: "1px solid var(--glass-border)",
        fontFamily,
        fontSize: 18,
        fontWeight: 900,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        zIndex: 5,
      }}
    >
      {text}
    </div>
  );
}

/** 11 · Close: brand, promise, trust pillars. */
export function Close() {
  const frame = useCurrentFrame();
  const logo = useSpring(4, { damping: 12, stiffness: 110 });
  const end = interpolate(frame, [195, 225], [1, 0], clamp);
  return (
    <CanvasStage>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily, opacity: end }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, transform: `scale(${0.9 + 0.1 * logo})`, opacity: logo }}>
          <LogoMark size={150} />
          <p className="text-foreground" style={{ fontSize: 104, fontWeight: 800, margin: 0 }}>
            Pinky <span className="text-primary">Promise</span>
          </p>
        </div>
        <Words
          text="Practice the call before the real one comes."
          delay={20}
          stagger={3}
          className="text-foreground"
          style={{ fontSize: 58, fontWeight: 800, marginTop: 30, textAlign: "center" }}
          accent={["Practice"]}
        />
        <div style={{ display: "flex", gap: 18, marginTop: 56 }}>
          <Pill text="Clearly labeled simulations" delay={60} icon={<ShieldCheck size={26} />} />
          <Pill text="No real personal data" delay={74} icon={<Heart size={26} />} />
          <Pill text="Your codes stay yours" delay={88} icon={<LockKeyhole size={26} />} />
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", right: 120, bottom: 70, opacity: end }}>
        <Penny mood="loving" size={230} delay={40} />
      </div>
    </CanvasStage>
  );
}
