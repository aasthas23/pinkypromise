import { StyleSheet, Text, View } from 'react-native';

import type { TimelineItem, TimelineKind } from '@/features/simulator/types';
import { colors, radius, spacing } from '@/theme';

const KIND_STYLE: Record<TimelineKind, { fg: string; bg: string; tag: string }> = {
  protective: { fg: colors.protective, bg: colors.protectiveSoft, tag: 'Protective' },
  risky: { fg: colors.risky, bg: colors.riskySoft, tag: 'Risky' },
  neutral: { fg: colors.neutral, bg: colors.neutralSoft, tag: 'Neutral' },
  info: { fg: colors.warning, bg: colors.warningSoft, tag: 'Hint' },
};

function formatOffset(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function DebriefTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <View style={styles.list}>
      {items.map((item) => {
        const k = KIND_STYLE[item.kind];
        return (
          <View
            key={item.id}
            style={styles.row}
            accessible
            accessibilityLabel={`${formatOffset(item.offsetMs)}. ${k.tag}. ${item.label}. ${item.quote ? `You said: ${item.quote}.` : ''} ${item.rationale ?? ''}`}
          >
            <Text style={styles.time}>{formatOffset(item.offsetMs)}</Text>
            <View style={[styles.card, { borderLeftColor: k.fg }]}>
              <View style={styles.header}>
                <Text style={styles.label}>{item.label}</Text>
                <Text style={[styles.tag, { color: k.fg, backgroundColor: k.bg }]}>{k.tag}</Text>
              </View>
              {item.quote ? <Text style={styles.quote}>“{item.quote}”</Text> : null}
              {item.rationale ? <Text style={styles.rationale}>{item.rationale}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  time: { width: 40, color: colors.textMuted, fontSize: 13, paddingTop: spacing.md, fontVariant: ['tabular-nums'] },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: spacing.md,
    gap: spacing.xs,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  label: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  tag: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  quote: { color: colors.text, fontSize: 15, fontStyle: 'italic' },
  rationale: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
