import { useEffect, useMemo, useState } from 'react';

import type { RecordingClip, TranscriptEntry } from '../types';
import { createScriptedVoiceSession, type VoiceSession } from '../voice/voiceSession';

const PAUSE_BEFORE_CALLER_MS = 450;
const SMS_DELAY_MS = 900;

/**
 * Reveals transcript entries one at a time at a natural pace. Real recordings
 * are played, scripted caller lines are spoken (both are held on screen as
 * captions while voice is off), SMS messages
 * arrive after a beat, and user lines appear right away.
 *
 * `isPlaying` is true until every entry has been revealed. The call screen
 * hides response options while it's true, so users answer after the caller finishes.
 */
export function useCallPlayback(
  transcript: TranscriptEntry[],
  voiceEnabled: boolean,
  options: {
    recordings?: RecordingClip[];
    callerVoice?: { pitch?: number; rate?: number };
  } = {},
) {
  const { recordings, callerVoice } = options;
  const [voice] = useState<VoiceSession>(() => createScriptedVoiceSession(voiceEnabled));

  const [played, setPlayed] = useState(0);
  const [speakingId, setSpeakingId] = useState<string | undefined>();

  useEffect(() => {
    voice.setEnabled(voiceEnabled);
  }, [voice, voiceEnabled]);

  useEffect(() => () => voice.stop(), [voice]);

  useEffect(() => {
    if (played >= transcript.length) return;
    const entry = transcript[played];
    const advance = () => {
      setSpeakingId(undefined);
      setPlayed((p) => p + 1);
    };

    if (entry.speaker === 'caller') {
      const clip = entry.clipId ? recordings?.find((c) => c.id === entry.clipId) : undefined;
      const t = setTimeout(() => {
        setSpeakingId(entry.id);
        if (clip) voice.playClip(clip.source, clip.durationSec, clip.transcript, advance);
        else voice.speak(entry.text, advance, callerVoice);
      }, PAUSE_BEFORE_CALLER_MS);
      return () => {
        clearTimeout(t);
        voice.stop();
      };
    }
    if (entry.speaker === 'sms') {
      const t = setTimeout(advance, SMS_DELAY_MS);
      return () => clearTimeout(t);
    }
    advance();
    return undefined;
  }, [played, transcript, voice, recordings, callerVoice]);

  // A caller line becomes visible when it starts playing.
  const visibleCount = useMemo(() => {
    if (played >= transcript.length) return transcript.length;
    const entry = transcript[played];
    return entry.speaker === 'caller' && speakingId === entry.id ? played + 1 : played;
  }, [played, transcript, speakingId]);

  return {
    visibleEntries: transcript.slice(0, visibleCount),
    isPlaying: played < transcript.length,
    speakingId,
    stop: () => voice.stop(),
  };
}
