import { PhoneCall, ShieldCheck, TrendingUp } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { RingingCall } from "../ui/app";
import { CanvasStage, clamp, FeatureCard, Focus, fontFamily, InkStage, Kicker, LogoMark, Penny, Phone, Shot, useProgress, useSpring, Words } from "../ui/core";

/** 1 · Cold open: a phone rings with the app's own incoming-call screen. */
export function ColdOpen() {
  const frame = useCurrentFrame();
  const enter = useSpring(4, { damping: 18, stiffness: 70 });
  const ring = (frame % 48) / 48;
  const buzz = frame % 48 < 12 ? Math.sin(frame * 2.4) * 3 : 0;
  const push = interpolate(frame, [0, 195], [1, 1.05]);
  return (
    <InkStage>
      <Phone x={-380 + buzz} y={(1 - enter) * 900} scale={1.1 * push} tilt={14 - enter * 6} dark shadow={1.4}>
        <RingingCall ring={ring} />
      </Phone>
      <div style={{ position: "absolute", left: 1010, top: 330, width: 820 }}>
        <Kicker delay={18} light>
          Incoming call
        </Kicker>
        <Words
          text="A familiar voice isn’t always a friendly one."
          delay={30}
          stagger={4}
          className="text-ink-foreground"
          style={{ fontSize: 92, fontWeight: 900, lineHeight: 1.04, marginTop: 22, letterSpacing: "-0.01em" }}
          accent={["friendly"]}
        />
      </div>
    </InkStage>
  );
}

/** 2 · Brand: the app's emblem, name and home-screen tagline, with Penny. */
export function Brand() {
  const logo = useSpring(6, { damping: 12, stiffness: 110 });
  const name = useSpring(16);
  return (
    <CanvasStage>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily }}>
        <div style={{ display: "flex", alignItems: "center", gap: 70 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <div style={{ transform: `scale(${logo}) rotate(${(1 - logo) * -25}deg)` }}>
                <LogoMark size={190} />
              </div>
              <p
                className="text-foreground"
                style={{ fontSize: 132, fontWeight: 800, margin: 0, lineHeight: 1, opacity: name, transform: `translateX(${(1 - name) * -40}px)` }}
              >
                Pinky <span className="text-primary">Promise</span>
              </p>
            </div>
            <Words
              text="Big heart. Sharper instincts."
              delay={34}
              stagger={5}
              className="text-foreground"
              style={{ fontSize: 64, fontWeight: 700, marginTop: 34, marginLeft: 8 }}
            />
            <div style={{ marginTop: 22, marginLeft: 10 }}>
              <Kicker delay={62}>Your call safety companion</Kicker>
            </div>
          </div>
          <Penny mood="happy" size={340} delay={24} />
        </div>
      </AbsoluteFill>
    </CanvasStage>
  );
}

/** 3 · Home: the real home screen, with its three paths called out. */
export function HomeTour() {
  const frame = useCurrentFrame();
  const enter = useSpring(0, { damping: 18, stiffness: 80 });
  const push = interpolate(frame, [0, 225], [1.06, 1.12]);
  const step = frame < 70 ? 0 : frame < 115 ? 1 : 2;
  const focus = [
    { x: 17, y: 360, w: 356, h: 56 },
    { x: 34, y: 522, w: 321, h: 43 },
    { x: 34, y: 579, w: 321, h: 43 },
  ];
  const f = focus[step]!;
  const fp = interpolate(frame, [45, 55], [0, 1], clamp);
  return (
    <CanvasStage>
      <Phone x={-440} y={(1 - enter) * 120} scale={push} tilt={9 - enter * 4}>
        <Shot name="home" />
        <Focus {...f} p={fp} />
      </Phone>
      <div style={{ position: "absolute", left: 900, top: 150, width: 900 }}>
        <Kicker delay={8}>One app, three habits</Kicker>
        <Words
          text="Check the caller. Practice the call. See your progress."
          delay={16}
          stagger={3}
          className="text-foreground"
          style={{ fontSize: 66, fontWeight: 900, lineHeight: 1.08, marginTop: 18 }}
          accent={["Practice"]}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 44 }}>
          <FeatureCard icon={<ShieldCheck size={28} />} title="Verify a caller" body="Ask for a Pinky Promise code and check who’s really on the line." delay={45} active={step === 0 ? 1 : 0} />
          <FeatureCard icon={<PhoneCall size={28} />} title="Practice a call" body="Rehearse with a realistic AI scam caller, in a space where nothing is at risk." delay={72} active={step === 1 ? 1 : 0} />
          <FeatureCard icon={<TrendingUp size={28} />} title="My progress" body="Watch your instincts get sharper, call by call." delay={100} active={step === 2 ? 1 : 0} />
        </div>
      </div>
    </CanvasStage>
  );
}

