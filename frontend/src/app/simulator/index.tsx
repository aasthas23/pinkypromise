import { router } from 'expo-router';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { scenarios } from '@/features/simulator/scenarios';
import { useSimulatorStore } from '@/features/simulator/store';
import { colors, radius, spacing } from '@/theme';

export default function ScenarioSelect() {
  const start = useSimulatorStore((s) => s.start);
  const voiceEnabled = useSimulatorStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useSimulatorStore((s) => s.setVoiceEnabled);
  const attempts = useSimulatorStore((s) => s.history.length);

  const begin = (id: string) => {
    if (start(id)) router.push('/simulator/incoming');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.lead} accessibilityRole="header">
        Practice handling a suspicious call
      </Text>
      <Text style={styles.body}>
        Pick a scenario and take a simulated call. Answer however you would in real life. You’ll get a debrief afterward.
      </Text>

      <View style={styles.notice} accessible accessibilityLabel="About these practice calls">
        <Text style={styles.noticeTitle}>🛡️ These calls are simulated</Text>
        <Text style={styles.noticeBody}>
          Nothing here is a real call, and nothing affects your real phone or account. You respond by tapping scripted answers, so you never type real personal information. Your answers stay on this device and are cleared when you close the app.
        </Text>
      </View>

      {scenarios.map((sc) => (
        <View key={sc.id} style={styles.card}>
          {sc.recordings?.length ? (
            <Text style={styles.realTag}>📼 Real robocall recording</Text>
          ) : null}
          <Text style={styles.cardTitle}>{sc.title}</Text>
          <Text style={styles.meta}>
            {sc.difficulty[0].toUpperCase() + sc.difficulty.slice(1)} · about {sc.estimatedMinutes} min
          </Text>
          <Text style={styles.body}>{sc.description}</Text>
          <Text style={styles.subhead}>You’ll practice</Text>
          {sc.learningObjectives.map((o) => (
            <Text key={o} style={styles.bullet}>
              • {o}
            </Text>
          ))}
          {sc.provenance ? <Text style={styles.provenance}>{sc.provenance}</Text> : null}
          <View style={styles.voiceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.voiceLabel}>Call audio</Text>
              <Text style={styles.voiceHint}>Recordings and caller voice. Captions are always shown.</Text>
            </View>
            <Switch
              value={voiceEnabled}
              onValueChange={setVoiceEnabled}
              trackColor={{ true: colors.accent }}
              accessibilityLabel="Call audio"
            />
          </View>
          <Button
            label="Start practice call"
            onPress={() => begin(sc.id)}
            accessibilityHint="Shows a simulated incoming call"
          />
        </View>
      ))}

      <Text style={styles.footer}>
        {attempts > 0 ? `${attempts} practice call${attempts > 1 ? 's' : ''} this session. ` : ''}
        Scam Coach is a training prototype. It isn’t affiliated with or endorsed by any carrier, and it can’t tell you whether a real caller is legitimate.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  lead: { fontSize: 26, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  notice: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  noticeTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  noticeBody: { fontSize: 15, lineHeight: 21, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  realTag: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  provenance: { fontSize: 13, lineHeight: 19, color: colors.textMuted, fontStyle: 'italic' },
  meta: { fontSize: 14, color: colors.textMuted },
  subhead: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  bullet: { fontSize: 15, lineHeight: 21, color: colors.text },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  voiceLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  voiceHint: { fontSize: 13, color: colors.textMuted },
  footer: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
});
