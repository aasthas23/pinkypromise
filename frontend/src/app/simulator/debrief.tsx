import { Redirect, router } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { DebriefTimeline } from '@/components/simulator/DebriefTimeline';
import { TranscriptCard } from '@/components/simulator/TranscriptCard';
import { ApiError, simulatorApi } from '@/features/simulator/api';
import { useSimulatorStore } from '@/features/simulator/store';
import type { Debrief, Outcome } from '@/features/simulator/types';
import { colors, radius, spacing } from '@/theme';

const OUTCOME_STYLE: Record<Outcome, { label: string; fg: string; bg: string }> = {
  protected: { label: 'Nothing shared', fg: colors.protective, bg: colors.protectiveSoft },
  recovered: { label: 'Partly shared, then stopped', fg: colors.warning, bg: colors.warningSoft },
  exposed: { label: 'Simulated info shared', fg: colors.risky, bg: colors.riskySoft },
  not_engaged: { label: 'Call not answered', fg: colors.neutral, bg: colors.neutralSoft },
};

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function DebriefScreen() {
  // Snapshot on mount: "Try again" starts a new session, and this screen should
  // keep showing the finished one (not redirect) while navigation happens.
  const [{ scenario, session, previousSessionId }] = useState(() => {
    const { scenario, session, previousSessionId } = useSimulatorStore.getState();
    return { scenario, session, previousSessionId };
  });
  const start = useSimulatorStore((s) => s.start);
  const transcript = useSimulatorStore((s) => (session ? s.transcripts[session.sessionId] : undefined));
  const saveTranscript = useSimulatorStore((s) => s.saveTranscript);
  const deleteSavedTranscript = useSimulatorStore((s) => s.deleteSavedTranscript);
  const [debrief, setDebrief] = useState<Debrief>();
  const [error, setError] = useState<string>();

  const fetchDebrief = useCallback(() => {
    if (!session) return Promise.resolve();
    return simulatorApi.debrief(session.sessionId, previousSessionId).then(
      (d) => setDebrief(d),
      (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t load your debrief.'),
    );
  }, [session, previousSessionId]);

  useEffect(() => {
    fetchDebrief();
  }, [fetchDebrief]);

  const load = () => {
    setError(undefined);
    fetchDebrief();
  };

  if (!scenario || !session) return <Redirect href="/simulator" />;

  const retry = async () => {
    if (await start(scenario.id)) router.replace('/simulator/incoming');
  };

  if (!debrief) {
    return (
      <View style={[styles.screen, styles.center]}>
        {error ? (
          <View style={styles.actions}>
            <Text style={styles.body}>{error}</Text>
            <Button label="Try again" onPress={load} />
            <Button label="Back to scenarios" variant="secondary" onPress={() => router.dismissTo('/simulator')} />
          </View>
        ) : (
          <ActivityIndicator color={colors.accent} accessibilityLabel="Loading your debrief" />
        )}
      </View>
    );
  }

  const o = OUTCOME_STYLE[debrief.outcome];
  const k = debrief.keyBehaviors;
  const diffs = debrief.comparison;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { backgroundColor: o.bg }]}>
        <Text style={[styles.pill, { color: o.fg, borderColor: o.fg }]}>{o.label}</Text>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {debrief.ending.title}
        </Text>
        <Text style={styles.body}>{debrief.ending.summary}</Text>
        {k.answered ? (
          <Text style={styles.meta}>Call length: {formatDuration(debrief.durationMs)} · Practice only, no real data used</Text>
        ) : null}
      </View>

      <TranscriptCard
        state={transcript}
        onRetry={() => saveTranscript(session.sessionId)}
        onDelete={() => deleteSavedTranscript(session.sessionId)}
      />

      {diffs.length ? (
        <Section title="Compared with your last try">
          {diffs.map((d) => (
            <Text key={d.text} style={styles.bullet}>
              {d.direction === 'better' ? '↑' : d.direction === 'worse' ? '↓' : '•'} {d.text}
            </Text>
          ))}
        </Section>
      ) : null}

      <Section title="What you did">
        <Text style={styles.caption}>Your choices during the call, in order.</Text>
        <DebriefTimeline items={debrief.timeline} />
        {k.answered ? (
          <Text style={styles.caption}>
            {debrief.tally.protective} protective and {debrief.tally.risky} risky response
            {debrief.tally.risky === 1 ? '' : 's'}. Protective means questioning the caller, refusing, verifying or hanging up. Risky means sharing simulated information. This summarizes one practice call. It doesn’t measure how safe you are in real life.
          </Text>
        ) : null}
      </Section>

      {debrief.takeaways.length ? (
        <Section title="What this suggests">
          {debrief.takeaways.map((t) => (
            <Text key={t} style={styles.bullet}>
              • {t}
            </Text>
          ))}
        </Section>
      ) : null}

      {debrief.redFlags.length ? (
        <Section title={`Red flags in this call (${debrief.redFlags.length})`}>
          {debrief.redFlags.map((f) => (
            <View key={f.id} style={styles.flag}>
              <Text style={styles.flagTitle}>🚩 {f.title}</Text>
              <Text style={styles.flagBody}>{f.explanation}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {debrief.recoverySteps.length ? (
        <Section title="If this happens in a real call">
          <Text style={styles.caption}>You shared simulated details in this practice call. If you ever share real ones:</Text>
          {debrief.recoverySteps.map((s, i) => (
            <Text key={s} style={styles.bullet}>
              {i + 1}. {s}
            </Text>
          ))}
        </Section>
      ) : null}

      <Section title="Safer habits for calls like this">
        {debrief.saferAlternatives.map((s) => (
          <Text key={s} style={styles.bullet}>
            ✓ {s}
          </Text>
        ))}
      </Section>

      {debrief.provenance ? (
        <Section title="About this call">
          <Text style={styles.caption}>{debrief.provenance}</Text>
          {debrief.usedModel ? (
            <Text style={styles.caption}>
              The live caller’s wording was written by Claude for this call, within the scenario’s fixed steps. Your choices were scored by the scenario’s rules, not by the AI.
            </Text>
          ) : null}
          {debrief.recording ? (
            <Text style={styles.caption}>
              Recording: {debrief.recording.datasetFile.split('/').pop()} from the Robocall Audio Dataset (Prasad and Reaves, NC State, 2023), public domain.
            </Text>
          ) : null}
        </Section>
      ) : null}

      <View style={styles.actions}>
        <Button label="Try this call again" onPress={retry} accessibilityHint="Starts the same simulated call from the beginning" />
        <Button label="Back to scenarios" variant="secondary" onPress={() => router.dismissTo('/simulator')} />
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  hero: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  pill: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '700',
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  heroTitle: { fontSize: 24, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
  caption: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  bullet: { fontSize: 15, lineHeight: 22, color: colors.text },
  flag: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flagTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  flagBody: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  actions: { gap: spacing.md },
});
