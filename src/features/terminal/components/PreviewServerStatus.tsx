import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, ActivityIndicator, Platform } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView } from '@callstack/liquid-glass';
import { AppColors } from '../../../shared/theme/colors';
import { useTranslation } from 'react-i18next';
import { PreviewLog } from '../../../hooks/api/usePreviewLogs';

export interface PreviewServerStatusProps {
  // Current status
  serverStatus: 'checking' | 'running' | 'stopped';
  previewError: { message: string; timestamp: Date } | null;
  sessionExpired: boolean;
  sessionExpiredMessage: string;

  // Start screen
  currentWorkstation: any;
  isStartTransitioning: boolean;
  startTransitionAnim: Animated.Value;
  onStartWithTransition: () => void;
  onStartServer: () => void;
  onClose: () => void;
  topInset: number;

  // Loading screen
  previewLogs: PreviewLog[];
  displayedMessage: string;
  startingMessage: string;
  smoothProgress: number;
  elapsedSeconds: number;
  pulseAnim: Animated.Value;

  // Error screen
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  isSendingReport: boolean;
  reportSent: boolean;

  // Translation helper
  t: ReturnType<typeof useTranslation>['t'];
}

// ============ START SCREEN ============
export const PreviewStartScreen: React.FC<{
  currentWorkstation: any;
  isStartTransitioning: boolean;
  startTransitionAnim: Animated.Value;
  onStartWithTransition: () => void;
  t: any;
}> = ({ currentWorkstation, isStartTransitioning, startTransitionAnim, onStartWithTransition, t }) => {
  return (
    <View style={styles.startScreen}>
      {/* Same purple desktop background as loading screen */}
      <LinearGradient
        colors={['#1a0a2e', '#120826', '#0d0619', '#120826', '#1a0a2e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.macDesktopOrb1} />
      <View style={styles.macDesktopOrb2} />
      <View style={styles.macDesktopOrb3} />

      {/* Terminal-style window with project info */}
      <Animated.View style={[
        styles.devTerminalWindow,
        {
          opacity: startTransitionAnim.interpolate({
            inputRange: [0, 0.6, 1],
            outputRange: [1, 0.5, 0],
          }),
          transform: [{
            scale: startTransitionAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.85],
            }),
          }, {
            translateY: startTransitionAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 30],
            }),
          }],
        }
      ]}>
        {/* Window title bar */}
        <View style={styles.devWindowTitleBar}>
          <View style={styles.devWindowDots}>
            <View style={[styles.devWindowDot, { backgroundColor: '#FF5F57' }]} />
            <View style={[styles.devWindowDot, { backgroundColor: '#FEBC2E' }]} />
            <View style={[styles.devWindowDot, { backgroundColor: '#28C840' }]} />
          </View>
          <Text style={styles.devWindowTitle}>
            {currentWorkstation?.name || t('terminal:preview.project')} — preview
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Window content */}
        <View style={styles.devWindowContent}>
          {/* Project Identity */}
          <View style={styles.devProjectHeader}>
            <View style={styles.devProjectIcon}>
              <Ionicons
                name={
                  currentWorkstation?.technology === 'react' || currentWorkstation?.language === 'react' ? 'logo-react' :
                  currentWorkstation?.technology === 'vue' || currentWorkstation?.language === 'vue' ? 'logo-vue' :
                  currentWorkstation?.technology === 'nextjs' || currentWorkstation?.language === 'nextjs' ? 'server-outline' :
                  'logo-html5'
                }
                size={24}
                color={
                  currentWorkstation?.technology === 'react' || currentWorkstation?.language === 'react' ? '#61DAFB' :
                  currentWorkstation?.technology === 'vue' || currentWorkstation?.language === 'vue' ? '#4FC08D' :
                  currentWorkstation?.technology === 'nextjs' || currentWorkstation?.language === 'nextjs' ? '#fff' :
                  '#E34F26'
                }
              />
            </View>
            <Text style={styles.devProjectName} numberOfLines={1}>
              {currentWorkstation?.name || t('terminal:preview.project')}
            </Text>
            <View style={styles.devStatusRow}>
              <View style={styles.devTechBadge}>
                <Text style={styles.devTechBadgeText}>
                  {currentWorkstation?.technology || currentWorkstation?.language || 'web'}
                </Text>
              </View>
              <View style={styles.devDot} />
              <View style={styles.devStatusBadge}>
                <View style={[styles.devStatusDot, isStartTransitioning && { backgroundColor: '#FBBF24' }]} />
                <Text style={styles.devStatusText}>{isStartTransitioning ? t('terminal:preview.starting') : t('terminal:preview.readyShort')}</Text>
              </View>
            </View>
          </View>

          {/* Info Card */}
          <View style={styles.devInfoCard}>
            <View style={styles.devInfoRow}>
              <Text style={styles.devInfoLabel}>{t('terminal:preview.technology')}</Text>
              <Text style={styles.devInfoValue}>
                {currentWorkstation?.technology === 'react' ? 'React' :
                 currentWorkstation?.technology === 'vue' ? 'Vue.js' :
                 currentWorkstation?.technology === 'nextjs' ? 'Next.js' :
                 currentWorkstation?.technology === 'html' ? 'HTML/CSS/JS' :
                 currentWorkstation?.technology || 'Web'}
              </Text>
            </View>
            <View style={styles.devInfoDivider} />
            <View style={styles.devInfoRow}>
              <Text style={styles.devInfoLabel}>{t('terminal:preview.port')}</Text>
              <Text style={styles.devInfoValue}>
                {currentWorkstation?.technology === 'nextjs' ? '3000' : '5173'}
              </Text>
            </View>
            <View style={styles.devInfoDivider} />
            <View style={styles.devInfoRow}>
              <Text style={styles.devInfoLabel}>{t('terminal:preview.environment')}</Text>
              <View style={styles.devEnvBadge}>
                <Text style={styles.devEnvBadgeText}>development</Text>
              </View>
            </View>
          </View>

          {/* Start Button */}
          <TouchableOpacity
            style={styles.devStartBtn}
            onPress={onStartWithTransition}
            activeOpacity={0.85}
            disabled={isStartTransitioning}
          >
            <LinearGradient
              colors={isStartTransitioning ? ['#4C1D95', '#4C1D95'] : [AppColors.primary, '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.devStartBtnGradient}
            >
              {isStartTransitioning ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
                  <Text style={styles.devStartBtnText}>Avvia Anteprima</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* macOS Dock */}
      <MacDock />
    </View>
  );
};

