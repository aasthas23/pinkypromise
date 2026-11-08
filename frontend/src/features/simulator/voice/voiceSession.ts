import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

/**
 * Audio transport abstraction. The MVP plays real robocall recordings with
 * expo-audio, speaks scripted caller lines with on-device text-to-speech, and
 * takes the user's input by tapping. A real-time voice provider can implement
 * this same interface later, behind a backend that holds the keys.
 * Captions are always shown, so audio is an enhancement and never required.
 */
export interface VoiceSession {
  /** Speaks one caller line. Always calls onDone exactly once, unless stop() is called first. */
  speak(text: string, onDone: () => void, voice?: { pitch?: number; rate?: number }): void;
  /** Plays a bundled recording. Same completion guarantee as speak(). */
  playClip(source: number, durationSec: number, transcript: string, onDone: () => void): void;
  /** Stops any audio in progress (without calling pending onDone callbacks). */
  stop(): void;
  setEnabled(enabled: boolean): void;
}

/** Reading-pace fallback used when voice is off or unavailable. */
export function captionDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.min(6000, Math.max(1200, words * 260));
}

/** Caption hold time for a recording when audio is off: long enough to read it. */
function clipCaptionMs(durationSec: number, text: string): number {
  return Math.min(durationSec * 1000, Math.max(2500, text.split(/\s+/).length * 260));
}

let audioModeSet = false;

export function createScriptedVoiceSession(initiallyEnabled: boolean): VoiceSession {
  let enabled = initiallyEnabled;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The item in progress, so turning voice off can switch it to caption pacing. */
  let pending: { captionMs: number; done: () => void } | undefined;
  let player: AudioPlayer | undefined;
  let playerSub: { remove: () => void } | undefined;

  if (!audioModeSet) {
    audioModeSet = true;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const stopPlayer = () => {
    playerSub?.remove();
    playerSub = undefined;
    if (player) {
      try {
        player.pause();
        player.remove();
      } catch {
        // already released
      }
      player = undefined;
    }
  };

  /** Starts a new item. Returns a done() that only fires once and only for the current item. */
  const begin = (captionMs: number, fallbackMs: number, onDone: () => void) => {
    clearTimer();
    stopPlayer();
    const myGen = ++generation;
    let finished = false;
    const done = () => {
      if (finished || myGen !== generation) return;
      finished = true;
      pending = undefined;
      clearTimer();
      stopPlayer();
      onDone();
    };
    pending = { captionMs, done };
    // Safety timeout so the call never stalls if audio never reports back.
    timer = setTimeout(done, enabled ? fallbackMs : captionMs);
    return done;
  };

  return {
    speak(text, onDone, voice) {
      const captionMs = captionDurationMs(text);
      const done = begin(captionMs, captionMs * 2 + 2000, onDone);
      if (!enabled) return;
      try {
        Speech.speak(text, {
          rate: voice?.rate ?? 1.0,
          pitch: voice?.pitch ?? 0.95,
          onDone: done,
          onError: done,
        });
      } catch {
        // TTS unavailable: the caption timer keeps the call moving.
      }
    },

    playClip(source, durationSec, transcript, onDone) {
      const done = begin(clipCaptionMs(durationSec, transcript), durationSec * 1000 + 3000, onDone);
      if (!enabled) return;
      try {
        const p = createAudioPlayer(source);
        player = p;
        playerSub = p.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) done();
        });
        p.play();
      } catch {
        // Audio unavailable: the caption timer keeps the call moving.
      }
    },

    stop() {
      generation++;
      pending = undefined;
      clearTimer();
      stopPlayer();
      Speech.stop().catch(() => {});
    },

    setEnabled(next) {
      if (enabled === next) return;
      enabled = next;
      if (!next) {
        Speech.stop().catch(() => {});
        stopPlayer();
        if (pending) {
          const { captionMs, done } = pending;
          clearTimer();
          timer = setTimeout(done, captionMs);
        }
      }
    },
  };
}
