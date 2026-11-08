import { type ComponentRef, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { TranscriptEntry } from '@/features/simulator/types';
import { colors, radius, spacing } from '@/theme';

type Props = {
  entries: TranscriptEntry[];
  callerName: string;
  /** Id of the line currently being spoken, if any. */
  speakingId?: string;
  /** Waiting for the caller's next line. */
  typing?: boolean;
};

/** Live captions for the call. Always shown so audio is never required. */
export function ConversationPanel({ entries, callerName, speakingId, typing }: Props) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [entries.length, typing]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      accessibilityLabel="Call captions"
    >
      {entries.map((e) => {
        if (e.speaker === 'sms') {
          return (
            <View
              key={e.id}
              style={styles.sms}
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Simulated text message from ${e.sender}: ${e.text}`}
            >
              <Text style={styles.smsSender}>💬 {e.sender}</Text>
              <Text style={styles.smsBody}>{e.text}</Text>
            </View>
          );
        }
        if (e.speaker === 'system') {
          return (
            <Text key={e.id} style={styles.system}>
              {e.text}
            </Text>
          );
        }
        const isCaller = e.speaker === 'caller';
        const who = e.clipId ? 'Recorded message (real robocall)' : isCaller ? callerName : 'You';
        return (
          <View
            key={e.id}
            style={[styles.bubble, isCaller ? styles.caller : styles.user, e.clipId && styles.recording]}
            accessible
            accessibilityLiveRegion={isCaller ? 'polite' : 'none'}
            accessibilityLabel={`${who}: ${e.text}`}
          >
            <Text style={styles.speaker}>
              {e.clipId ? '📼 ' : ''}
              {who}
              {e.id === speakingId ? (e.clipId ? '  · playing' : '  · speaking') : ''}
            </Text>
            <Text style={isCaller ? styles.callerText : styles.userText}>{e.text}</Text>
          </View>
        );
      })}
      {typing ? (
        <View style={[styles.bubble, styles.caller]} accessible accessibilityLabel={`${callerName} is responding`}>
          <Text style={styles.speaker}>{callerName}</Text>
          <Text style={styles.callerText}>…</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  bubble: { maxWidth: '88%', padding: spacing.md, borderRadius: radius.md, gap: 2 },
  caller: { alignSelf: 'flex-start', backgroundColor: colors.callSurface },
  recording: { borderLeftWidth: 3, borderLeftColor: colors.simBadge },
  user: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  speaker: { color: colors.callTextMuted, fontSize: 12, fontWeight: '600' },
  callerText: { color: colors.callText, fontSize: 17, lineHeight: 24 },
  userText: { color: '#FFFFFF', fontSize: 17, lineHeight: 24 },
  sms: {
    alignSelf: 'stretch',
    backgroundColor: '#2A2D38',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.simBadge,
    gap: spacing.xs,
  },
  smsSender: { color: colors.simBadge, fontSize: 13, fontWeight: '700' },
  smsBody: { color: colors.callText, fontSize: 16, lineHeight: 22 },
  system: { alignSelf: 'center', color: colors.callTextMuted, fontSize: 14, fontStyle: 'italic' },
});