// ============ SESSION EXPIRED SCREEN ============
export const PreviewSessionExpiredScreen: React.FC<{
  sessionExpiredMessage: string;
  onStartServer: () => void;
  t: any;
}> = ({ sessionExpiredMessage, onStartServer, t }) => {
  return (
    <Reanimated.View style={styles.startScreen} entering={FadeIn.duration(300)}>
      <LinearGradient
        colors={['#050505', '#0a0a0b', '#0f0f12']}
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.ambientBlob1} />
        <View style={styles.ambientBlob2} />
      </LinearGradient>

      <View style={styles.iphoneMockup}>
        <View style={styles.statusBarArea}>
          <Text style={styles.fakeTime}>9:41</Text>
          <View style={styles.dynamicIsland} />
          <View style={styles.fakeStatusIcons}>
            <Ionicons name="wifi" size={10} color="#fff" />
            <Ionicons name="battery-full" size={10} color="#fff" />
          </View>
        </View>

        <View style={styles.iphoneScreenCentered}>
          {/* Session Expired Icon */}
          <View style={[styles.cosmicOrbContainer, { opacity: 0.6 }]}>
            <View style={[styles.cosmicGlowRing1, { backgroundColor: 'rgba(255, 171, 0, 0.15)' }]} />
            <View style={[styles.cosmicGlowRing2, { backgroundColor: 'rgba(255, 171, 0, 0.08)' }]} />
            <LinearGradient
              colors={['#FFAB00', '#FF6D00']}
              style={styles.cosmicOrb}
            >
              <Ionicons name="time-outline" size={32} color="#FFFFFF" />
            </LinearGradient>
          </View>

          <View style={styles.cosmicTextContainer}>
            <Text style={[styles.cosmicTitle, { fontSize: 16 }]}>
              SESSIONE SCADUTA
            </Text>
            <View style={[styles.cosmicTitleUnderline, { backgroundColor: '#FFAB00' }]} />
            <Text style={styles.cosmicSubtitle}>
              {sessionExpiredMessage || 'Sessione terminata per inattività'}
            </Text>
          </View>

          {/* Restart Button */}
          <TouchableOpacity
            style={[styles.cosmicOrbContainer, { marginTop: 24 }]}
            onPress={onStartServer}
            activeOpacity={0.9}
          >
            <View style={styles.cosmicGlowRing1} />
            <View style={styles.cosmicGlowRing2} />

            <LiquidGlassView
              style={[styles.cosmicOrbGlass, { width: 56, height: 56, borderRadius: 28 }]}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              <LinearGradient
                colors={[`${AppColors.primary}CC`, '#6C5CE7CC']}
                style={[styles.cosmicOrbRaw, { borderRadius: 28 }]}
              >
                <Ionicons name="refresh" size={24} color="#FFFFFF" />
              </LinearGradient>
            </LiquidGlassView>
          </TouchableOpacity>

          <Text style={[styles.cosmicSubtitle, { marginTop: 8 }]}>
            {t('terminal:preview.tapToRestart')}
          </Text>
        </View>

        <View style={styles.iphoneSideButton} />
        <View style={styles.iphoneVolumeUp} />
        <View style={styles.iphoneVolumeDown} />
      </View>
    </Reanimated.View>
  );
};

