import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { API_BASE_URL } from '@/features/simulator/api';
import { useSimulatorStore } from '@/features/simulator/store';
import { colors, radius, spacing } from '@/theme';

export default function ScenarioSelect() {
  const scenarios = useSimulatorStore((s) => s.scenarios);
  const status = useSimulatorStore((s) => s.status);
  const loadError = useSimulatorStore((s) => s.loadError);
  const loadScenarios = useSimulatorStore((s) => s.loadScenarios);
  const start = useSimulatorStore((s) => s.start);
  const pending = useSimulatorStore((s) => s.pending);
  const error = useSimulatorStore((s) => s.error);
  const voiceEnabled = useSimulatorStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useSimulatorStore((s) => s.setVoiceEnabled);
  const attempts = useSimulatorStore((s) => s.attempts);

  useEffect(() => {
    if (!useSimulatorStore.getState().scenarios) loadScenarios();
  }, [loadScenarios]);

  const begin = async (id: string) => {
    if (await start(id)) router.push('/simulator/incoming');
  };
  const aiOn = status?.dialogue === 'model';

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
          Nothing here is a real call, and nothing affects your real phone or account. Never type real personal information. Any number or email you type is removed before it’s used, and calls aren’t saved.
        </Text>
        {status ? (
          <Text style={styles.noticeBody}>
            {aiOn
              ? '🤖 AI caller is on: the caller’s lines are written by Claude, and what you type is sent to Anthropic’s API to understand your reply.'
              : '📄 AI caller is off: the caller follows a script, and you respond with suggested replies.'}
          </Text>
        ) : null}
      </View>

      {!scenarios && !loadError ? <ActivityIndicator color={colors.accent} accessibilityLabel="Loading scenarios" /> : null}
      {loadError ? (
        <View style={styles.errorBox} accessibilityLiveRegion="polite">
          <Text style={styles.errorTitle}>Couldn’t load practice calls</Text>
          <Text style={styles.body}>{loadError}</Text>
          <Text style={styles.voiceHint}>Is the backend running? It’s expected at {API_BASE_URL}.</Text>
          <Button label="Try again" variant="secondary" onPress={loadScenarios} />
        </View>
      ) : null}
      {error ? <Text style={styles.errorInline}>{error}</Text> : null}

      {(scenarios ?? []).map((sc) => (
        <View key={sc.id} style={styles.card}>
          {sc.hasRecording ? (
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
            label={pending ? 'Connecting…' : 'Start practice call'}
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
  errorBox: {
    backgroundColor: colors.riskySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  errorTitle: { fontSize: 16, fontWeight: '700', color: colors.risky },
  errorInline: { fontSize: 14, color: colors.risky },
  footer: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
});
