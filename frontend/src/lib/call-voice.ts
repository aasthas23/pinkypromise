/**
 * Browser voice for practice calls (Web Speech API, no extra packages).
 *
 * - speakLine(): reads a caller line aloud with speechSynthesis. It always
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

let cachedVoice: SpeechSynthesisVoice | null | undefined;
function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = synth()?.getVoices() ?? [];
  cachedVoice =
    voices.find((v) => v.lang === "en-US" && /natural|enhanced|premium/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-US" && /samantha|ava|karen|zira|aria|daniel/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang?.startsWith("en")) ??
    null;
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
    const s = opts.enabled ? synth() : null;
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
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v?.lang ?? "en-US";
      u.pitch = opts.voice?.pitch ?? 1.01;
      u.rate = opts.voice?.rate ?? 0.92;
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
