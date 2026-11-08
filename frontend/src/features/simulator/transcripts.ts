import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { simulatorApi } from './api';

/**
 * Saves a .txt transcript of each finished simulated call on the user's device.
 * The backend formats the text from its in-memory session and never stores it.
 * Files live in the app's document directory (or download, on web) and can be
 * shared or deleted from the debrief.
 */
export type SavedTranscript = {
  name: string;
  /** Local file URI on iOS/Android. On web the file is downloaded instead. */
  uri?: string;
  savedTo: 'device' | 'download';
};

export const TRANSCRIPT_DIR = 'call-transcripts';

/** Keeps only filename-safe characters; always ends in .txt. */
export function safeFilename(name: string): string {
  const base = name.replace(/\.txt$/i, '').replace(/[^\w.-]+/g, '_').slice(0, 120) || 'scam-coach-call';
  return `${base}.txt`;
}

function downloadOnWeb(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveCallTranscript(sessionId: string): Promise<SavedTranscript> {
  const { text, filename } = await simulatorApi.transcript(sessionId, new Date().getTimezoneOffset());
  const name = safeFilename(filename);

  if (Platform.OS === 'web') {
    downloadOnWeb(name, text);
    return { name, savedTo: 'download' };
  }

  const dir = new Directory(Paths.document, TRANSCRIPT_DIR);
  dir.create({ idempotent: true, intermediates: true });
  const file = new File(dir, name);
  file.create({ overwrite: true });
  await file.write(text);
  return { name, uri: file.uri, savedTo: 'device' };
}

/** Opens the system share sheet (Files, Mail, AirDrop…). Returns false if sharing isn't available. */
export async function shareTranscript(t: SavedTranscript): Promise<boolean> {
  if (!t.uri || !(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(t.uri, {
    mimeType: 'text/plain',
    UTI: 'public.plain-text',
    dialogTitle: 'Share call transcript',
  });
  return true;
}

export function deleteTranscript(t: SavedTranscript): void {
  if (!t.uri) return;
  const file = new File(t.uri);
  if (file.exists) file.delete();
}
