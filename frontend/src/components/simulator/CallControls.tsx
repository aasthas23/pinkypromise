import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, MIN_TOUCH, spacing } from '@/theme';

type Props = {
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  hintAvailable: boolean;
  onHint: () => void;
  onHangUp: () => void;
  callEnded: boolean;
};

/**
 * In-call controls. There's no mute button because the MVP never records the
 * microphone. "Caller voice" toggles text-to-speech and captions stay on.
 */
export function CallControls({
  voiceEnabled,
  onToggleVoice,
  hintAvailable,
  onHint,
  onHangUp,
  callEnded,
}: Props) {
  return (
    <View style={styles.row}>
      <RoundButton
        icon={voiceEnabled ? '🔊' : '🔇'}
        label={voiceEnabled ? 'Voice on' : 'Voice off'}
        a11yLabel="Caller voice"
        a11yHint="Turns the simulated caller's spoken voice on or off. Captions always stay on."
        selected={voiceEnabled}
        onPress={onToggleVoice}
      />
      <RoundButton
        icon="✕"
        label="Hang up"
        a11yLabel="Hang up"
        a11yHint="Ends the simulated call and opens your debrief"
        danger
        large
        disabled={callEnded}
        onPress={onHangUp}
      />
      <RoundButton
        icon="💡"
        label="Hint"
        a11yLabel="Training hint"
        a11yHint="Shows a hint for this moment. Hints are noted in your debrief."
        disabled={!hintAvailable}
        onPress={onHint}
      />
    </View>
  );
}

type RoundProps = {
  icon: string;
  label: string;
  a11yLabel: string;
  a11yHint: string;
  onPress: () => void;
  danger?: boolean;
  large?: boolean;
  selected?: boolean;
  disabled?: boolean;
};

function RoundButton({ icon, label, a11yLabel, a11yHint, onPress, danger, large, selected, disabled }: RoundProps) {
  const size = large ? 76 : 60;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={selected === undefined ? 'button' : 'switch'}
      accessibilityLabel={a11yLabel}
      accessibilityHint={a11yHint}
      accessibilityState={{ disabled, checked: selected }}
      style={({ pressed }) => [styles.item, { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}
      hitSlop={8}
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          danger && { backgroundColor: colors.decline },
          selected && { backgroundColor: '#3A3D4A' },
        ]}
      >
        <Text style={[styles.icon, large && styles.iconLarge]}>{icon}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  item: { alignItems: 'center', gap: spacing.xs, minWidth: MIN_TOUCH },
  circle: { backgroundColor: colors.callSurface, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22, color: colors.callText },
  iconLarge: { fontSize: 28, fontWeight: '700' },
  label: { color: colors.callTextMuted, fontSize: 13 },
});
