/**
 * PreviewStates — Pure UI components for each preview state.
 * No logic, no hooks — just rendering.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated as RNAnimated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// ── Start Screen ──────────────────────────────────────────────

interface StartProps {
  projectName?: string;
  technology?: string;
  onStart: () => void;
}

export const PreviewStartView = ({ projectName, technology, onStart }: StartProps) => (
  <View style={styles.container}>
    <View style={styles.center}>
      <View style={styles.iconCircle}>
        <Ionicons name="play" size={32} color="#fff" />
      </View>
      <Text style={styles.title}>{projectName || 'Preview'}</Text>
      {technology && <Text style={styles.subtitle}>{technology}</Text>}
      <TouchableOpacity style={styles.startButton} onPress={onStart} activeOpacity={0.8}>
        <LinearGradient colors={['#7C3AED', '#6D28D9']} style={styles.startButtonGradient}>
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={styles.startButtonText}>Avvia Anteprima</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  </View>
);

// ── Loading / Fixing Screen ───────────────────────────────────

interface LoadingProps {
  message: string;
  subMessage?: string;
  progress?: number;
  isFixing?: boolean;
  fixAttempt?: number;
}

export const PreviewLoadingView = ({ message, subMessage, progress, isFixing, fixAttempt }: LoadingProps) => (
  <View style={styles.container}>
    <View style={styles.center}>
      {/* Spinner */}
      <View style={styles.spinnerContainer}>
        <View style={[styles.spinnerRing, isFixing && styles.spinnerFixing]} />
        <Ionicons
          name={isFixing ? 'hammer-outline' : 'rocket-outline'}
          size={24}
          color={isFixing ? '#F59E0B' : '#7C3AED'}
          style={styles.spinnerIcon}
        />
      </View>

      <Text style={styles.loadingMessage}>{message}</Text>
      {subMessage && <Text style={styles.loadingSubMessage}>{subMessage}</Text>}
      {isFixing && fixAttempt && fixAttempt > 1 && (
        <Text style={styles.attemptBadge}>Tentativo {fixAttempt}</Text>
      )}

      {/* Progress bar */}
      {progress !== undefined && progress > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` as any }]} />
        </View>
      )}
    </View>
  </View>
);

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(124,58,237,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 24,
  },
  startButton: {
    borderRadius: 28,
    overflow: 'hidden',
    marginTop: 8,
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  // Loading
  spinnerContainer: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  spinnerRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(124,58,237,0.2)',
    borderTopColor: '#7C3AED',
  },
  spinnerFixing: {
    borderTopColor: '#F59E0B',
    borderColor: 'rgba(245,158,11,0.2)',
  },
  spinnerIcon: {
  },
  loadingMessage: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  },
  loadingSubMessage: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  attemptBadge: {
    marginTop: 12,
    fontSize: 12,
    color: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  progressTrack: {
    width: 200,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 20,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#7C3AED',
  },
});
