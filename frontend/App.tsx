import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const fakePin = '4821';

export default function App() {
  const [mode, setMode] = useState<'customer' | 'employee'>('customer');

  const headerText = useMemo(
    () => (mode === 'customer' ? 'Customer View' : 'Employee Dashboard'),
    [mode],
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.topBar}>
        <Text style={styles.brand}>Pink Promise</Text>

        <View style={styles.toggleWrap}>
          <Pressable
            style={[styles.toggleButton, mode === 'customer' && styles.toggleActive]}
            onPress={() => setMode('customer')}
          >
            <Text style={[styles.toggleText, mode === 'customer' && styles.toggleTextActive]}>Customer</Text>
          </Pressable>

          <Pressable
            style={[styles.toggleButton, mode === 'employee' && styles.toggleActive]}
            onPress={() => setMode('employee')}
          >
            <Text style={[styles.toggleText, mode === 'employee' && styles.toggleTextActive]}>Employee</Text>
          </Pressable>
        </View>
      </View>

      {mode === 'customer' ? (
        <View style={styles.card}>
          <Text style={styles.title}>Reverse OTP</Text>
          <Text style={styles.subtitle}>Verify the agent without SMS</Text>

          <View style={styles.pinBox}>
            <Text style={styles.pin}>{fakePin}</Text>
          </View>

          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Verify Agent</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Start Scam Simulation</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>Employee Dashboard</Text>
          <Text style={styles.subtitle}>Live reverse OTP and call-risk view</Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Risk</Text>
              <Text style={styles.metricValue}>72%</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Calls</Text>
              <Text style={styles.metricValue}>12</Text>
            </View>
          </View>

          <View style={styles.sessionCard}>
            <Text style={styles.sessionLabel}>Customer Verification Code</Text>
            <Text style={styles.sessionCode}>{fakePin}</Text>
            <Text style={styles.sessionMeta}>Expires in 60s</Text>
          </View>

          <Text style={styles.analysisTitle}>AI Risk Signals</Text>
          <Text style={styles.analysisText}>Urgency, authority, and isolation cues are elevated.</Text>
        </View>
      )}

      <Text style={styles.footer}>{headerText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
    paddingHorizontal: 18,
    paddingTop: 64,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  brand: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#182335',
    borderRadius: 999,
    padding: 4,
  },
  toggleButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleActive: {
    backgroundColor: '#4f46e5',
  },
  toggleText: {
    color: '#d7def5',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 6,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9aa7c2',
    marginTop: 6,
    marginBottom: 20,
  },
  pinBox: {
    marginVertical: 16,
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  pin: {
    color: '#f8fafc',
    fontSize: 38,
    letterSpacing: 8,
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#06230f',
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 14,
    padding: 14,
  },
  metricLabel: {
    color: '#9aa7c2',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  metricValue: {
    marginTop: 8,
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
  },
  sessionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
  },
  sessionLabel: {
    color: '#9aa7c2',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  sessionCode: {
    marginTop: 8,
    color: '#fef3c7',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 4,
  },
  sessionMeta: {
    marginTop: 6,
    color: '#86efac',
    fontWeight: '600',
  },
  analysisTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 18,
  },
  analysisText: {
    color: '#d7def5',
    marginTop: 8,
    lineHeight: 20,
  },
  footer: {
    marginTop: 18,
    color: '#9aa7c2',
    textAlign: 'center',
    fontWeight: '600',
  },
});
