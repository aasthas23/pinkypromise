import { buildDebrief, compareAttempts } from '../engine/debrief';
import { countEvents } from '../engine/eventTracker';
import {
  answerCall,
  chooseResponse,
  createSession,
  declineCall,
  hangUp,
  requestHint,
  validateScenario,
} from '../engine/scenarioMachine';
import { accountSecurityScenario as sc } from '../scenarios/accountSecurity';
import type { SimulatorSession } from '../types';

let clock = 1_000;
const tick = () => (clock += 1_000);

function play(optionIds: string[], id = 'test'): SimulatorSession {
  let s = createSession(sc, tick(), id);
  s = answerCall(sc, s, tick());
  for (const o of optionIds) s = chooseResponse(sc, s, o, tick());
  return s;
}

const types = (s: SimulatorSession) => s.events.map((e) => e.type);

describe('account security scenario data', () => {
  it('is a well-formed graph', () => {
    expect(validateScenario(sc)).toEqual([]);
  });

  it('every dialogue node can reach an ending', () => {
    const reachesEnd = (id: string, seen = new Set<string>()): boolean => {
      const n = sc.nodes[id];
      if (n.kind === 'ending') return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return n.options.some((o) => reachesEnd(o.next, new Set(seen)));
    };
    for (const id of Object.keys(sc.nodes)) expect(reachesEnd(id)).toBe(true);
  });
});

