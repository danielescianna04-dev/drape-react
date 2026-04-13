/**
 * PreviewStateFixing — Auto-fix in progress screen.
 * Shows terminal log + fix attempt status, reusing the loading terminal UI.
 * Pure component: no hooks that fetch data, no direct store access.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../../shared/theme/colors';

// ── Props ──────────────────────────────────────────────────

export interface PreviewStateFixingProps {
  /** Lines to display in the terminal log */
  terminalLines: string[];
  /** Auto-fix status message (e.g. "Fixing imports...") */
  statusMessage: string;
  /** Current fix attempt number */
  fixAttempt: number;
  /** 0-100 progress */
  smoothProgress: number;
  /** Seconds since preview start */
  elapsedSeconds: number;
  /** Animated pulse for cursor blink */
  pulseAnim: Animated.Value;
  t: (key: string) => string;
}

// ── Component ──────────────────────────────────────────────

export const PreviewStateFixing: React.FC<PreviewStateFixingProps> = ({
  terminalLines,
  statusMessage,
  fixAttempt,
  smoothProgress,
  elapsedSeconds,
  pulseAnim,
  t,
}) => {
  return (
    <View style={s.root}>
      <LinearGradient
        colors={AppColors.gradient.dark as unknown as [string, string, string, string]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.fullScreenContent}>
        {/* Fix badge */}
        <View style={s.fixBadge}>
          <Ionicons name="hammer-outline" size={14} color="#F59E0B" />
          <Text style={s.fixBadgeText}>
            {t('terminal:preview.fixing') || 'Auto-fix'} #{fixAttempt}
          </Text>
        </View>

        <View style={s.terminal}>
          <View style={s.termHeader}>
            <View style={s.termLights}>
              <View style={[s.termLight, { backgroundColor: '#F59E0B' }]} />
              <View style={[s.termLight, { backgroundColor: '#FBBF24' }]} />
              <View style={[s.termLight, { backgroundColor: '#FDE68A' }]} />
            </View>
            <Text style={s.termTitle}>{statusMessage || 'Risolvo il problema...'}</Text>
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
                  key={`fix-${index}`}
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
              <Text style={s.termLogText}>{statusMessage}</Text>
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
              {`Tentativo ${fixAttempt}...`}
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
  fixBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    marginBottom: 16,
  },
  fixBadgeText: { color: '#FDE68A', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  terminal: {
    width: '100%',
    maxWidth: 700,
    height: '75%',
    alignSelf: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
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
  },
  termTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: 0.3,
    marginRight: 32,
  },
  termBody: { flex: 1, backgroundColor: '#1A1A1A' },
  termContent: { padding: 12, paddingTop: 8, gap: 2 },
  termLogText: {
    fontSize: 10,
    color: '#FBBF24',
    lineHeight: 16,
    fontFamily: 'Courier New',
    letterSpacing: 0.2,
  },
  termCursor: {
    width: 6,
    height: 14,
    backgroundColor: '#F59E0B',
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
  progressFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 1.5 },
  progressText: { fontSize: 10, color: 'rgba(255, 255, 255, 0.5)', flex: 1 },
  remainingText: { fontSize: 10, color: 'rgba(255, 255, 255, 0.4)', textAlign: 'right' },
});
