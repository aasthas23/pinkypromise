import * as Sharing from 'expo-sharing';

import { filenameFromDisposition, simulatorApi } from '../api';
import { useSimulatorStore } from '../store';
import { deleteTranscript, safeFilename, saveCallTranscript, shareTranscript } from '../transcripts';
import type { SessionView } from '../types';

// jest.mock factories are hoisted above imports; they may only use `mock`-prefixed variables.
const mockWritten: Record<string, string> = {};

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return this.uri in mockWritten;
    }
    create() {}
    async write(text: string) {
      mockWritten[this.uri] = text;
    }
    delete() {
      delete mockWritten[this.uri];
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs' } } };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));


const TEXT = 'SCAM COACH: SIMULATED CALL TRANSCRIPT\n...';

beforeEach(() => {
  jest.restoreAllMocks();
  for (const k of Object.keys(mockWritten)) delete mockWritten[k];
  jest.spyOn(simulatorApi, 'transcript').mockResolvedValue({
    text: TEXT,
    filename: 'scam-coach_ssa-suspension_20261107-184200.txt',
  });
});

it('sanitizes filenames', () => {
  expect(safeFilename('../../etc/passwd')).toBe('.._.._etc_passwd.txt');
  expect(safeFilename('scam-coach_a_1.txt')).toBe('scam-coach_a_1.txt');
  expect(safeFilename('')).toBe('scam-coach-call.txt');
});

it('reads the filename from Content-Disposition', () => {
  expect(filenameFromDisposition('attachment; filename="scam-coach_x_1.txt"')).toBe('scam-coach_x_1.txt');
  expect(filenameFromDisposition(null)).toBeUndefined();
});

it('writes the transcript to the app documents folder, then shares and deletes it', async () => {
  const saved = await saveCallTranscript('s1');
  expect(saved).toEqual({
    name: 'scam-coach_ssa-suspension_20261107-184200.txt',
    uri: 'file:///docs/call-transcripts/scam-coach_ssa-suspension_20261107-184200.txt',
    savedTo: 'device',
  });
  expect(mockWritten[saved.uri!]).toBe(TEXT);
  expect(simulatorApi.transcript).toHaveBeenCalledWith('s1', new Date().getTimezoneOffset());

  expect(await shareTranscript(saved)).toBe(true);
  expect(Sharing.shareAsync).toHaveBeenCalledWith(saved.uri, expect.objectContaining({ mimeType: 'text/plain' }));

  deleteTranscript(saved);
  expect(mockWritten[saved.uri!]).toBeUndefined();
});

it('the store saves a transcript once when a call ends', async () => {
  const view = (status: SessionView['status']): SessionView => ({
    sessionId: 'abc',
    scenarioId: 'ssa-suspension',
    status,
    transcript: [],
    node: null,
    endingId: status === 'ended' ? 'hung_up' : null,
    answeredAtMs: 1,
    freeTextAvailable: false,
  });
  useSimulatorStore.setState({ session: view('active'), transcripts: {} });
  jest.spyOn(simulatorApi, 'hangUp').mockResolvedValue(view('ended'));

  await useSimulatorStore.getState().hangUp();
  await new Promise((r) => setTimeout(r, 0));

  const t = useSimulatorStore.getState().transcripts.abc;
  expect(t).toMatchObject({ status: 'saved', file: { name: 'scam-coach_ssa-suspension_20261107-184200.txt' } });
  expect(simulatorApi.transcript).toHaveBeenCalledTimes(1);

  useSimulatorStore.getState().deleteSavedTranscript('abc');
  expect(useSimulatorStore.getState().transcripts.abc).toEqual({
    status: 'deleted',
    name: 'scam-coach_ssa-suspension_20261107-184200.txt',
  });
});

it('the store records an error if saving fails', async () => {
  jest.spyOn(simulatorApi, 'transcript').mockRejectedValue(new Error('Can’t reach the practice server.'));
  await useSimulatorStore.getState().saveTranscript('zzz');
  expect(useSimulatorStore.getState().transcripts.zzz).toEqual({
    status: 'error',
    message: 'Can’t reach the practice server.',
  });
});
