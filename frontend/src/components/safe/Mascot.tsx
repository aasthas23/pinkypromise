import { motion, useReducedMotion, type TargetAndTransition } from "motion/react";
import { Heart, Sparkles } from "lucide-react";
import mascotImg from "@/assets/pinky-puppy.png";
import thinkingImg from "@/assets/pinky-puppy-thinking.png";
import celebratingImg from "@/assets/pinky-puppy-celebrating.png";
import readyImg from "@/assets/pinky-puppy-ready.png";
import curiousImg from "@/assets/penny-curious.png";
import lovingImg from "@/assets/penny-loving.png";
import alertImg from "@/assets/penny-alert.png";
import { cn } from "@/lib/utils";

type Mood = "float" | "wave" | "bounce" | "happy" | "think" | "curious" | "loving" | "alert";

const poses = {
  float: { image: readyImg, label: "Penny giving an encouraging thumbs-up" },
  wave: { image: mascotImg, label: "Penny waving hello" },
  bounce: { image: celebratingImg, label: "Penny excited to practice with you" },
  happy: { image: celebratingImg, label: "Penny celebrating your progress" },
  think: { image: thinkingImg, label: "Penny thoughtfully reviewing your call" },
  curious: { image: curiousImg, label: "Penny curiously tilting her head" },
  loving: { image: lovingImg, label: "Penny smiling and hugging a heart" },
  alert: { image: alertImg, label: "Penny raising her paw to remind you to pause" },
};

// Each gesture has anticipation, action, and a resting beat rather than constant bobbing.
const gestures: Record<Mood, TargetAndTransition> = {
  float: { y: [0, -3, -3, 0], rotate: [0, -2, 2, 0], transition: { duration: 3.4, repeat: Infinity, repeatDelay: 1.6 } },
  wave: { rotate: [0, -9, 7, -6, 4, 0], y: [0, -3, -5, -3, -2, 0], transition: { duration: 1.5, repeat: Infinity, repeatDelay: 3 } },
  bounce: { y: [0, 3, -15, 0, -6, 0], scaleX: [1, 1.06, 0.96, 1.04, 0.99, 1], scaleY: [1, 0.94, 1.05, 0.96, 1.02, 1], rotate: [0, -3, 4, -2, 1, 0], transition: { duration: 1.5, repeat: Infinity, repeatDelay: 2.8 } },
  happy: { y: [0, 3, -12, 0, -8, 0], rotate: [0, 0, -8, 0, 8, 0], scaleY: [1, 0.95, 1.04, 0.97, 1.03, 1], transition: { duration: 1.8, repeat: Infinity, repeatDelay: 3 } },
  think: { rotate: [0, -6, -6, 3, 3, 0], y: [0, -2, -2, 0, 0, 0], transition: { duration: 3.8, repeat: Infinity, repeatDelay: 2 } },
  curious: { rotate: [0, 9, 9, -4, 0], y: [0, -3, -3, -1, 0], transition: { duration: 2.8, repeat: Infinity, repeatDelay: 2.5 } },
  loving: { rotate: [0, -4, 4, 0], scale: [1, 1.035, 1.035, 1], transition: { duration: 3, repeat: Infinity, repeatDelay: 2 } },
  alert: { rotate: [0, -5, 5, -3, 0], y: [0, -4, -4, -2, 0], transition: { duration: 1.2, repeat: Infinity, repeatDelay: 4 } },
};

export function Mascot({ mood = "float", size = 160, className, alt }: { mood?: Mood | undefined; size?: number; className?: string; alt?: string }) {
  const reduce = useReducedMotion();
  const joyful = mood === "happy" || mood === "bounce" || mood === "loving";
  return (
    <span key={`${mood}-${reduce ? "still" : "animated"}`} data-mascot-mood={mood} style={{ width: size, height: size }} className={cn("relative inline-flex max-w-full shrink-0 select-none items-center justify-center", className)}>
      <motion.span aria-hidden="true" className="absolute bottom-0 left-1/4 h-[5%] w-1/2 rounded-full bg-primary/10 blur-[2px]"
        animate={reduce ? { scaleX: 1, opacity: 0.6 } : { scaleX: [1, 0.8, 1], opacity: [0.6, 0.35, 0.6] }} transition={reduce ? { duration: 0 } : { duration: 3, repeat: Infinity }} />
      <motion.img key={mood} src={poses[mood].image} alt={alt ?? poses[mood].label} width={size} height={size}
        className="relative h-full w-full origin-[50%_85%] object-contain"
        initial={false} animate={reduce ? { y: 0, rotate: 0, scale: 1, transition: { duration: 0 } } : gestures[mood]}
        whileHover={reduce ? {} : { scale: 1.06 }}
        whileTap={reduce ? {} : { scale: 0.95, rotate: -4 }} draggable={false} />
      {joyful && [0, 1, 2].map((i) => <motion.span key={`${mood}-${i}`} aria-hidden="true"
        className={cn("pointer-events-none absolute text-primary", i === 0 ? "left-0 top-1/3" : i === 1 ? "right-0 top-1/4" : "right-1/4 top-0")}
        initial={false} animate={reduce ? { opacity: 0 } : { y: [6, -16, -26], x: [0, i === 0 ? -6 : 6, 0], opacity: [0, 0.8, 0], scale: [0.5, 1, 0.6], rotate: [0, i % 2 ? 15 : -15, 0] }}
        transition={reduce ? { duration: 0 } : { duration: 2.4, delay: i * 0.45, repeat: Infinity, repeatDelay: 2 }}>
        {mood === "loving" ? <Heart className="size-3 fill-current" /> : <Sparkles className="size-3" />}
      </motion.span>)}
    </span>
  );
}

export function MascotBubble({ children, mood, size = 96 }: { children: React.ReactNode; mood?: Mood | undefined; size?: number }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <Mascot mood={mood} size={size} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="glass-surface min-w-0 rounded-2xl rounded-bl-sm border px-4 py-3 text-sm font-semibold leading-relaxed">
        {children}
      </motion.div>
    </div>
  );
}
