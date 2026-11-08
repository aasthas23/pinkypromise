/**
 * Shared demo state for customer + employee views.
 * In-memory store persisted to localStorage (and synced across tabs).
 * Replace with Firebase/Supabase real-time listeners later — UI only reads via useDemo().
 */
import { useSyncExternalStore } from "react";
import type { Difficulty } from "./mock-data";
import { parseCsv, recordsToCsv, type SimulationRecord } from "./csv-analytics";
import csvRaw from "@/data/fake_analysis.csv?raw";

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

export interface TranscriptLine {
  who: "caller" | "you" | "system";
  text: string;
  flag?: string;
}

export interface SimResult {
  source?: "practice" | "biweekly";
  difficulty: Difficulty;
  score: number; // vulnerability 0-100
  wentWell: string[];
  watchOut: string[];
  tactics: string[];
  completedAt: number;
  /** Set for calls run by the live simulator backend (absent for the scripted demo). */
  live?: boolean;
  outcomeTitle?: string;
  outcomeSummary?: string;
  /** What was actually said on this call. The scripted demo uses the scenario script instead. */
  transcript?: TranscriptLine[];
  /** True when the caller's wording was written by AI. */
  aiCaller?: boolean;
  /** The explicit learning outcomes for this call and whether each was achieved. */
  outcomes?: { title: string; achieved: boolean | null; detail: string }[];
  /** Fraud-cue identification: titles of the tactics the user flagged, and the ones they missed. */
  cues?: { spotted: string[]; missed: string[] };
  /** The call's saved .txt transcript on the practice server (backend/data/call_transcripts/). */
  transcriptFile?: string;
  /** How the call was generated and grounded (AI caller, source transcripts). */
  provenance?: string;
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
  csvRecords: SimulationRecord[];
}

const KEY = "safesignal-demo-v1";
const FINGERPRINT_KEY = "safesignal-csv-fingerprint-v1";
const CSV_FINGERPRINT = `${csvRaw.length}:${csvRaw.slice(0, 30)}:${csvRaw.slice(-30)}`;

export const initialCsvRecords: SimulationRecord[] = parseCsv(csvRaw);
const alexInitialRecord = initialCsvRecords.find(
  (r) => r.userId === "fake-user-001" || r.employeeName === "Alex Rivera"
);

export const initialState: DemoState = {
  biweeklyOptIn: false,
  biweeklyConsentAt: null,
  callHistory: [],
  verification: null,
  lastResult: null,
  simulations: 3,
  vulnerability: alexInitialRecord ? alexInitialRecord.vulnerabilityScore : 46,
  streak: 4,
  completedTasks: ["verify-agent", "never-otp"],
  csvRecords: initialCsvRecords,
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
  setDemo(() => ({
    ...initialState,
    csvRecords: parseCsv(csvRaw),
  }));
}

export function addOrUpdateCsvRecord(record: SimulationRecord) {
  setDemo((s) => {
    const isAlex = record.userId === "fake-user-001" || record.employeeName === "Alex Rivera";
    const existingIndex = s.csvRecords.findIndex(
      (r) => r.userId === record.userId || (isAlex && r.employeeName === "Alex Rivera")
    );
    let newRecords: SimulationRecord[];
    if (existingIndex >= 0) {
      newRecords = [...s.csvRecords];
      newRecords[existingIndex] = record;
    } else {
      newRecords = [record, ...s.csvRecords];
    }
    return {
      ...s,
      csvRecords: newRecords,
      vulnerability: isAlex ? record.vulnerabilityScore : s.vulnerability,
      simulations: isAlex ? s.simulations + 1 : s.simulations,
    };
  });
}

export function updateCsvRecords(records: SimulationRecord[]) {
  setDemo((s) => {
    const alex = records.find((r) => r.userId === "fake-user-001" || r.employeeName === "Alex Rivera");
    return {
      ...s,
      csvRecords: records,
      vulnerability: alex ? alex.vulnerabilityScore : s.vulnerability,
    };
  });
}

export function exportCsvString(): string {
  return recordsToCsv(state.csvRecords);
}

let hydrated = false;
export function hydrateDemo() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    const storedFp = localStorage.getItem(FINGERPRINT_KEY);
    const csvChanged = storedFp !== CSV_FINGERPRINT;

    if (raw && !csvChanged) {
      const parsed = JSON.parse(raw);
      const csvRecs: SimulationRecord[] =
        parsed.csvRecords && parsed.csvRecords.length > 0 ? parsed.csvRecords : initialCsvRecords;
      const alex = csvRecs.find(
        (r) => r.userId === "fake-user-001" || r.employeeName === "Alex Rivera"
      );
      state = {
        ...initialState,
        ...parsed,
        csvRecords: csvRecs,
        vulnerability: alex ? alex.vulnerabilityScore : (parsed.vulnerability ?? initialState.vulnerability),
      };
    } else {
      localStorage.setItem(FINGERPRINT_KEY, CSV_FINGERPRINT);
      state = {
        ...initialState,
        csvRecords: initialCsvRecords,
        vulnerability: alexInitialRecord ? alexInitialRecord.vulnerabilityScore : 46,
      };
      localStorage.setItem(KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) {
      state = JSON.parse(e.newValue);
      emit();
    }
  });
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDemo(): DemoState {
  return useSyncExternalStore(subscribe, () => state, () => initialState);
}
