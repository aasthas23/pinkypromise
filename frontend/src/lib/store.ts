/**
 * Shared demo state for customer + employee views.
 * In-memory store persisted to localStorage (and synced across tabs).
 * Replace with Firebase/Supabase real-time listeners later — UI only reads via useDemo().
 */
import { useSyncExternalStore } from "react";
import type { Difficulty } from "./mock-data";

export type VerifyStatus = "idle" | "pending" | "verified" | "expired" | "cancelled";

export interface VerificationSession {
  sessionId: string;
  code: string;
  customerId: string;
  customerName: string;
  sentAt?: number;
  createdAt: number;
  expiresAt: number;
  status: VerifyStatus;
}

export interface SimResult {
  source?: "practice" | "biweekly";
  difficulty: Difficulty;
  score: number; // vulnerability 0-100
  wentWell: string[];
  watchOut: string[];
  tactics: string[];
  completedAt: number;
}

export interface DemoState {
  biweeklyOptIn: boolean;
  biweeklyConsentAt: number | null;
  callHistory: SimResult[];
  verification: VerificationSession | null;
  lastResult: SimResult | null;
  simulations: number;
  vulnerability: number;
  streak: number;
  completedTasks: string[];
}

const KEY = "safesignal-demo-v1";
export const initialState: DemoState = {
  biweeklyOptIn: false,
  biweeklyConsentAt: null,
  callHistory: [],
  verification: null,
  lastResult: null,
  simulations: 3,
  vulnerability: 46,
  streak: 4,
  completedTasks: ["verify-agent", "never-otp"],
};

let state: DemoState = initialState;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setDemo(updater: (s: DemoState) => DemoState) {
  state = updater(state);
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(state));
  emit();
}

export function resetDemo() {
  setDemo(() => initialState);
}

let hydrated = false;
export function hydrateDemo() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...initialState, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) { state = JSON.parse(e.newValue); emit(); }
  });
  emit();
}

function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function useDemo(): DemoState {
  return useSyncExternalStore(subscribe, () => state, () => initialState);
}
