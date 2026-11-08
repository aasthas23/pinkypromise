/**
 * Shared building blocks for the demo. Visual values come from the app:
 * tokens via app-tokens.css (generated from frontend/src/styles.css), and
 * markup patterns copied from the app's components (named in each comment).
 */
import { loadFont } from "@remotion/google-fonts/NunitoSans";
import type React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800", "900"],
  subsets: ["latin"],
});

/** The app renders inside a 390px-wide phone frame (AppShell, max-w-[390px]). */
export const SCREEN_W = 390;
export const SCREEN_H = 836;

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** Spring that starts at `delay` frames. Damping mirrors the app's soft motion springs. */
export function useSpring(delay = 0, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 120, mass: 0.9, ...config } });
}

/** 0→1 over [start, start+len] with the house ease. */
export function useProgress(start: number, len: number) {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + len], [0, 1], { ...clamp, easing: ease });
}

/** Fades a whole scene in and out so transitions feel continuous. */
export function SceneFade({ children, inLen = 12, outLen = 12 }: { children: React.ReactNode; inLen?: number; outLen?: number }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = Math.min(
    interpolate(frame, [0, inLen], [0, 1], clamp),
    interpolate(frame, [durationInFrames - outLen, durationInFrames], [1, 0], clamp),
  );
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

// ---------------------------------------------------------------- backgrounds

/** Light canvas: the AppShell page color (#f7edf6) with the app's canvas wash and soft drifting blobs. */
export function CanvasStage({ children }: { children?: React.ReactNode }) {
  const frame = useCurrentFrame();
  const drift = (s: number, a: number) => Math.sin((frame + s) / 70) * a;
  return (
    <AbsoluteFill style={{ background: "#f7edf6", fontFamily }}>
      <AbsoluteFill style={{ backgroundImage: "var(--canvas-wash)", opacity: 0.85 }} />
      <div
        className="blob absolute bg-pink"
        style={{ width: 900, height: 820, left: -260 + drift(0, 30), top: -300 + drift(40, 20), filter: "blur(40px)", opacity: 0.9 }}
      />
      <div
        className="blob absolute bg-primary"
        style={{ width: 620, height: 560, right: -180 + drift(90, 26), bottom: -260 + drift(10, 18), filter: "blur(90px)", opacity: 0.13 }}
      />
      <div
        className="blob absolute bg-gold"
        style={{ width: 520, height: 480, right: 300 + drift(30, 24), top: -220 + drift(60, 16), filter: "blur(60px)", opacity: 0.7 }}
      />
      <Sketchlines />
      {children}
    </AbsoluteFill>
  );
}

/** Faint notebook grid, from the app's --canvas-line tokens. */
function Sketchlines() {
  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(var(--canvas-line) 1px, transparent 1px), linear-gradient(90deg, var(--canvas-line) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        maskImage: "radial-gradient(75% 75% at 50% 50%, black, transparent)",
        opacity: 0.8,
      }}
    />
  );
}

