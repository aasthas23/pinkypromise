import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { verificationService, callPreferencesService, simulationService, backendSimulatorService } from "@/lib/services";
import { initialState, resetDemo, useDemo } from "@/lib/store";
import { renderHook, act } from "@testing-library/react";
import { BIWEEKLY_INTERVAL_DAYS, nextCallDate, tacticAnalytics } from "@/lib/analytics";
import { customers } from "@/lib/mock-data";

describe("Pinky Promise rules", () => {
 beforeEach(() => { vi.useFakeTimers(); resetDemo(); });
 afterEach(() => vi.useRealTimers());
 it("finds a customer by name or ID", () => {
   expect(verificationService.findCustomers("Maria Chen").map((c) => c.id)).toEqual(["maria"]);
   expect(verificationService.findCustomers(" ALEX ").map((c) => c.id)).toEqual(["alex"]);
   expect(verificationService.findCustomers("")).toEqual([]);
   expect(verificationService.findCustomers("unknown")).toEqual([]);
 });
 it("requires a valid selected customer to generate a code", async () => {
   await expect(verificationService.generate("")).rejects.toThrow("Select a valid customer");
 });
 it("sends the code to the selected customer and rejects another customer's check", async () => {
   const { result } = renderHook(() => useDemo());
   await act(async () => { const promise = verificationService.generate("maria"); await vi.advanceTimersByTimeAsync(500); await promise; });
   expect(result.current.verification?.customerId).toBe("maria");
   expect(result.current.verification?.customerName).toBe("Maria Chen");
   expect(result.current.verification?.sentAt).toBe(result.current.verification?.createdAt);
   const code = result.current.verification?.code ?? "";
   act(() => { expect(verificationService.check(code, "alex")).toBe("invalid"); });
   expect(result.current.verification?.status).toBe("pending");
   act(() => { expect(verificationService.check(code, "maria")).toBe("verified"); });
 });
 it("checks a customer-entered employee code", async () => {
   const { result } = renderHook(() => useDemo());
   await act(async () => { const promise = verificationService.generate("alex"); await vi.advanceTimersByTimeAsync(500); await promise; });
   const code = result.current.verification?.code;
   expect(code).toMatch(/^\d{4}$/);
   act(() => { expect(verificationService.check("wrong")).toBe("invalid"); });
   expect(result.current.verification?.status).toBe("pending");
   act(() => { expect(verificationService.check(code ?? "")).toBe("verified"); });
   expect(result.current.verification?.status).toBe("verified");
 });
 it("does not verify an expired employee code", async () => {
   const { result } = renderHook(() => useDemo());
   await act(async () => { const promise = verificationService.generate("alex"); await vi.advanceTimersByTimeAsync(500); await promise; });
   await vi.advanceTimersByTimeAsync(60001);
   act(() => { expect(verificationService.check(result.current.verification?.code ?? "")).toBe("expired"); });
   expect(result.current.verification?.status).toBe("expired");
 });
 it("lets customers opt in and out of biweekly calls", () => {
   const { result } = renderHook(() => useDemo());
   expect(initialState.biweeklyOptIn).toBe(false);
   act(() => callPreferencesService.setBiweeklyOptIn(true));
   expect(result.current.biweeklyOptIn).toBe(true);
   act(() => callPreferencesService.setBiweeklyOptIn(false));
   expect(result.current.biweeklyOptIn).toBe(false);
   expect(result.current.biweeklyConsentAt).toBeNull();
 });
 it("biweekly means every fourteen days", () => {
   expect(BIWEEKLY_INTERVAL_DAYS).toBe(14);
   expect(nextCallDate(0)).toBe(14 * 24 * 60 * 60 * 1000);
   expect(nextCallDate(null)).toBeNull();
 });
 it("shares biweekly simulation results with the analyst state", async () => {
   const { result } = renderHook(() => useDemo());
   await act(async () => { const promise = simulationService.evaluate("beginner", "biweekly"); await vi.advanceTimersByTimeAsync(1400); await promise; });
   expect(result.current.callHistory).toHaveLength(1);
   expect(result.current.callHistory[0]?.source).toBe("biweekly");
   expect(result.current.simulations).toBe(4);
 });
 it("aggregates scam susceptibility for the analyst board", () => {
   const urgency = tacticAnalytics(customers).find((x) => x.tactic === "Urgency");
   expect(urgency?.score).toBe(50);
   expect(urgency?.affected).toBe(3);
 });

 it("runs a short simulator call and fetches the transcript text", async () => {
   const fetchMock = vi.fn()
     .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "call-123", status: "ringing", transcript: [], node: null }) })
     .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "call-123", status: "active", transcript: [{ speaker: "caller", text: "Hi, this is Jordan with T-Mobile Account Protection." }], node: { id: "intro" } }) })
     .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "call-123", status: "active", transcript: [{ speaker: "caller", text: "Hi, this is Jordan with T-Mobile Account Protection." }, { speaker: "user", text: "Before I answer, who is this exactly?" }], node: { id: "authority" } }) })
     .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "call-123", status: "active", transcript: [{ speaker: "caller", text: "Hi, this is Jordan with T-Mobile Account Protection." }, { speaker: "user", text: "Before I answer, who is this exactly?" }, { speaker: "caller", text: "We flagged a SIM transfer request on your line." }], node: { id: "discourage_callback" } }) })
     .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "call-123", status: "active", transcript: [{ speaker: "caller", text: "Hi, this is Jordan with T-Mobile Account Protection." }, { speaker: "user", text: "Before I answer, who is this exactly?" }, { speaker: "caller", text: "We flagged a SIM transfer request on your line." }, { speaker: "user", text: "I’ll call the official number now." }], node: { id: "pressure" } }) })
     .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "call-123", status: "ended", transcript: [{ speaker: "caller", text: "Hi, this is Jordan with T-Mobile Account Protection." }, { speaker: "user", text: "Before I answer, who is this exactly?" }, { speaker: "caller", text: "We flagged a SIM transfer request on your line." }, { speaker: "user", text: "I’ll call the official number now." }, { speaker: "system", text: "(You hung up)" }], node: null }) })
     .mockResolvedValueOnce({ ok: true, text: async () => "SCAM COACH: SIMULATED CALL TRANSCRIPT\n\nCaller: Hi, this is Jordan with T-Mobile Account Protection.\nUser: I’ll call the official number now.\nSystem: (You hung up)\n" });

   vi.stubGlobal("fetch", fetchMock);

   const result = await backendSimulatorService.runTestCall("account-security-sim-swap");

   expect(result.sessionId).toBe("call-123");
   expect(result.transcriptText).toContain("SCAM COACH: SIMULATED CALL TRANSCRIPT");
   expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/simulator/sessions", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Content-Type": "application/json" }) }));
   expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/simulator/sessions/call-123/hangup", expect.objectContaining({ method: "POST" }));
 });
});
