import { buildDebrief, compareAttempts } from '../engine/debrief';
import {
  answerCall,
  chooseResponse,
  createSession,
  hangUp,
  validateScenario,
  type ClipPicker,
} from '../engine/scenarioMachine';
import { recordingClips } from '../recordings/catalog';
import { amazonOrderScenario as amz } from '../scenarios/amazonOrder';
import { ssaSuspensionScenario as ssa } from '../scenarios/ssaSuspension';
import type { Scenario, SimulatorSession } from '../types';

let clock = 1_000;
const tick = () => (clock += 1_000);

function play(sc: Scenario, optionIds: string[], id = 't', pick?: ClipPicker): SimulatorSession {
  let s = createSession(sc, tick(), id, pick);
  s = answerCall(sc, s, tick());
  for (const o of optionIds) s = chooseResponse(sc, s, o, tick());
  return s;
}

describe('bundled recordings', () => {
  it('every clip transcript is free of phone numbers and callback instructions', () => {
    const unsafe = [
      /\d{3}[\s.-]*\d{3,4}/,
      /\d{7,}/,
      /\(\d{3}\)/,
      /((zero|oh|one|two|three|four|five|six|seven|eight|nine)[\s,.-]+){3,}/i,
      /call (us )?(back )?(at|on)\b/i,
      /toll[- ]free/i,
    ];
    for (const c of recordingClips) {
      for (const re of unsafe) expect([c.id, re.test(c.transcript)]).toEqual([c.id, false]);
    }
  });

  it('each robocall scenario has several real openers to rotate through', () => {
    expect(amz.recordings!.length).toBeGreaterThanOrEqual(3);
    expect(ssa.recordings!.length).toBeGreaterThanOrEqual(3);
  });
});

describe.each([amz, ssa])('$id', (sc) => {
  it('is a well-formed graph', () => {
    expect(validateScenario(sc)).toEqual([]);
  });

  it('opens with the chosen real recording as the first caller entry', () => {
    const last = sc.recordings![sc.recordings!.length - 1];
    const s = play(sc, [], 'r', (clips) => clips[clips.length - 1]);
    expect(s.transcript[0]).toMatchObject({ speaker: 'caller', clipId: last.id, text: last.transcript });
    expect(s.redFlagsSeen).toEqual(expect.arrayContaining(['prerecorded_message', 'press_one']));
  });

  it('pressing 1 logs a keypad event and connects to a live agent', () => {
    const s = play(sc, ['robo_press1']);
    expect(s.events.map((e) => e.type)).toContain('keypad_pressed');
    expect(s.transcript.some((t) => t.speaker === 'system' && t.text === 'You pressed 1.')).toBe(true);
    expect(s.currentNodeId).not.toBe('robocall');
    expect(s.status).toBe('active');
  });

  it('hanging up during the recording is protected', () => {
    const s = hangUp(sc, play(sc, []), tick());
    const d = buildDebrief(sc, s);
    expect(d.outcome).toBe('protected');
    expect(d.recording?.id).toBe(sc.recordings![0].id);
    expect(d.provenance).toMatch(/real robocall recording/);
  });

  it('verifying without pressing anything is the best ending', () => {
    const verifyOption = (sc.nodes.robocall as { options: { id: string; behavior: string }[] }).options.find(
      (o) => o.behavior === 'verify',
    )!;
    const s = play(sc, [verifyOption.id]);
    expect(s.endingId).toBe('verified_before_engaging');
    expect(buildDebrief(sc, s).keyBehaviors.pressedKeypad).toBe(false);
  });
});

describe('amazon order scenario paths', () => {
  it('full compliance ends exposed with remote access and payment recorded', () => {
    const s = play(amz, ['robo_press1', 'intro_give_email', 'ra_allow', 'gc_pay']);
    expect(s.endingId).toBe('exposed');
    const d = buildDebrief(amz, s);
    expect(d.keyBehaviors.disclosed).toEqual([
      'personal details',
      'remote access to your device',
      'gift card numbers',
    ]);
    expect(d.recoverySteps.length).toBeGreaterThan(0);
    expect(d.tally.risky).toBe(4); // press 1, email, remote access, gift cards
  });

  it('refusing gift cards after giving access is a recovery, not a clean refusal', () => {
    const s = play(amz, ['robo_press1', 'intro_give_email', 'ra_allow', 'gc_refuse']);
    expect(s.endingId).toBe('recovered');
  });

  it('refusing with nothing disclosed is protected', () => {
    const s = play(amz, ['robo_press1', 'intro_challenge', 'dodge_continue', 'ra_refuse', 'pr_refuse']);
    expect(s.endingId).toBe('refused');
    expect(buildDebrief(amz, s).keyBehaviors.protectedSensitive).toBe(true);
  });

  it('caller discourages checking, holding firm verifies', () => {
    const s = play(amz, ['robo_press1', 'intro_verify', 'disc_hold_firm']);
    expect(s.redFlagsSeen).toContain('discouraging_verification');
    expect(s.endingId).toBe('verified');
  });
});

describe('ssa scenario paths', () => {
  it('confirming SSN digits then paying ends exposed', () => {
    const s = play(ssa, ['robo_press1', 'off_give_ssn', 'thr_pay']);
    expect(s.endingId).toBe('exposed');
    expect(s.redFlagsSeen).toEqual(expect.arrayContaining(['threat_of_arrest', 'gift_card_payment', 'secrecy_demand']));
  });

  it('challenging then refusing the gift card demand is protected', () => {
    const s = play(ssa, ['robo_press1', 'off_challenge', 'thr_refuse']);
    expect(s.endingId).toBe('refused');
  });

  it('retry comparison reports not pressing the key', () => {
    const before = play(ssa, ['robo_press1', 'off_give_ssn', 'thr_pay'], 'a');
    const after = play(ssa, ['robo_check_official'], 'b');
    const diffs = compareAttempts(ssa, before, after);
    expect(diffs.map((d) => d.direction)).not.toContain('worse');
    expect(diffs.some((d) => /didn’t press anything/.test(d.text))).toBe(true);
  });
});
