import { ClipboardCheck, FileText, Heart, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { AppShellFrame, ResultsPage } from "../ui/app";
import { CanvasStage, clamp, FeatureCard, fontFamily, Kicker, LogoMark, Penny, Phone, SCREEN_H, SCREEN_W, Shot, useProgress, useSpring, Words } from "../ui/core";
import { Pill } from "./Intro";
// Section positions measured by scripts/capture.mjs on the real dashboard.
import dash from "../../public/shots/analytics-full.json";

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

const STOPS = [
  "Penny's Intelligence Brief",
  "Scam tactic effectiveness",
  "Department exposure heatmap",
  "Fleet vulnerability trend",
  "Coaching priorities",
  "Department comparison",
];
const FIRST_STOP = 96;
const PER_STOP = 34;

/** 10 · Progress for customers, and the Employee Analytics dashboard for teams (real captures). */
export function Insight() {
  const frame = useCurrentFrame();
  const a = useSpring(8, { damping: 18, stiffness: 80 });
  const b = useSpring(24, { damping: 18, stiffness: 80 });
  const drift = interpolate(frame, [0, 315], [0, -24]);

  // Scroll the dashboard from stop to stop: glide for 20 frames, hold for the rest.
  const maxScroll = dash.height - SCREEN_H;
  const target = (title: string) => {
    const y = dash.sections.find((x) => x.title === title)?.y ?? 0;
    return Math.min(maxScroll, Math.max(0, y - dash.headerH - 18));
  };
  let scroll = 0;
  let current = -1;
  STOPS.forEach((title, i) => {
    const start = FIRST_STOP + i * PER_STOP;
    if (frame >= start) {
      const from = i === 0 ? 0 : target(STOPS[i - 1]!);
      scroll = interpolate(frame, [start, start + 20], [from, target(title)], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
      current = i;
    }
  });
  const focusDash = interpolate(frame, [FIRST_STOP - 20, FIRST_STOP], [0, 1], clamp);

  return (
    <CanvasStage>
      <div style={{ position: "absolute", top: 60, width: "100%", textAlign: "center" }}>
        <Words text="Confidence you can see." delay={4} stagger={4} className="text-foreground" style={{ fontSize: 76, fontWeight: 900 }} />
      </div>
      <Tag x={-330} y={-330} text="For customers · Safety roadmap" delay={16} />
      <Tag x={330} y={-330} text="For T-Mobile teams · Employee Analytics" delay={32} />
      <Phone x={-330 - focusDash * 40} y={110 + drift + (1 - a) * 700} scale={0.86 - focusDash * 0.04} rotate={-2} tilt={8} style={{ opacity: 1 - focusDash * 0.35 }}>
        <Shot name="progress" />
      </Phone>
      <Phone x={330 - focusDash * 20} y={110 - drift - focusDash * 12 + (1 - b) * 700} scale={0.86 + focusDash * 0.03} rotate={2 - focusDash * 2} tilt={-8 + focusDash * 4}>
        <ScrollShot scroll={scroll} />
      </Phone>
      <div style={{ position: "absolute", left: 1555, top: 330, display: "flex", flexDirection: "column", gap: 12, opacity: focusDash }}>
        {STOPS.map((title, i) => (
          <SectionItem key={title} text={title} on={i === current} seen={i < current} delay={FIRST_STOP - 14 + i * 3} />
        ))}
      </div>
      <p
        className="text-muted-foreground"
        style={{ position: "absolute", bottom: 26, left: 60, fontFamily, fontSize: 20, fontWeight: 600, opacity: interpolate(frame, [40, 60], [0, 1], clamp) }}
      >
        Employee Analytics shown with illustrative demo data. Employees named are fictional.
      </p>
    </CanvasStage>
  );
}

/** The tall dashboard capture shown through the app's frame: header and nav stay put, <main> scrolls. */
function ScrollShot({ scroll }: { scroll: number }) {
  const img = (y: number) => (
    <Img src={staticFile("shots/analytics-full.png")} style={{ width: SCREEN_W, height: dash.height, display: "block", transform: `translateY(${-y}px)` }} />
  );
  return (
    <div style={{ position: "relative", width: SCREEN_W, height: SCREEN_H, background: "var(--background)" }}>
      <div style={{ position: "absolute", top: dash.headerH, left: 0, width: SCREEN_W, height: SCREEN_H - dash.headerH - dash.navH, overflow: "hidden" }}>
        {img(dash.headerH + scroll)}
      </div>
      <div style={{ position: "absolute", top: 0, left: 0, width: SCREEN_W, height: dash.headerH, overflow: "hidden" }}>{img(0)}</div>
      <div style={{ position: "absolute", bottom: 0, left: 0, width: SCREEN_W, height: dash.navH, overflow: "hidden" }}>{img(dash.height - dash.navH)}</div>
    </div>
  );
}

function SectionItem({ text, on, seen, delay }: { text: string; on: boolean; seen: boolean; delay: number }) {
  const s = useSpring(delay, { damping: 16 });
  return (
    <div
      className={on ? "bg-primary text-primary-foreground shadow-pop" : "glass-surface text-foreground"}
      style={{
        padding: "10px 18px",
        borderRadius: 16,
        border: on ? "1px solid transparent" : "1px solid var(--glass-border)",
        fontFamily,
        fontSize: 19,
        fontWeight: 800,
        width: 320,
        opacity: s * (on ? 1 : seen ? 0.55 : 0.8),
        transform: `translateX(${(1 - s) * 30 + (on ? -10 : 0)}px) scale(${on ? 1.04 : 1})`,
        transformOrigin: "left center",
      }}
    >
      {text}
    </div>
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
