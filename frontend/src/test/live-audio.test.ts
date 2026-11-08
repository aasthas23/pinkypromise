import { afterEach, describe, expect, it, vi } from "vitest";

import { VoicePlayer } from "@/lib/live-audio";

describe("VoicePlayer", () => {
  afterEach(() => vi.useRealTimers());

  const item = (id: string, log: string[], speak = false) => ({
    id,
    url: null,
    text: "A short caller sentence for the test.",
    speak,
    onStart: () => log.push(`start ${id}`),
    onEnd: () => log.push(`end ${id}`),
  });

  it("plays sentences in order and reports when the caller has finished", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const p = new VoicePlayer();
    p.onIdle = () => log.push("idle");
    p.enqueue(item("u1", log));
    p.enqueue(item("u2", log));
    expect(p.busy).toBe(true);
    await vi.runAllTimersAsync(); // voice muted: each line is held for reading time, captions only
    expect(log).toEqual(["start u1", "end u1", "start u2", "end u2", "idle"]);
    expect(p.heard).toEqual(["u1", "u2"]);
    expect(p.busy).toBe(false);
  });

  it("stops immediately on barge-in and drops queued sentences", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const p = new VoicePlayer();
    p.enqueue(item("u1", log));
    p.enqueue(item("u2", log));
    p.stop();
    await vi.runAllTimersAsync();
    expect(log).toEqual(["start u1"]);
    expect(p.heard).toEqual(["u1"]);
    expect(p.busy).toBe(false);
  });

  it("text chat shows caller lines at a quick typing pace when the voice is off", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const p = new VoicePlayer(undefined, () => 300);
    p.enqueue(item("u1", log));
    await vi.advanceTimersByTimeAsync(299);
    expect(log).toEqual(["start u1"]);
    await vi.advanceTimersByTimeAsync(2);
    expect(log).toEqual(["start u1", "end u1"]);
  });
});
