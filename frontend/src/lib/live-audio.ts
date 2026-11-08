/**
 * Browser audio for live AI practice calls (no extra packages).
 *
 * VoicePlayer: plays the AI caller's voice sentence by sentence. Each sentence's
 * audio streams from the server (OpenAI TTS behind our backend), so playback
 * starts before the whole reply is generated. One <audio> element is reused and
 * unlocked on the Answer tap so iOS allows playback. If a sentence's audio fails,
 * it falls back to the browser's own voice so the call never goes silent.
 *
 * MicListener: hands-free listening. Voice-activity detection on the mic level
 * starts a recording when the person speaks and stops after a pause; each
 * recording is one reply. Echo cancellation is requested, and the threshold is
 * raised while the caller is talking so the caller's voice doesn't trigger it.
 * Speech detected while the caller talks is reported as an interruption.
 * Nothing is recorded while muted, and the mic is released when the call ends.
 */
import { speakLine, stopSpeaking } from "./call-voice";

type Voice = { pitch?: number; rate?: number } | null | undefined;

function silentWavUrl(): string {
  const samples = 800; // 0.1 s at 8 kHz
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

type QueueItem = {
  id: string;
  /** Server-generated voice for this sentence; null → browser voice. */
  url: string | null;
  text: string;
  /** false when the caller voice is muted: captions only, held for reading time. */
  speak: boolean;
  onStart: () => void;
  onEnd: () => void;
};

export class VoicePlayer {
  private el: HTMLAudioElement | null = null;
  private queue: QueueItem[] = [];
  private current: QueueItem | null = null;
  private fallback: AbortController | null = null;
  /** Utterance ids that started playing (heard), for interruption bookkeeping. */
  readonly heard: string[] = [];
  onIdle: () => void = () => {};

  /** quietPace: how long a line stays "playing" when the voice is off (default: reading time). */
  constructor(
    private voice: Voice = undefined,
    private quietPace?: (text: string) => number,
  ) {}

  /** Call inside a user gesture (the Answer tap). */
  unlock() {
    if (typeof Audio === "undefined") return;
    this.el ??= new Audio();
    this.el.src = silentWavUrl();
    void this.el.play().catch(() => {});
  }

  get busy() {
    return this.current !== null || this.queue.length > 0;
  }

  enqueue(item: QueueItem) {
    this.queue.push(item);
    if (!this.current) this.next();
  }

  private next() {
    const item = this.queue.shift() ?? null;
    this.current = item;
    if (!item) return this.onIdle();
    this.heard.push(item.id);
    item.onStart();
    const done = () => {
      if (this.current !== item) return;
      item.onEnd();
      this.next();
    };
    const viaBrowser = (enabled: boolean) => {
      this.fallback = new AbortController();
      void speakLine(item.text, { enabled, voice: this.voice, signal: this.fallback.signal }).then(
        done,
      );
    };
    if (!item.speak) {
      if (this.quietPace) {
        const t = setTimeout(done, this.quietPace(item.text));
        this.fallback = new AbortController();
        this.fallback.signal.addEventListener("abort", () => clearTimeout(t));
        return;
      }
      return viaBrowser(false); // voice off: reading-pace timing only
    }
    if (!item.url || !this.el) return viaBrowser(true);
    const el = this.el;
    el.onended = done;
    el.onerror = () => viaBrowser(true); // server voice failed: browser voice instead
    el.src = item.url;
    void el.play().catch(() => {
      // Autoplay may reject once even though the sentence is still unlockable.
      // Do not start a second browser voice while server audio could play.
      el.onerror = done;
      el.src = item.url;
      void el.play().catch(() => {
        el.onerror = null;
        viaBrowser(true);
      });
    });
  }

  /** Stops speaking now (hang-up or barge-in) and drops anything queued. */
  stop() {
    this.queue = [];
    this.current = null;
    this.fallback?.abort();
    stopSpeaking();
    if (this.el) {
      this.el.onended = null;
      this.el.onerror = null;
      this.el.pause();
    }
  }
}

export type MicEvents = {
  /** The person started talking (possibly over the caller). */
  onSpeechStart: () => void;
  /** One finished spoken reply. */
  onUtterance: (audio: Blob) => void;
  /** 0..1 input level, for the waveform. */
  onLevel?: (level: number) => void;
};

const FRAME_MS = 50;
const START_MS = 150; // speech must last this long to count (ignores clicks)
const END_SILENCE_MS = 900; // pause that ends a reply
const MAX_REPLY_MS = 30_000;

export class MicListener {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private noise = 0.01;
  private voicedMs = 0;
  private silentMs = 0;
  private recordingMs = 0;
  muted = false;
  /** Raise the bar while the caller is speaking so their voice (echo) doesn't count. */
  callerSpeaking = false;
  /** Pause detection, e.g. while a reply is being sent. */
  paused = false;

  constructor(private events: MicEvents) {}

  static supported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    );
  }

  /** Asks for the microphone. Throws a user-readable Error if it's denied or missing. */
  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      throw new Error(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was blocked. You can type your replies instead, or allow the mic in your browser settings."
          : "No microphone was found. You can type your replies instead.",
      );
    }
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
    this.timer = setInterval(() => this.tick(), FRAME_MS);
  }

  private level(): number {
    if (!this.analyser) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const x of data) sum += x * x;
    return Math.sqrt(sum / data.length);
  }

  private tick() {
    const rms = this.level();
    this.events.onLevel?.(Math.min(1, rms * 8));
    if (this.muted || this.paused) {
      if (this.recorder) this.finish(false);
      this.voicedMs = 0;
      return;
    }
    const threshold = Math.max(
      this.callerSpeaking ? 0.06 : 0.02,
      this.noise * (this.callerSpeaking ? 5 : 3),
    );
    const voiced = rms > threshold;
    if (!voiced && !this.recorder) this.noise = this.noise * 0.95 + rms * 0.05; // track background noise

    if (!this.recorder) {
      this.voicedMs = voiced ? this.voicedMs + FRAME_MS : 0;
      if (this.voicedMs >= START_MS) this.begin();
      return;
    }
    this.recordingMs += FRAME_MS;
    this.silentMs = voiced ? 0 : this.silentMs + FRAME_MS;
    if (this.silentMs >= END_SILENCE_MS || this.recordingMs >= MAX_REPLY_MS) this.finish(true);
  }

  private begin() {
    if (!this.stream) return;
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
      MediaRecorder.isTypeSupported?.(t),
    );
    this.recorder = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.silentMs = 0;
    this.recordingMs = 0;
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start();
    this.events.onSpeechStart();
  }

  private finish(send: boolean) {
    const rec = this.recorder;
    this.recorder = null;
    this.voicedMs = 0;
    if (!rec) return;
    rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
      if (send && blob.size > 0) this.events.onUtterance(blob);
    };
    if (rec.state !== "inactive") rec.stop();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.finish(false);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
  }
}
