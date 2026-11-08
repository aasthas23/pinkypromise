import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';

type Props = {
  name: string;
  number: string;
  status: string;
  large?: boolean;
};

export function CallerDisplay({ name, number, status, large }: Props) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Simulated caller ${name}, ${number}. ${status}`}
    >
      <View style={[styles.avatar, large && styles.avatarLarge]}>
        <Text style={[styles.initials, large && styles.initialsLarge]}>{initials}</Text>
      </View>
      <Text style={[styles.name, large && styles.nameLarge]}>{name}</Text>
      <Text style={styles.number}>{number}</Text>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.callSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarLarge: { width: 112, height: 112, borderRadius: 56 },
  initials: { color: colors.callText, fontSize: 22, fontWeight: '600' },
  initialsLarge: { fontSize: 38 },
  name: { color: colors.callText, fontSize: 24, fontWeight: '600' },
  nameLarge: { fontSize: 32 },
  number: { color: colors.callTextMuted, fontSize: 16 },
  status: { color: colors.callTextMuted, fontSize: 15, fontVariant: ['tabular-nums'] },
});
