/**
 * PreviewStateLoading — Loading/preparing screen with terminal log, progress bar,
 * and optional verifying overlay.
 * Pure component: no hooks that fetch data, no direct store access.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../../shared/theme/colors';

// ── Props ──────────────────────────────────────────────────

export interface PreviewStateLoadingProps {
  /** Lines to display in the terminal log */
  terminalLines: string[];
  /** Primary status message shown below the terminal */
  displayedMessage: string;
  /** Secondary message (e.g. "Starting...") */
  startingMessage: string;
  /** 0-100 progress */
  smoothProgress: number;
  /** Seconds since preview start */
  elapsedSeconds: number;
  /** Animated pulse for cursor blink */
  pulseAnim: Animated.Value;
  /** When true, show the "verifying" overlay instead of terminal */
  isVerifying?: boolean;
  /** Optional verifying status message */
  verifyingMessage?: string;
  t: (key: string) => string;
}

// ── Component ──────────────────────────────────────────────

export const PreviewStateLoading: React.FC<PreviewStateLoadingProps> = ({
  terminalLines,
  displayedMessage,
  startingMessage,
  smoothProgress,
  elapsedSeconds,
  pulseAnim,
  isVerifying,
  verifyingMessage,
  t,
}) => {
  if (isVerifying) {
    return (
      <View style={s.root}>
        <LinearGradient
          colors={AppColors.gradient.dark as unknown as [string, string, string, string]}
          locations={[0, 0.3, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={s.verifyCenter}>
          <View style={s.verifyIconContainer}>
            <Ionicons name="shield-checkmark-outline" size={36} color="#8B5CF6" />
          </View>
          <ActivityIndicator size="small" color="#8B5CF6" style={{ marginBottom: 16 }} />
          <Text style={s.verifyTitle}>Controllo qualita in corso...</Text>
          {verifyingMessage ? (
            <Text style={s.verifySubtitle}>{verifyingMessage}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LinearGradient
        colors={AppColors.gradient.dark as unknown as [string, string, string, string]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.fullScreenContent}>
        <View style={s.terminal}>
          <View style={s.termHeader}>
            <View style={s.termLights}>
              <View style={[s.termLight, s.termLightRed]} />
              <View style={[s.termLight, s.termLightYellow]} />
              <View style={[s.termLight, s.termLightGreen]} />
            </View>
            <Text style={s.termTitle}>{t('terminal:preview.dock.terminalWindowTitle')}</Text>
          </View>

          <ScrollView
            style={s.termBody}
            contentContainerStyle={s.termContent}
            showsVerticalScrollIndicator={false}
            ref={(ref) => {
              if (ref && terminalLines.length > 0) {
                setTimeout(() => ref.scrollToEnd({ animated: true }), 100);
              }
            }}
          >
            {terminalLines.length > 0 ? (
              terminalLines.map((line, index) => (
                <Text
                  key={`out-${index}`}
                  style={[
                    s.termLogText,
                    {
                      color:
                        line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')
                          ? '#f87171'
                          : '#e0e0e0',
                    },
                  ]}
                >
                  {line}
                </Text>
              ))
            ) : (
              <Text style={s.termLogText}>
                {displayedMessage || t('terminal:preview.initializingEnv')}
              </Text>
            )}
            <Animated.View
              style={[
                s.termCursor,
                {
                  opacity: pulseAnim.interpolate({
                    inputRange: [0.6, 1],
                    outputRange: [0, 1],
                  }),
                },
              ]}
            />
          </ScrollView>

          <View style={s.termFooter}>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${smoothProgress}%` }]} />
            </View>
            <Text style={s.progressText} numberOfLines={1}>
              {startingMessage || t('terminal:preview.loading')}
            </Text>
            {elapsedSeconds > 0 && (
              <Text style={s.remainingText}>
                {elapsedSeconds < 60
                  ? `${elapsedSeconds}s`
                  : `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullScreenContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  // Terminal window
  terminal: {
    width: '100%',
    maxWidth: 700,
    height: '80%',
    alignSelf: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },
  termHeader: {
    height: 28,
    backgroundColor: '#2B2B2B',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  termLights: { flexDirection: 'row', gap: 6 },
  termLight: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  termLightRed: { backgroundColor: '#7A6AD9' },
  termLightYellow: { backgroundColor: '#9B8AFF' },
  termLightGreen: { backgroundColor: '#BEB4FF' },
  termTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 0.3,
    marginRight: 32,
  },
  termBody: { flex: 1, backgroundColor: '#1A1A1A' },
  termContent: { padding: 12, paddingTop: 8, gap: 2 },
  termLogText: {
    fontSize: 10,
    color: '#9B8AFF',
    lineHeight: 16,
    fontFamily: 'Courier New',
    letterSpacing: 0.2,
  },
  termCursor: {
    width: 6,
    height: 14,
    backgroundColor: '#9B8AFF',
    marginTop: 2,
    marginLeft: 2,
  },
  termFooter: {
    height: 26,
    backgroundColor: '#2B2B2B',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 10,
  },
  progressBar: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#9B8AFF', borderRadius: 1.5 },
  progressText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    flex: 1,
  },
  remainingText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'right',
  },
  // Verifying overlay
  verifyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  verifyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  verifyTitle: { color: '#ddd', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  verifySubtitle: { color: '#666', fontSize: 12, textAlign: 'center' },
});
