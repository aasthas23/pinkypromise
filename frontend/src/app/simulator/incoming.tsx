import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CallerDisplay } from '@/components/simulator/CallerDisplay';
import { SimulationBadge } from '@/components/simulator/SimulationBadge';
import { useSimulatorStore } from '@/features/simulator/store';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, spacing } from '@/theme';

export default function IncomingCall() {
  const scenario = useSimulatorStore((s) => s.scenario);
  const session = useSimulatorStore((s) => s.session);
  const answer = useSimulatorStore((s) => s.answer);
  const decline = useSimulatorStore((s) => s.decline);
  const pending = useSimulatorStore((s) => s.pending);
  const error = useSimulatorStore((s) => s.error);
  const reducedMotion = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0));
  // Checked once on mount, so answering or declining doesn't trigger the redirect mid-navigation.
  const [validOnMount] = useState(() => session?.status === 'ringing');

  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  if (!scenario || !session || !validOnMount) {
    return <Redirect href="/simulator" />;
  }

  // The first caller line may be written by the model, so answering can take a moment.
  const onAnswer = async () => {
    if (await answer()) router.replace('/simulator/call');
  };
  const onDecline = async () => {
    if (await decline()) router.replace('/simulator/debrief');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <SimulationBadge detail="Practice call. Not a real incoming call." />

      <View style={styles.center}>
        <Text style={styles.ringing} accessibilityLiveRegion="polite">
          {pending ? 'Connecting…' : 'Simulated incoming call…'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.pulseWrap}>
          {!reducedMotion && (
            <Animated.View
              style={[
                styles.pulse,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                },
              ]}
            />
          )}
          <CallerDisplay
            name={scenario.caller.displayName}
            number={scenario.caller.displayNumber}
            status="Caller ID shown by the simulation"
            large
          />
        </View>
      </View>

      <View style={styles.actions}>
        <CallAction label="Decline" color={colors.decline} icon="✕" onPress={onDecline} hint="Declines the simulated call" />
        <CallAction label="Answer" color={colors.answer} icon="✆" onPress={onAnswer} hint="Answers the simulated call" />
      </View>
    </SafeAreaView>
  );
}

function CallAction(props: { label: string; color: string; icon: string; onPress: () => void; hint: string }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.actionCircle, { backgroundColor: props.color }]}>
        <Text style={styles.actionIcon}>{props.icon}</Text>
      </View>
      <Text style={styles.actionLabel}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.callBg, paddingTop: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  ringing: { color: colors.callTextMuted, fontSize: 17 },
  error: { color: '#FF8A80', fontSize: 15, textAlign: 'center', paddingHorizontal: spacing.xl },
  pulseWrap: { alignItems: 'center', justifyContent: 'flex-start' },
  pulse: {
    position: 'absolute',
    top: 0,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.accent,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  action: { alignItems: 'center', gap: spacing.sm },
  actionCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { color: '#FFFFFF', fontSize: 32, fontWeight: '700' },
  actionLabel: { color: colors.callText, fontSize: 16, fontWeight: '600' },
});