describe('scenario machine', () => {
  it('starts ringing with a call_presented event', () => {
    const s = createSession(sc, 0, 'x');
    expect(s.status).toBe('ringing');
    expect(types(s)).toEqual(['call_presented']);
    expect(s.transcript).toHaveLength(0);
  });

  it('answering plays the intro and records the first red flag', () => {
    const s = play([]);
    expect(s.status).toBe('active');
    expect(s.currentNodeId).toBe('intro');
    expect(s.transcript[0].speaker).toBe('caller');
    expect(s.redFlagsSeen).toEqual(['unsolicited_contact']);
  });

  it('verification path ends protected without disclosure', () => {
    const s = play(['intro_challenge', 'authority_verify', 'discourage_hold_firm']);
    expect(s.status).toBe('ended');
    expect(s.endingId).toBe('verified');
    expect(types(s)).toContain('independent_verification_requested');
    expect(types(s)).toContain('caller_challenged');
    expect(types(s)).not.toContain('dummy_code_disclosed');
    expect(s.redFlagsSeen).toContain('discouraging_verification');
  });

  it('compliance path discloses code and PIN and ends exposed', () => {
    const s = play(['intro_yes', 'authority_panic', 'urgency_disclose', 'pin_disclose']);
    expect(s.endingId).toBe('exposed');
    expect(types(s)).toEqual(expect.arrayContaining(['dummy_code_disclosed', 'dummy_pin_disclosed']));
    expect(s.transcript.some((t) => t.speaker === 'sms')).toBe(true);
  });

  it('refusal path under pressure ends protected', () => {
    const s = play(['intro_yes', 'authority_panic', 'urgency_refuse', 'pressure_refuse']);
    expect(s.endingId).toBe('refused');
    expect(countEvents(s, 'sensitive_information_refused')).toBe(2);
    expect(s.redFlagsSeen).toEqual(expect.arrayContaining(['code_request', 'emotional_pressure']));
  });

  it('challenge path exposes caller-ID-as-proof tactics', () => {
    const s = play(['intro_yes', 'authority_challenge', 'proof_refuse']);
    expect(s.endingId).toBe('refused');
    expect(s.redFlagsSeen).toEqual(expect.arrayContaining(['caller_id_as_proof', 'partial_info_as_proof']));
  });

  it('stopping after the code gives the recovered ending', () => {
    const s = play(['intro_yes', 'authority_panic', 'urgency_disclose', 'pin_stop']);
    expect(s.endingId).toBe('recovered');
  });

  it('hang up before disclosure is protected; after disclosure is recovered', () => {
    const early = hangUp(sc, play(['intro_yes']), tick());
    expect(early.status).toBe('ended');
    expect(early.endingId).toBe('hung_up');
    expect(early.events.at(-1)).toMatchObject({ type: 'call_ended', endedBy: 'user_hang_up' });

    const late = hangUp(sc, play(['intro_yes', 'authority_panic', 'urgency_disclose']), tick());
    expect(late.endingId).toBe('hung_up_after_disclosure');
  });

  it('declining ends the call without answering', () => {
    const s = declineCall(sc, createSession(sc, tick(), 'd'), tick());
    expect(s.status).toBe('ended');
    expect(s.endingId).toBe('declined');
    expect(types(s)).toEqual(['call_presented', 'call_declined', 'call_ended']);
  });

  it('ignores invalid actions instead of corrupting state', () => {
    const ringing = createSession(sc, tick(), 'r');
    expect(chooseResponse(sc, ringing, 'intro_yes', tick())).toBe(ringing);
    expect(hangUp(sc, ringing, tick())).toBe(ringing);

    const active = play([]);
    expect(chooseResponse(sc, active, 'not_an_option', tick())).toBe(active);
    expect(answerCall(sc, active, tick())).toBe(active);

    const ended = hangUp(sc, active, tick());
    expect(hangUp(sc, ended, tick())).toBe(ended);
    expect(chooseResponse(sc, ended, 'intro_yes', tick())).toBe(ended);
  });

  it('logs hint requests with the current phase', () => {
    const { session, hint } = requestHint(sc, play([]), tick());
    expect(hint).toBeTruthy();
    expect(session.events.at(-1)).toMatchObject({ type: 'hint_requested', phase: 'intro' });
  });

  it('reset: a new session starts clean and gets new ids', () => {
    const first = play(['intro_yes', 'authority_panic', 'urgency_disclose', 'pin_disclose'], 'a');
    const second = createSession(sc, tick(), 'b');
    expect(second.events).toHaveLength(1);
    expect(second.redFlagsSeen).toEqual([]);
    expect(second.events[0].id).not.toBe(first.events[0].id);
  });

  it('event ids are unique within a session', () => {
    const s = play(['intro_challenge', 'authority_challenge', 'proof_verify', 'discourage_hold_firm']);
    const ids = [...s.events.map((e) => e.id), ...s.transcript.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('debrief', () => {
  it('is grounded in the events of a protected run', () => {
    const s = play(['intro_challenge', 'authority_verify', 'discourage_hold_firm']);
    const d = buildDebrief(sc, s);
    expect(d.outcome).toBe('protected');
    expect(d.tally).toEqual({ protective: 3, risky: 0 });
    expect(d.keyBehaviors.verifiedIndependently).toBe(true);
    expect(d.keyBehaviors.protectedSensitive).toBeNull(); // nothing sensitive was requested
    expect(d.recoverySteps).toEqual([]);
    expect(d.timeline.map((t) => t.quote).filter(Boolean)).toHaveLength(3);
  });

  it('includes recovery steps after disclosure', () => {
    const d = buildDebrief(sc, play(['intro_yes', 'authority_panic', 'urgency_disclose', 'pin_disclose']));
    expect(d.outcome).toBe('exposed');
    expect(d.tally.risky).toBe(2);
    expect(d.recoverySteps.length).toBeGreaterThan(0);
    expect(d.redFlags.map((f) => f.id)).toContain('escalating_requests');
  });

  it('counts a hang-up as a protective action', () => {
    const d = buildDebrief(sc, hangUp(sc, play(['intro_yes']), tick()));
    expect(d.timeline.at(-1)).toMatchObject({ label: 'Hung up', kind: 'protective' });
  });

  it('throws for a session that has not ended', () => {
    expect(() => buildDebrief(sc, play([]))).toThrow();
  });

  it('compares attempts on observable behaviors', () => {
    const before = play(['intro_yes', 'authority_panic', 'urgency_disclose', 'pin_disclose'], 'p');
    const after = play(['intro_yes', 'authority_panic', 'urgency_refuse', 'pressure_verify'], 'q');
    const diffs = compareAttempts(sc, before, after);
    expect(diffs.map((d) => d.direction)).not.toContain('worse');
    expect(diffs.some((d) => /didn’t share anything sensitive/.test(d.text))).toBe(true);
    expect(diffs.some((d) => /verify independently/.test(d.text))).toBe(true);
  });
});
