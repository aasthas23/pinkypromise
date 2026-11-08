import { motion } from "motion/react";

export function ScoreRing({ value, size = 96, stroke = 10, color = "var(--primary)", track = "var(--pink)", children, label }:
  { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${value}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(100, value) / 100) }}
          transition={{ duration: 1.2, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
