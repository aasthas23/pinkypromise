import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type Props = { detail?: string };

/** Always-visible label so a practice call can never pass for a real one. */
export function SimulationBadge({ detail = 'Training call. Not a real phone call.' }: Props) {
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Simulation. ${detail}`}
    >
      <Text style={styles.badge}>SIMULATION</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 212, 59, 0.14)',
    borderWidth: 1,
    borderColor: colors.simBadge,
  },
  badge: {
    color: colors.simBadgeText,
    backgroundColor: colors.simBadge,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  detail: { color: colors.simBadge, fontSize: 13, fontWeight: '600' },
});
