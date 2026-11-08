import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TranscriptState } from '@/features/simulator/store';
import { shareTranscript } from '@/features/simulator/transcripts';
import { colors, MIN_TOUCH, radius, spacing } from '@/theme';

type Props = {
  state?: TranscriptState;
  onRetry: () => void;
  onDelete: () => void;
};

/** Shows the .txt transcript saved for this call, with share and delete. */
export function TranscriptCard({ state, onRetry, onDelete }: Props) {
  const [shareError, setShareError] = useState<string>();

  if (!state || state.status === 'saving') {
    return (
      <View style={styles.card} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.body}>Saving call transcript…</Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.title}>📄 Transcript not saved</Text>
        <Text style={styles.body}>{state.message}</Text>
        <Action label="Try again" onPress={onRetry} />
      </View>
    );
  }

  if (state.status === 'deleted') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>📄 Transcript deleted</Text>
        <Text style={styles.body}>{state.name} was removed from this device.</Text>
      </View>
    );
  }

  const { file } = state;
  const share = async () => {
    setShareError(undefined);
    try {
      if (!(await shareTranscript(file))) setShareError('Sharing isn’t available on this device.');
    } catch {
      setShareError('Couldn’t open the share sheet.');
    }
  };

  return (
    <View style={styles.card} accessible={false}>
      <Text style={styles.title}>📄 Call transcript saved</Text>
      <Text style={styles.filename} selectable>
        {file.name}
      </Text>
      <Text style={styles.body}>
        {file.savedTo === 'download'
          ? 'Downloaded by your browser.'
          : 'Saved on this device only, not on the server. Share it to save a copy elsewhere.'}
      </Text>
      {file.uri ? (
        <View style={styles.row}>
          <Action label="Share" onPress={share} />
          <Action label="Delete" onPress={onDelete} subtle />
        </View>
      ) : null}
      {shareError ? <Text style={styles.error}>{shareError}</Text> : null}
    </View>
  );
}

function Action({ label, onPress, subtle }: { label: string; onPress: () => void; subtle?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} transcript`}
      style={({ pressed }) => [styles.action, subtle && styles.actionSubtle, pressed && { opacity: 0.75 }]}
    >
      <Text style={[styles.actionText, subtle && styles.actionTextSubtle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  filename: { fontSize: 13, color: colors.textMuted, fontFamily: 'Courier' },
  body: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  action: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSubtle: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  actionTextSubtle: { color: colors.text },
  error: { fontSize: 13, color: colors.risky },
});