// ============ ERROR SCREEN ============
export const PreviewErrorScreen: React.FC<{
  previewError: { message: string; timestamp: Date };
  onClose: () => void;
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  isSendingReport: boolean;
  reportSent: boolean;
  topInset: number;
  t: any;
}> = ({ previewError, onClose, onRetryPreview, onSendErrorReport, isSendingReport, reportSent, topInset, t }) => {
  return (
    <View style={styles.startScreen}>
      <LinearGradient
        colors={['#1a0a2e', '#120826', '#0d0619', '#120826', '#1a0a2e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.macDesktopOrb1} />
      <View style={styles.macDesktopOrb2} />
      <View style={styles.macDesktopOrb3} />

      <TouchableOpacity
        onPress={onClose}
        style={[styles.startCloseButton, { top: topInset + 8, right: 16 }]}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={22} color="rgba(255, 255, 255, 0.4)" />
      </TouchableOpacity>

      <View style={styles.fullScreenContent}>
        <ErrorContent
          previewError={previewError}
          onRetryPreview={onRetryPreview}
          onSendErrorReport={onSendErrorReport}
          isSendingReport={isSendingReport}
          reportSent={reportSent}
          t={t}
        />
      </View>
    </View>
  );
};

// ============ LOADING SCREEN (Server Boot Progress) ============
export const PreviewLoadingScreen: React.FC<{
  previewError: { message: string; timestamp: Date } | null;
  previewLogs: PreviewLog[];
  terminalOutput?: string[];
  displayedMessage: string;
  startingMessage: string;
  smoothProgress: number;
  elapsedSeconds: number;
  pulseAnim: Animated.Value;
  onClose: () => void;
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  isSendingReport: boolean;
  reportSent: boolean;
  topInset: number;
  t: any;
}> = ({
  previewError,
  previewLogs,
  terminalOutput,
  displayedMessage,
  startingMessage,
  smoothProgress,
  elapsedSeconds,
  pulseAnim,
  onClose,
  onRetryPreview,
  onSendErrorReport,
  isSendingReport,
  reportSent,
  topInset,
  t,
}) => {
  return (
    <View style={styles.startScreen}>
      {/* macOS Desktop-style background */}
      <LinearGradient
        colors={['#1a0a2e', '#120826', '#0d0619', '#120826', '#1a0a2e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle ambient orbs */}
      <View style={styles.macDesktopOrb1} />
      <View style={styles.macDesktopOrb2} />
      <View style={styles.macDesktopOrb3} />

      {/* Close button top right */}
      <TouchableOpacity
        onPress={onClose}
        style={[styles.startCloseButton, { top: topInset + 8, right: 16 }]}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={22} color="rgba(255, 255, 255, 0.4)" />
      </TouchableOpacity>

      {/* Content - Error or Terminal (full screen) */}
      <View style={styles.fullScreenContent}>
        {previewError ? (
          /* ERROR UI */
          <ErrorContent
            previewError={previewError}
            onRetryPreview={onRetryPreview}
            onSendErrorReport={onSendErrorReport}
            isSendingReport={isSendingReport}
            reportSent={reportSent}
            t={t}
          />
        ) : (
          /* LOADING UI - Mac Terminal Style */
          <View style={styles.terminalContainer}>
            {/* Mac Terminal Header */}
            <View style={styles.terminalHeader}>
              <View style={styles.terminalTrafficLights}>
                <View style={[styles.terminalLight, styles.terminalLightRed]} />
                <View style={[styles.terminalLight, styles.terminalLightYellow]} />
                <View style={[styles.terminalLight, styles.terminalLightGreen]} />
              </View>
              <Text style={styles.terminalTitle}>drape — bash</Text>
            </View>

            {/* Terminal Body with Logs */}
            <ScrollView
              style={styles.terminalBody}
              contentContainerStyle={styles.terminalContent}
              showsVerticalScrollIndicator={false}
              ref={(ref) => {
                if (ref && (previewLogs.length > 0 || (terminalOutput && terminalOutput.length > 0))) {
                  setTimeout(() => ref.scrollToEnd({ animated: true }), 100);
                }
              }}
            >
              {/* Real container terminal output */}
              {(terminalOutput && terminalOutput.length > 0) ? (
                (terminalOutput).map((line, index) => (
                  <Text key={`out-${index}`} style={[styles.terminalLogText, { color: line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') ? '#f87171' : '#e0e0e0' }]}>
                    {line}
                  </Text>
                ))
              ) : (
                <Text style={styles.terminalLogText}>
                  {displayedMessage || t('terminal:preview.initializingEnv')}
                </Text>
              )}
              {/* Blinking cursor */}
              <Animated.View style={[styles.terminalCursor, {
                opacity: pulseAnim.interpolate({
                  inputRange: [0.6, 1],
                  outputRange: [0, 1]
                })
              }]} />
            </ScrollView>

            {/* Progress bar at bottom */}
            <View style={styles.terminalFooter}>
              <View style={styles.terminalProgressBar}>
                <View style={[
                  styles.terminalProgressFill,
                  { width: `${smoothProgress}%` }
                ]} />
              </View>
              <Text style={styles.terminalProgressText} numberOfLines={1}>
                {startingMessage || t('terminal:preview.loading')}
              </Text>
              {elapsedSeconds > 0 && (
                <Text style={styles.terminalRemainingText}>
                  {elapsedSeconds < 60
                    ? `${elapsedSeconds}s`
                    : `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>

      {/* macOS Dock */}
      <MacDock />
    </View>
  );
};

// ============ SHARED: Error Content ============
const ErrorContent: React.FC<{
  previewError: { message: string; timestamp: Date };
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  isSendingReport: boolean;
  reportSent: boolean;
  t: any;
}> = ({ previewError, onRetryPreview, onSendErrorReport, isSendingReport, reportSent, t }) => {
  return (
    <View style={styles.errorContainer}>
      <View style={styles.errorIconContainer}>
        <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
      </View>
      <Text style={styles.errorTitle}>{t('terminal:preview.startupFailed')}</Text>
      <Text style={styles.errorMessage} numberOfLines={8}>
        {previewError.message}
      </Text>

      <View style={styles.errorButtonsContainer}>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetryPreview}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retryButtonText}>{t('common:retry')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sendLogsButton, reportSent && styles.sendLogsButtonSent]}
          onPress={onSendErrorReport}
          disabled={isSendingReport || reportSent}
          activeOpacity={0.7}
        >
          {isSendingReport ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : reportSent ? (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
              <Text style={[styles.sendLogsButtonText, { color: '#4CAF50' }]}>Inviato!</Text>
            </>
          ) : (
            <>
              <Ionicons name="send" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.sendLogsButtonText}>Invia log</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {reportSent && (
        <Text style={styles.reportSentMessage}>
          Grazie! Il nostro team analizzerà il problema.
        </Text>
      )}
    </View>
  );
};

// ============ SHARED: macOS Dock ============
const MacDock: React.FC = () => {
  return (
    <View style={styles.macDock}>
      <View style={styles.macDockBar}>
        {[
          { icon: 'compass-outline', color1: '#3B82F6', color2: '#1D4ED8' },
          { icon: 'terminal', color1: '#2D2D2D', color2: '#111111', active: true },
          { icon: 'shield-half-outline', color1: '#6366F1', color2: '#4338CA' },
          { icon: 'sparkles', color1: '#A855F7', color2: '#7C3AED' },
        ].map((app, i) => (
          <View key={i} style={styles.macDockIconWrap}>
            <View style={[styles.macDockIcon, app.active && styles.macDockIconActive]}>
              <LinearGradient
                colors={[app.color1, app.color2]}
                style={styles.macDockIconGradient}
              >
                <Ionicons name={app.icon as any} size={22} color="#fff" />
              </LinearGradient>
            </View>
            {app.active && <View style={styles.macDockDot} />}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  startScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startCloseButton: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  fullScreenContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  // macOS Desktop wallpaper orbs
  macDesktopOrb1: {
    position: 'absolute',
    top: '10%',
    left: '-15%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
  },
  macDesktopOrb2: {
    position: 'absolute',
    top: '5%',
    right: '-10%',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
  },
  macDesktopOrb3: {
    position: 'absolute',
    bottom: '15%',
    left: '20%',
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  // Terminal window (macOS style)
  devTerminalWindow: {
    width: '92%',
    maxWidth: 380,
    borderRadius: 12,
    backgroundColor: 'rgba(30, 30, 30, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  devWindowTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  devWindowDots: {
    flexDirection: 'row',
    gap: 7,
    marginRight: 12,
  },
  devWindowDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  devWindowTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
  devWindowContent: {
    padding: 24,
    alignItems: 'center',
  },
  devProjectHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  devProjectIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  devProjectName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 10,
    textAlign: 'center',
    maxWidth: '90%',
  },
  devStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  devTechBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  devTechBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'lowercase',
  },
  devDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  devStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  devStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  devStatusText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  devInfoCard: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 4,
  },
  devInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  devInfoLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
  },
  devInfoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  devInfoDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: 16,
  },
  devEnvBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  devEnvBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22C55E',
  },
  devStartBtn: {
    width: '100%',
    maxWidth: 280,
    height: 50,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 20,
    marginBottom: 32,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  devStartBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  devStartBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.2,
  },
  // macOS Dock
  macDock: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  macDockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 22,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  macDockIconWrap: {
    alignItems: 'center',
    gap: 5,
  },
  macDockIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  macDockIconActive: {
    shadowColor: AppColors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  macDockIconGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  macDockDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  // Error styles
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  errorButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sendLogsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sendLogsButtonSent: {
    borderColor: 'rgba(76, 175, 80, 0.4)',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  sendLogsButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  reportSentMessage: {
    marginTop: 16,
    fontSize: 12,
    color: 'rgba(76, 175, 80, 0.8)',
    textAlign: 'center',
  },
  // Mac Terminal Styles
  terminalContainer: {
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
  terminalHeader: {
    height: 28,
    backgroundColor: '#2B2B2B',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  terminalTrafficLights: {
    flexDirection: 'row',
    gap: 6,
  },
  terminalLight: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  terminalLightRed: {
    backgroundColor: '#7A6AD9',
  },
  terminalLightYellow: {
    backgroundColor: '#9B8AFF',
  },
  terminalLightGreen: {
    backgroundColor: '#BEB4FF',
  },
  terminalTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.45)',
    fontFamily: 'SF-Pro-Text-Medium',
    letterSpacing: 0.3,
    marginRight: 32,
  },
  terminalBody: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  terminalContent: {
    padding: 12,
    paddingTop: 8,
    gap: 2,
  },
  terminalLogText: {
    fontSize: 10,
    color: '#9B8AFF',
    lineHeight: 16,
    fontFamily: 'Courier New',
    letterSpacing: 0.2,
  },
  terminalCursor: {
    width: 6,
    height: 14,
    backgroundColor: '#9B8AFF',
    marginTop: 2,
    marginLeft: 2,
  },
  terminalFooter: {
    height: 26,
    backgroundColor: '#2B2B2B',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 10,
  },
  terminalProgressBar: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  terminalProgressFill: {
    height: '100%',
    backgroundColor: '#9B8AFF',
    borderRadius: 1.5,
  },
  terminalProgressText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'SF-Pro-Text-Semibold',
    flex: 1,
  },
  terminalRemainingText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'SF-Pro-Text-Semibold',
    textAlign: 'right',
  },
  // Session expired / iPhone mockup
  ambientBlob1: {
    position: 'absolute',
    top: '10%',
    left: '-20%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: AppColors.primary,
    opacity: 0.04,
    filter: 'blur(80px)',
  },
  ambientBlob2: {
    position: 'absolute',
    bottom: '5%',
    right: '-10%',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#6C5CE7',
    opacity: 0.03,
    filter: 'blur(100px)',
  },
  iphoneMockup: {
    width: 280,
    height: 570,
    backgroundColor: '#1c1c1e',
    borderRadius: 54,
    borderWidth: 6,
    borderColor: '#3a3a3c',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 20,
  },
  statusBarArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#0a0a0c',
    marginHorizontal: 4,
    marginTop: 4,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },
  dynamicIsland: {
    width: 72,
    height: 20,
    backgroundColor: '#000',
    borderRadius: 12,
    marginHorizontal: 8,
  },
  fakeTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    width: 32,
  },
  fakeStatusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    width: 32,
    justifyContent: 'flex-end',
  },
  iphoneScreenCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#0a0a0c',
  },
  iphoneSideButton: {
    position: 'absolute',
    right: -4,
    top: 120,
    width: 4,
    height: 60,
    backgroundColor: '#3a3a3c',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  iphoneVolumeUp: {
    position: 'absolute',
    left: -4,
    top: 100,
    width: 4,
    height: 28,
    backgroundColor: '#3a3a3c',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  iphoneVolumeDown: {
    position: 'absolute',
    left: -4,
    top: 140,
    width: 4,
    height: 28,
    backgroundColor: '#3a3a3c',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  // Cosmic styles
  cosmicOrbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
    marginBottom: 40,
  },
  cosmicOrb: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
    zIndex: 5,
  },
  cosmicOrbGlass: {
    width: 130,
    height: 130,
    borderRadius: 65,
    overflow: 'hidden',
    zIndex: 5,
  },
  cosmicOrbRaw: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 65,
    overflow: 'hidden',
  },
  cosmicGlowRing1: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
  },
  cosmicGlowRing2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(139, 124, 246, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.05)',
  },
  cosmicTextContainer: {
    alignItems: 'center',
    gap: 8,
  },
  cosmicTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
    fontFamily: 'Inter-Black',
    textAlign: 'center',
    width: '100%',
  },
  cosmicTitleUnderline: {
    width: 40,
    height: 3,
    backgroundColor: AppColors.primary,
    borderRadius: 2,
    marginBottom: 8,
  },
  cosmicSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'Inter-Medium',
  },
});
