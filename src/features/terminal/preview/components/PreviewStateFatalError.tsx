/**
 * PreviewStateFatalError — Fatal error screen with retry / env / ask-AI CTAs.
 * Handles both normal errors and limit errors (upgrade CTA).
 * Pure component: no hooks that fetch data, no direct store access.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../../shared/theme/colors';

// ── Props ──────────────────────────────────────────────────

export interface PreviewStateFatalErrorProps {
  errorMessage: string;
  /** Terminal output lines (used to show relevant error log) */
  terminalOutput?: string[];
  onRetry: () => void;
  onFixWithAI: () => void;
  /** Called when a limit error upgrade CTA is pressed */
  onUpgrade?: () => void;
  t: (key: string) => string;
}

// ── Helpers ────────────────────────────────────────────────

function extractErrorLines(terminalOutput?: string[]): string[] {
  if (!terminalOutput || terminalOutput.length === 0) return [];
  const relevant = terminalOutput.filter((line) => {
    const lower = line.toLowerCase();
    return (
      lower.includes('error') ||
      lower.includes('failed') ||
      lower.includes('cannot') ||
      lower.includes('warning') ||
      lower.includes('\u00d7')
    );
  });
  return relevant.length > 0 ? relevant.slice(-15) : terminalOutput.slice(-10);
}

// ── Component ──────────────────────────────────────────────

export const PreviewStateFatalError: React.FC<PreviewStateFatalErrorProps> = ({
  errorMessage,
  terminalOutput,
  onRetry,
  onFixWithAI,
  onUpgrade,
  t,
}) => {
  // Detect limit errors (prefixed by PreviewPanel)
  const limitMatch = errorMessage.match(/^__LIMIT__(\w+)__::(.+)$/);
  const isLimitError = !!limitMatch;
  const displayMessage = limitMatch ? limitMatch[2] : errorMessage;
  const errorLines = React.useMemo(() => extractErrorLines(terminalOutput), [terminalOutput]);

  return (
    <View style={s.root}>
      <LinearGradient
        colors={AppColors.gradient.dark as unknown as [string, string, string, string]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={s.center}>
        {isLimitError ? (
          /* ── Limit / Upgrade error ── */
          <View style={s.errorContainer}>
            <View style={[s.iconContainer, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
              <Ionicons name="lock-closed" size={48} color="#A78BFA" />
            </View>
            <Text style={s.errorTitle}>{t('projects:limit.reached')}</Text>
            <Text style={[s.errorMessage, { marginBottom: 20 }]} numberOfLines={3}>
              {displayMessage}
            </Text>

            <View style={s.upgradeCard}>
              <Text style={s.upgradeCardTitle}>{t('terminal:preview.upgradeWith')}</Text>
              <View style={{ gap: 6 }}>
                <Text style={s.upgradeItem}>
                  <Ionicons name="checkmark-circle" size={14} color="#A78BFA" /> {t('terminal:preview.upgradePreviews')}
                </Text>
                <Text style={s.upgradeItem}>
                  <Ionicons name="checkmark-circle" size={14} color="#A78BFA" /> {t('terminal:preview.upgradeBudget')}
                </Text>
                <Text style={s.upgradeItem}>
                  <Ionicons name="checkmark-circle" size={14} color="#A78BFA" /> {t('terminal:preview.upgradeFeatures')}
                </Text>
              </View>
            </View>

            <View style={s.buttonsRow}>
              <TouchableOpacity
                style={[s.retryBtn, { backgroundColor: '#7C3AED', flex: 1 }]}
                onPress={onUpgrade}
                activeOpacity={0.7}
              >
                <Ionicons name="rocket" size={18} color="#fff" />
                <Text style={s.retryBtnText}>{t('terminal:preview.upgradeCta')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* ── Normal fatal error ── */
          <View style={s.errorContainer}>
            <View style={s.iconContainer}>
              <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
            </View>
            <Text style={s.errorTitle}>{t('terminal:preview.startupFailed')}</Text>
            <Text style={s.errorMessage} numberOfLines={3}>
              {displayMessage}
            </Text>

            {errorLines.length > 0 && (
              <View style={s.logContainer}>
                <View style={s.logHeader}>
                  <Ionicons name="terminal" size={12} color="rgba(255,255,255,0.4)" />
                  <Text style={s.logHeaderText}>{t('terminal:preview.dock.log')}</Text>
                </View>
                <ScrollView style={s.logScroll} nestedScrollEnabled>
                  {errorLines.map((line, i) => (
                    <Text
                      key={i}
                      style={[
                        s.logLine,
                        {
                          color:
                            line.toLowerCase().includes('error') || line.includes('\u00d7')
                              ? '#f87171'
                              : 'rgba(255,255,255,0.5)',
                        },
                      ]}
                      numberOfLines={3}
                    >
                      {line}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={s.buttonsRow}>
              <TouchableOpacity style={s.retryBtn} onPress={onRetry} activeOpacity={0.7}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={s.retryBtnText}>{t('common:retry')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.fixAiBtn} onPress={onFixWithAI} activeOpacity={0.7}>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={s.fixAiBtnText}>{t('terminal:preview.fixWithAi')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  center: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  errorContainer: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  errorTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginTop: 16, marginBottom: 8 },
  errorMessage: {
    fontSize: 14, color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  buttonsRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: AppColors.primary,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22, gap: 8,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  fixAiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22, gap: 8,
    borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  fixAiBtnText: { fontSize: 13, fontWeight: '500', color: 'rgba(255, 255, 255, 0.7)' },
  // Error log
  logContainer: {
    width: '100%', maxHeight: 180,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden', marginBottom: 8,
  },
  logHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  logHeaderText: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  logScroll: { padding: 10 },
  logLine: { fontSize: 10, fontFamily: 'Courier New', lineHeight: 15, color: 'rgba(255, 255, 255, 0.5)' },
  // Upgrade card
  upgradeCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 16,
    padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.2)', width: '100%',
  },
  upgradeCardTitle: { color: '#C4B5FD', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  upgradeItem: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
});