/** Dark call stage: the call screen's bg-ink with the app's --glow-call. */
export function InkStage({ children, glow = 1 }: { children?: React.ReactNode; glow?: number }) {
  const frame = useCurrentFrame();
  const pulse = 0.85 + Math.sin(frame / 22) * 0.15;
  return (
    <AbsoluteFill className="bg-ink" style={{ fontFamily }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(45% 55% at 50% 45%, color-mix(in oklab, var(--primary) 32%, transparent), transparent 70%)",
          opacity: glow * pulse,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(30% 40% at 85% 90%, color-mix(in oklab, var(--primary-deep) 40%, transparent), transparent 70%)",
          opacity: glow * 0.8,
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- phone

/**
 * The app's own frame (AppShell): rounded-[2.4rem], border #f2d9eb,
 * shadow 0 18px 50px rgba(70,24,52,.12). Content is authored at the app's
 * 390px width and scaled up for the 1080p canvas.
 */
export function Phone({
  children,
  scale = 1.02,
  x = 0,
  y = 0,
  rotate = 0,
  tilt = 0,
  dark = false,
  shadow = 1,
  style,
}: {
  children: React.ReactNode;
  scale?: number;
  x?: number;
  y?: number;
  rotate?: number;
  tilt?: number;
  dark?: boolean;
  shadow?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: SCREEN_W,
        height: SCREEN_H,
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) perspective(1800px) rotateY(${tilt}deg) rotate(${rotate}deg) scale(${scale})`,
        borderRadius: "2.4rem",
        overflow: "hidden",
        border: `1px solid ${dark ? "#3a2433" : "#f2d9eb"}`,
        boxShadow: `0 ${18 * shadow}px ${50 * shadow}px rgba(70,24,52,${0.12 + 0.1 * shadow}), 0 ${40 * shadow}px ${120 * shadow}px rgba(70,24,52,${0.14 * shadow})`,
        fontFamily,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A real screenshot of the running app (scripts/capture.mjs). */
export function Shot({ name, offsetY = 0 }: { name: string; offsetY?: number }) {
  return (
    <Img
      src={staticFile(`shots/${name}.png`)}
      style={{ width: SCREEN_W, height: "auto", display: "block", transform: `translateY(${-offsetY}px)` }}
    />
  );
}

/** Glowing focus ring placed over part of a phone screen (coordinates in app CSS px). */
export function Focus({ x, y, w, h, p, radius = 999 }: { x: number; y: number; w: number; h: number; p: number; radius?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x - 6,
        top: y - 6,
        width: w + 12,
        height: h + 12,
        borderRadius: radius,
        border: "3px solid var(--primary)",
        boxShadow: "0 0 0 8px color-mix(in oklab, var(--primary) 18%, transparent), 0 0 40px color-mix(in oklab, var(--primary) 45%, transparent)",
        opacity: p,
        transform: `scale(${0.94 + 0.06 * p})`,
        pointerEvents: "none",
      }}
    />
  );
}

// ---------------------------------------------------------------- Penny (the app's mascot)

const PENNY = {
  happy: "pinky-puppy-celebrating.png",
  bounce: "pinky-puppy-celebrating.png",
  think: "pinky-puppy-thinking.png",
  loving: "penny-loving.png",
  curious: "penny-curious.png",
  alert: "penny-alert.png",
  float: "pinky-puppy-ready.png",
  wave: "pinky-puppy.png",
} as const;
export type Mood = keyof typeof PENNY;

/** Penny with the same gesture shapes as components/safe/Mascot.tsx, driven by the frame. */
export function Penny({ mood = "happy", size = 160, delay = 0, style }: { mood?: Mood; size?: number; delay?: number; style?: React.CSSProperties }) {
  const frame = useCurrentFrame();
  const enter = useSpring(delay, { damping: 11, stiffness: 140 });
  const t = Math.max(0, frame - delay);
  const cycle = (len: number) => (t % len) / len;
  let y = 0;
  let rot = 0;
  let sx = 1;
  let sy = 1;
  if (mood === "happy" || mood === "bounce") {
    const c = cycle(80);
    const k = interpolate(c, [0, 0.12, 0.3, 0.45, 0.58, 0.7, 1], [0, 1, 2, 3, 4, 5, 5], clamp);
    y = interpolate(k, [0, 1, 2, 3, 4, 5], [0, 3, -14, 0, -7, 0]);
    rot = interpolate(k, [0, 1, 2, 3, 4, 5], [0, 0, -7, 0, 6, 0]);
    sy = interpolate(k, [0, 1, 2, 3, 4, 5], [1, 0.95, 1.04, 0.97, 1.02, 1]);
    sx = 2 - sy;
  } else if (mood === "think" || mood === "curious") {
    rot = Math.sin(t / 26) * (mood === "curious" ? 7 : 5);
    y = Math.sin(t / 30) * -2;
  } else if (mood === "loving") {
    rot = Math.sin(t / 24) * 4;
    sx = sy = 1 + Math.max(0, Math.sin(t / 24)) * 0.035;
  } else {
    y = Math.sin(t / 22) * -4;
    rot = Math.sin(t / 30) * 2;
  }
  const joyful = mood === "happy" || mood === "bounce" || mood === "loving";
  return (
    <div style={{ position: "relative", width: size, height: size, ...style }}>
      <div
        className="absolute bg-primary/10"
        style={{ bottom: 0, left: "25%", width: "50%", height: "5%", borderRadius: 999, filter: "blur(2px)", opacity: enter }}
      />
      <Img
        src={staticFile(`app/${PENNY[mood]}`)}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          transformOrigin: "50% 85%",
          transform: `translateY(${y + (1 - enter) * 40}px) rotate(${rot}deg) scale(${sx * enter}, ${sy * enter})`,
        }}
      />
      {joyful &&
        [0, 1, 2].map((i) => {
          const c = ((t + i * 14) % 72) / 72;
          const pos = i === 0 ? { left: 0, top: "33%" } : i === 1 ? { right: 0, top: "25%" } : { right: "25%", top: 0 };
          return (
            <span
              key={i}
              className="absolute text-primary"
              style={{
                ...pos,
                fontSize: size * 0.11,
                opacity: interpolate(c, [0, 0.4, 1], [0, 0.85, 0]) * enter,
                transform: `translateY(${interpolate(c, [0, 1], [6, -26])}px) scale(${interpolate(c, [0, 0.4, 1], [0.5, 1, 0.6])})`,
              }}
            >
              {mood === "loving" ? "♥" : "✦"}
            </span>
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------- type

/** Word-by-word reveal: each word rises and un-blurs on a spring. */
export function Words({
  text,
  delay = 0,
  stagger = 3,
  className,
  style,
  accent,
}: {
  text: string;
  delay?: number;
  stagger?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Words (exact match) to color with the primary magenta. */
  accent?: string[];
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div className={className} style={{ fontFamily, ...style }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 18, stiffness: 110 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: s,
              transform: `translateY(${(1 - s) * 0.45}em)`,
              filter: `blur(${(1 - s) * 8}px)`,
              color: accent?.includes(w.replace(/[.,!?]/g, "")) ? "var(--primary)" : undefined,
            }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
}

/** The app's small uppercase kicker label (e.g. "BIWEEKLY", "SAFETY TRACK"). */
export function Kicker({ children, delay = 0, light = false }: { children: React.ReactNode; delay?: number; light?: boolean }) {
  const s = useSpring(delay);
  return (
    <p
      className={light ? "text-pink" : "text-primary-deep"}
      style={{
        fontFamily,
        fontSize: 20,
        fontWeight: 900,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        opacity: s,
        transform: `translateX(${(1 - s) * -24}px)`,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

/** Feature row card in the app's glass-surface style. */
export function FeatureCard({
  icon,
  title,
  body,
  delay,
  dark = false,
  active = 1,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  delay: number;
  dark?: boolean;
  active?: number;
}) {
  const s = useSpring(delay);
  return (
    <div
      className={dark ? "" : "glass-surface"}
      style={{
        display: "flex",
        gap: 22,
        alignItems: "flex-start",
        padding: "22px 26px",
        borderRadius: 28,
        border: dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid var(--glass-border)",
        background: dark ? "rgba(255,255,255,0.06)" : undefined,
        opacity: s * (0.45 + 0.55 * active),
        transform: `translateY(${(1 - s) * 40}px) scale(${0.97 + 0.03 * active})`,
        fontFamily,
      }}
    >
      <span
        className="bg-primary text-primary-foreground"
        style={{ display: "grid", placeItems: "center", width: 58, height: 58, borderRadius: 999, flexShrink: 0, boxShadow: "var(--shadow-pop)" }}
      >
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 30, fontWeight: 900, lineHeight: 1.15 }} className={dark ? "text-ink-foreground" : "text-foreground"}>
          {title}
        </p>
        <p
          style={{ margin: "6px 0 0", fontSize: 22, lineHeight: 1.4, fontWeight: 600 }}
          className={dark ? "text-ink-foreground/70" : "text-muted-foreground"}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

export function LogoMark({ size = 120 }: { size?: number }) {
  return <Img src={staticFile("app/pinky-promise-emblem-logo.png")} style={{ width: size, height: size, objectFit: "contain" }} />;
}
