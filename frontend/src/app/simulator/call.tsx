import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CallControls } from '@/components/simulator/CallControls';
import { CallerDisplay } from '@/components/simulator/CallerDisplay';
import { ConversationPanel } from '@/components/simulator/ConversationPanel';
import { SimulationBadge } from '@/components/simulator/SimulationBadge';
import { useCallPlayback } from '@/features/simulator/hooks/useCallPlayback';
import { recordingClips } from '@/features/simulator/recordings/catalog';
import { useSimulatorStore } from '@/features/simulator/store';
import { colors, MIN_TOUCH, radius, spacing } from '@/theme';

function useCallTimer(startMs: number | null | undefined, stopped: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (stopped) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stopped]);
  const s = startMs ? Math.max(0, Math.floor((now - startMs) / 1000)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CallScreen() {
  const scenario = useSimulatorStore((s) => s.scenario);
  const session = useSimulatorStore((s) => s.session);
  const pending = useSimulatorStore((s) => s.pending);
  const error = useSimulatorStore((s) => s.error);
  const voiceEnabled = useSimulatorStore((s) => s.voiceEnabled);
  const activeHint = useSimulatorStore((s) => s.activeHint);
  const { choose, say, hangUp, requestHint, dismissHint, setVoiceEnabled, clearError } =
    useSimulatorStore.getState();
  const [validOnMount] = useState(() => session?.status === 'active');
  const [draft, setDraft] = useState('');
  const leaving = useRef(false);

  const ended = session?.status === 'ended';
  const { visibleEntries, isPlaying, speakingId, stop } = useCallPlayback(
    session?.transcript ?? [],
    voiceEnabled,
    { recordings: recordingClips, callerVoice: scenario?.caller.voice ?? undefined },
  );
  const timer = useCallTimer(session?.answeredAtMs, ended);

  const leaveToDebrief = () => {
    if (leaving.current) return;
    leaving.current = true;
    stop();
    router.replace('/simulator/debrief');
  };

  // Hang up is always available and fast: the backend doesn't make it wait for the model.
  const onHangUp = async () => {
    stop();
    await hangUp();
    leaveToDebrief();
  };

  // Android back button acts as hang-up, so the user is never stuck in a call.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onHangUp();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!scenario || !session || !validOnMount) return <Redirect href="/simulator" />;

  const node = session.node;
  const canRespond = !isPlaying && !pending && !!node && !ended;
  const speakingEntry = visibleEntries.find((e) => e.id === speakingId);
  const talking = speakingEntry?.clipId ? 'Recorded message playing' : `${scenario.caller.agentName} is talking`;
  const status = ended ? 'Call ended' : isPlaying ? `${timer} · ${talking}` : timer;
  const keypadOptions = node?.options.filter((o) => o.keypad) ?? [];
  const spokenOptions = node?.options.filter((o) => !o.keypad) ?? [];
  const freeText = session.freeTextAvailable && !!node?.acceptsSpeech;

  const send = async () => {
    const text = draft.trim();
    if (!text || !canRespond) return;
    if (await say(text)) setDraft('');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SimulationBadge />
        <View style={styles.header}>
          <CallerDisplay name={scenario.caller.displayName} number={scenario.caller.displayNumber} status={status} />
        </View>

        <ConversationPanel
          entries={visibleEntries}
          callerName={scenario.caller.agentName}
          speakingId={speakingId}
          typing={pending && !isPlaying && !ended}
        />

        {activeHint ? (
          <Pressable
            style={styles.hint}
            onPress={dismissHint}
            accessibilityRole="button"
            accessibilityLabel={`Training hint: ${activeHint}`}
            accessibilityHint="Double tap to dismiss"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.hintTitle}>💡 Training hint</Text>
            <Text style={styles.hintBody}>{activeHint}</Text>
            <Text style={styles.hintDismiss}>Tap to dismiss</Text>
          </Pressable>
        ) : null}

        {(error || session.notice) && !ended ? (
          <Pressable onPress={clearError} style={styles.notice} accessibilityLiveRegion="polite">
            <Text style={styles.noticeText}>{error ?? session.notice}</Text>
          </Pressable>
        ) : null}

        <View style={styles.responses}>
          {canRespond && node ? (
            <>
              {keypadOptions.length ? (
                <View style={styles.keypadRow}>
                  {keypadOptions.map((o) => (
                    <Pressable
                      key={o.id}
                      onPress={() => choose(o.id)}
                      accessibilityRole="button"
                      accessibilityLabel={o.label}
                      style={({ pressed }) => [styles.keypadKey, pressed && styles.optionPressed]}
                    >
                      <Text style={styles.keypadDigit}>{o.keypad}</Text>
                      <Text style={styles.keypadLabel}>Press {o.keypad}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {freeText ? (
                <View style={styles.inputRow}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={send}
                    placeholder="Say something to the caller…"
                    placeholderTextColor={colors.callTextMuted}
                    style={styles.input}
                    maxLength={280}
                    returnKeyType="send"
                    autoCorrect
                    accessibilityLabel="Your reply to the caller"
                    accessibilityHint="Type what you would say. Don’t type real personal information."
                  />
                  <Pressable
                    onPress={send}
                    disabled={!draft.trim()}
                    accessibilityRole="button"
                    accessibilityLabel="Send reply"
                    style={({ pressed }) => [styles.sendButton, (!draft.trim() || pressed) && { opacity: 0.6 }]}
                  >
                    <Text style={styles.sendText}>Send</Text>
                  </Pressable>
                </View>
              ) : null}

              <Text style={styles.prompt} accessibilityRole="header">
                {freeText ? 'Or pick a reply' : 'How do you respond?'}
              </Text>
              {spokenOptions.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => choose(o.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Say: ${o.label}`}
                  style={({ pressed }) => [freeText ? styles.chip : styles.option, pressed && styles.optionPressed]}
                >
                  <Text style={freeText ? styles.chipText : styles.optionText}>{o.label}</Text>
                </Pressable>
              ))}
            </>
          ) : null}

          {ended && !isPlaying ? (
            <View style={styles.endedBox}>
              <Text style={styles.endedText} accessibilityLiveRegion="polite">
                The simulated call has ended.
              </Text>
              <Pressable
                onPress={leaveToDebrief}
                accessibilityRole="button"
                style={({ pressed }) => [styles.debriefButton, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.debriefButtonText}>See your debrief</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <CallControls
          voiceEnabled={voiceEnabled}
          onToggleVoice={() => setVoiceEnabled(!voiceEnabled)}
          hintAvailable={canRespond && !!node?.hasHint && !activeHint}
          onHint={requestHint}
          onHangUp={onHangUp}
          callEnded={ended}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.callBg, paddingTop: spacing.sm },
  flex: { flex: 1 },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#4A4D5C',
    backgroundColor: colors.callSurface,
    color: colors.callText,
    fontSize: 16,
  },
  sendButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    justifyContent: 'center',
  },
  sendText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#3A3D4A',
  },
  chipText: { color: colors.callTextMuted, fontSize: 14, lineHeight: 19 },
  notice: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#2A2D38',
  },
  noticeText: { color: colors.callText, fontSize: 14, lineHeight: 20 },
  header: { paddingVertical: spacing.md },
  responses: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  prompt: { color: colors.callTextMuted, fontSize: 14, fontWeight: '600', marginBottom: spacing.xs },
  option: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#4A4D5C',
    backgroundColor: colors.callSurface,
  },
  optionPressed: { borderColor: colors.accent, backgroundColor: '#2A1020' },
  optionText: { color: colors.callText, fontSize: 16, lineHeight: 22 },
  keypadRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  keypadKey: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#4A4D5C',
    backgroundColor: colors.callSurface,
  },
  keypadDigit: { color: colors.callText, fontSize: 28, fontWeight: '500' },
  keypadLabel: { color: colors.callTextMuted, fontSize: 11 },
  hint: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    gap: 2,
  },
  hintTitle: { color: colors.warning, fontWeight: '700', fontSize: 14 },
  hintBody: { color: colors.text, fontSize: 15, lineHeight: 21 },
  hintDismiss: { color: colors.warning, fontSize: 12, marginTop: 2 },
  endedBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  endedText: { color: colors.callTextMuted, fontSize: 15 },
  debriefButton: {
    minHeight: MIN_TOUCH + 4,
    alignSelf: 'stretch',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debriefButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
