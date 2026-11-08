/**
 * Browser voice for practice calls (Web Speech API, no extra packages).
 *
 * - speakLine(): reads a caller line aloud with speechSynthesis, using only a
 *   human-sounding voice (none on the device → captions only). It always
 *   resolves, using a reading-pace timer if speech is off, unsupported or silent,
 *   so the call never stalls. Captions are always available.
 * - listenOnce(): optional push-to-talk via SpeechRecognition. Only started when
 *   the user taps the mic. The browser asks for microphone permission then, and
 *   some browsers process the audio on their own servers.
 */

type Voice = { pitch?: number; rate?: number } | null | undefined;

export const readingMs = (text: string) =>
  Math.min(9000, Math.max(1400, text.trim().split(/\s+/).length * 330));

const synth = () =>
  typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

/** iOS only allows speech after a user gesture: call this inside the Answer tap. */
export function unlockSpeech() {
  const s = synth();
  if (!s) return;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    s.speak(u);
  } catch {
    /* ignore */
  }
}

/**
 * Only voices that sound like a person: neural/online voices (Edge "Natural",
 * Chrome's Google voices, Apple Siri/Enhanced/Premium downloads). Classic
 * on-device voices (eSpeak, compact Samantha/Alex, Microsoft David/Zira desktop)
 * sound robotic, so they are never used: the line is shown as text instead.
 */
const HUMAN_VOICE = /natural|neural|online|enhanced|premium|siri|^google\b/i;
const ROBOTIC_VOICE =
  /espeak|compact|novelty|bad news|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|albert|jester|organ|superstar|wobble/i;

let cachedVoice: SpeechSynthesisVoice | null | undefined;
/** The most human-sounding English voice on this device, or null if it only has robotic ones. */
export function humanVoice(voices: SpeechSynthesisVoice[] = synth()?.getVoices() ?? []) {
  const human = voices.filter(
    (v) =>
      v.lang?.toLowerCase().startsWith("en") &&
      HUMAN_VOICE.test(v.name) &&
      !ROBOTIC_VOICE.test(v.name),
  );
  const rank = (v: SpeechSynthesisVoice) =>
    (v.lang === "en-US" ? 0 : 2) + (/natural|neural|siri|premium/i.test(v.name) ? 0 : 1);
  return human.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = synth()?.getVoices() ?? [];
  cachedVoice = humanVoice(voices);
  if (!voices.length) cachedVoice = undefined; // voices load async in some browsers; retry next time
  return cachedVoice ?? null;
}

export function stopSpeaking() {
  try {
    synth()?.cancel();
  } catch {
    /* ignore */
  }
}

/** Resolves when the line has been spoken (or would have been read), or immediately if signal aborts. */
export function speakLine(
  text: string,
  opts: { enabled: boolean; voice?: Voice; signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve();
      }
    };
    // No human-sounding voice on this device: show the line (captions) at reading pace rather than speak robotically.
    const s = opts.enabled && pickVoice() ? synth() : null;
    // Safety net: some browsers never fire onend. Allow a little longer than reading pace when speaking.
    const timer = setTimeout(finish, s ? readingMs(text) * 2 + 1500 : readingMs(text));
    opts.signal?.addEventListener(
      "abort",
      () => {
        stopSpeaking();
        finish();
      },
      { once: true },
    );
    if (!s) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice()!;
      u.voice = v;
      u.lang = v.lang;
      // Natural voices sound best at their own pitch and rate; only nudge them if a caller persona asks.
      u.pitch = opts.voice?.pitch ?? 1;
      u.rate = opts.voice?.rate ?? 1;
      u.volume = 1;
      u.onend = finish;
      u.onerror = finish;
      s.speak(u);
    } catch {
      /* fall back to the timer */
    }
  });
}

// ---------------------------------------------------------------- speech recognition

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechInputSupported = () => recognitionCtor() !== null;

export type Listening = { result: Promise<string>; stop: () => void };

/** Listens for one utterance. Resolves with the text ('' if nothing was heard); rejects on permission errors. */
export function listenOnce(): Listening {
  const Ctor = recognitionCtor();
  if (!Ctor)
    return {
      result: Promise.reject(new Error("Voice input isn’t supported in this browser.")),
      stop: () => {},
    };
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  const result = new Promise<string>((resolve, reject) => {
    let text = "";
    rec.onresult = (e) => {
      text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        reject(new Error("Microphone access was blocked. You can type your reply instead."));
      else if (e.error !== "no-speech" && e.error !== "aborted")
        reject(new Error("Couldn’t hear that. Try again or type your reply."));
    };
    rec.onend = () => resolve(text);
  });
  try {
    rec.start();
  } catch {
    /* already started */
  }
  return {
    result,
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
  };
}