/** 4 · Verify a caller: the employee issues a code, the customer checks it (demo delivery). */
export function VerifyFlow() {
  const frame = useCurrentFrame();
  const left = useSpring(10, { damping: 18, stiffness: 80 });
  const right = useSpring(36, { damping: 18, stiffness: 80 });
  const travel = useProgress(62, 44);
  const arcX = interpolate(travel, [0, 1], [-250, 250]);
  const arcY = -Math.sin(travel * Math.PI) * 160 + 80;
  const verified = interpolate(frame, [112, 124], [0, 1], clamp);
  return (
    <CanvasStage>
      <div style={{ position: "absolute", top: 50, width: "100%", textAlign: "center" }}>
        <Words text="Know who’s on the other end." delay={4} stagger={4} className="text-foreground" style={{ fontSize: 70, fontWeight: 900 }} />
        <Words
          text="A T-Mobile employee shares a one-time Pinky Promise code. You check it in the app."
          delay={22}
          stagger={1.5}
          className="text-muted-foreground"
          style={{ fontSize: 30, fontWeight: 600, marginTop: 12 }}
        />
      </div>
      <Label x={-330} y={-262} text="Employee · Caller codes" delay={14} />
      <Label x={330} y={-262} text="Customer · Verify a caller" delay={40} />
      <Phone x={-330} y={135 + (1 - left) * 700} scale={0.8} rotate={-2} tilt={8}>
        <Shot name="employee-code" />
      </Phone>
      <Phone x={330} y={135 + (1 - right) * 700} scale={0.8} rotate={2} tilt={-8}>
        <Shot name="verify-verified" />
        <Focus x={17} y={525} w={356} h={108} p={verified} radius={28} />
      </Phone>
      {travel > 0 && travel < 1 && (
        <div
          className="bg-primary text-primary-foreground shadow-pop"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) translate(${arcX}px, ${arcY}px) scale(${1 + Math.sin(travel * Math.PI) * 0.25})`,
            fontFamily,
            fontWeight: 900,
            fontSize: 40,
            letterSpacing: "0.3em",
            padding: "14px 24px 14px 34px",
            borderRadius: 999,
          }}
        >
          1129
        </div>
      )}
      <p
        className="text-muted-foreground"
        style={{ position: "absolute", bottom: 16, width: "100%", textAlign: "center", fontFamily, fontSize: 20, fontWeight: 600, opacity: interpolate(frame, [60, 80], [0, 1], clamp) }}
      >
        Prototype: caller codes are delivered inside the app for this demo. No text messages are sent.
      </p>
    </CanvasStage>
  );
}

function Label({ x, y, text, delay }: { x: number; y: number; text: string; delay: number }) {
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

/** 5 · Choose a scenario: the real practice screen. */
export function Scenarios() {
  const frame = useCurrentFrame();
  const enter = useSpring(0, { damping: 18, stiffness: 80 });
  const cards = [
    { x: 17, y: 416, w: 356, h: 114 },
    { x: 17, y: 543, w: 356, h: 115 },
    { x: 17, y: 672, w: 356, h: 100 },
  ];
  const i = frame < 85 ? 0 : frame < 120 ? 1 : 2;
  const fp = interpolate(frame, [48, 58], [0, 1], clamp);
  return (
    <CanvasStage>
      <div style={{ position: "absolute", left: 130, top: 230, width: 860 }}>
        <Kicker delay={6}>Practice</Kicker>
        <Words
          text="Rehearse the call before a real one comes."
          delay={12}
          stagger={4}
          className="text-foreground"
          style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.04, marginTop: 18 }}
          accent={["Rehearse"]}
        />
        <div style={{ display: "flex", gap: 14, marginTop: 44, flexWrap: "wrap" }}>
          {["3 difficulty levels", "6 T-Mobile scenarios", "A fresh conversation every time"].map((t, k) => (
            <Pill key={t} text={t} delay={58 + k * 14} />
          ))}
        </div>
      </div>
      <Phone x={470} y={(1 - enter) * 120} scale={1.12} tilt={-9 + enter * 4}>
        <Shot name="practice" />
        <Focus {...cards[i]!} p={fp} radius={20} />
      </Phone>
    </CanvasStage>
  );
}

export function Pill({ text, delay, icon }: { text: string; delay: number; icon?: React.ReactNode }) {
  const s = useSpring(delay, { damping: 13 });
  return (
    <span
      className="bg-pink text-primary-deep"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 26px",
        borderRadius: 999,
        fontFamily,
        fontSize: 26,
        fontWeight: 800,
        transform: `scale(${s})`,
        opacity: s,
        border: "1px solid color-mix(in oklab, var(--primary) 18%, transparent)",
      }}
    >
      {icon}
      {text}
    </span>
  );
}

