import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import Reanimated, { FadeIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTranslation } from 'react-i18next';
import { PreviewLog } from '../../../hooks/api/usePreviewLogs';

const techIconMap: Record<string, string> = {
  react: 'logo-react',
  vue: 'logo-vue',
  nextjs: 'server-outline',
  nuxt: 'layers-outline',
  svelte: 'flame-outline',
  angular: 'navigate-outline',
  astro: 'planet-outline',
  remix: 'repeat-outline',
  solid: 'water-outline',
  flask: 'logo-python',
  django: 'shield-outline',
  fastapi: 'flash-outline',
  expo: 'phone-portrait-outline',
  flutter: 'apps-outline',
  laravel: 'diamond-outline',
  html: 'logo-html5',
};

const techColorMap: Record<string, string> = {
  react: '#61DAFB',
  vue: '#4FC08D',
  nextjs: '#fff',
  nuxt: '#00DC82',
  svelte: '#FF3E00',
  angular: '#DD0031',
  astro: '#BC52EE',
  remix: '#E8F2FF',
  solid: '#2C4F7C',
  flask: '#3776AB',
  django: '#092E20',
  fastapi: '#009688',
  expo: '#61DAFB',
  flutter: '#02569B',
  laravel: '#FF2D20',
  html: '#E34F26',
};

const techNameMap: Record<string, string> = {
  react: 'React',
  vue: 'Vue.js',
  nextjs: 'Next.js',
  nuxt: 'Nuxt.js',
  svelte: 'SvelteKit',
  angular: 'Angular',
  astro: 'Astro',
  remix: 'Remix',
  solid: 'Solid.js',
  flask: 'Flask',
  django: 'Django',
  fastapi: 'FastAPI',
  expo: 'React Native',
  flutter: 'Flutter',
  laravel: 'Laravel',
  html: 'HTML/CSS/JS',
};

function getTechIcon(tech?: string): string {
  return (tech && techIconMap[tech]) || 'logo-html5';
}

function getTechColor(tech?: string): string {
  return (tech && techColorMap[tech]) || '#E34F26';
}

function getTechDisplayName(tech?: string): string {
  return (tech && techNameMap[tech]) || tech || 'Web';
}

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
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const winW = Math.min(screenW * 0.85, 340);
  const winH = 420; // approximate window height
  const maxX = (screenW - winW) / 2;
  const maxY = (screenH - winH) / 2;

  // Drag state
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  const clamp = (val: number, min: number, max: number) => {
    'worklet';
    return Math.min(Math.max(val, min), max);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      offsetX.value = translateX.value;
      offsetY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = clamp(offsetX.value + e.translationX, -maxX, maxX);
      translateY.value = clamp(offsetY.value + e.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      // snap back if near center
      if (Math.abs(translateX.value) < 20 && Math.abs(translateY.value) < 20) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

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

      {/* Terminal-style window with project info — draggable */}
      <Reanimated.View style={[dragStyle, { width: '85%', maxWidth: 340, alignSelf: 'center' }]}>
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
          {/* Window title bar — drag handle */}
          <GestureDetector gesture={panGesture}>
            <Reanimated.View style={styles.devWindowTitleBar}>
              <View style={styles.devWindowDots}>
                <View style={[styles.devWindowDot, { backgroundColor: '#FF5F57' }]} />
                <View style={[styles.devWindowDot, { backgroundColor: '#FEBC2E' }]} />
                <View style={[styles.devWindowDot, { backgroundColor: '#28C840' }]} />
              </View>
              <Text style={styles.devWindowTitle}>
                {currentWorkstation?.name || t('terminal:preview.project')} — preview
              </Text>
              <View style={{ width: 44 }} />
            </Reanimated.View>
          </GestureDetector>

        {/* Window content */}
        <View style={styles.devWindowContent}>
          {/* Project Identity */}
          <View style={styles.devProjectHeader}>
            <View style={styles.devProjectIcon}>
              <Ionicons
                name={getTechIcon(currentWorkstation?.technology || currentWorkstation?.language)}
                size={24}
                color={getTechColor(currentWorkstation?.technology || currentWorkstation?.language)}
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
                {getTechDisplayName(currentWorkstation?.technology)}
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
      </Reanimated.View>

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
  const message = sessionExpiredMessage || t('terminal:preview.sessionExpired');

  return (
    <Reanimated.View style={styles.startScreen} entering={FadeIn.duration(300)}>
      <LinearGradient
        colors={['#13052A', '#090518', '#06050F', '#080719', '#13052A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.sessionBgOrbA} />
      <View style={styles.sessionBgOrbB} />
      <View style={styles.sessionBgOrbC} />

      <View style={styles.sessionCard}>
        <View style={styles.sessionCardGlow} />

        <View style={styles.sessionHeader}>
          <View style={styles.sessionBadge}>
            <Ionicons name="time-outline" size={14} color="#FDBA74" />
            <Text style={styles.sessionBadgeText}>{t('terminal:preview.sessionBadge')}</Text>
          </View>
        </View>

        <View style={styles.sessionIconOuter}>
          <View style={styles.sessionIconRing} />
          <LinearGradient
            colors={['#F59E0B', '#EA580C']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.sessionIconInner}
          >
            <Ionicons name="hourglass-outline" size={32} color="#FFFFFF" />
          </LinearGradient>
        </View>

        <Text style={styles.sessionTitle}>{t('terminal:preview.sessionExpiredTitle')}</Text>
        <Text style={styles.sessionMessage}>{message}</Text>

        <View style={styles.sessionInfoRow}>
          <View style={styles.sessionInfoChip}>
            <Ionicons name="save-outline" size={14} color={AppColors.primaryTint} />
            <Text style={styles.sessionInfoText}>{t('terminal:preview.sessionStatePreserved')}</Text>
          </View>
          <View style={styles.sessionInfoChip}>
            <Ionicons name="flash-outline" size={14} color={AppColors.primaryTint} />
            <Text style={styles.sessionInfoText}>{t('terminal:preview.sessionFastRestart')}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.sessionCta}
          onPress={onStartServer}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#9B8AFF', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sessionCtaGradient}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={styles.sessionCtaText}>{t('terminal:preview.sessionRestartCta')}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.sessionHint}>{t('terminal:preview.tapToRestart')}</Text>
      </View>
    </Reanimated.View>
  );
};

// ============ ERROR SCREEN ============
export const PreviewErrorScreen: React.FC<{
  previewError: { message: string; timestamp: Date };
  terminalOutput?: string[];
  onClose: () => void;
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  topInset: number;
  t: any;
}> = ({ previewError, terminalOutput, onClose, onRetryPreview, onSendErrorReport, topInset, t }) => {
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
          terminalOutput={terminalOutput}
          onRetryPreview={onRetryPreview}
          onSendErrorReport={onSendErrorReport}
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
  topInset,
  t,
}) => {
  const terminalLines = React.useMemo(() => {
    if (terminalOutput && terminalOutput.length > 0) return terminalOutput;
    if (previewLogs.length > 0) return previewLogs.map((entry) => entry.message);
    return [];
  }, [terminalOutput, previewLogs]);

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

      {/* Content - Error or Terminal (full screen) */}
      <View style={styles.fullScreenContent}>
        {previewError ? (
          /* ERROR UI */
          <ErrorContent
            previewError={previewError}
            terminalOutput={terminalOutput}
            onRetryPreview={onRetryPreview}
            onSendErrorReport={onSendErrorReport}
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
                if (ref && terminalLines.length > 0) {
                  setTimeout(() => ref.scrollToEnd({ animated: true }), 100);
                }
              }}
            >
              {/* Real container terminal output */}
              {terminalLines.length > 0 ? (
                terminalLines.map((line, index) => (
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
  terminalOutput?: string[];
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  t: any;
}> = ({ previewError, terminalOutput, onRetryPreview, onSendErrorReport, t }) => {
  // Show last terminal lines that contain errors
  const errorLines = React.useMemo(() => {
    if (!terminalOutput || terminalOutput.length === 0) return [];
    const relevant = terminalOutput.filter(line => {
      const lower = line.toLowerCase();
      return lower.includes('error') || lower.includes('failed') || lower.includes('cannot') || lower.includes('warning') || lower.includes('×');
    });
    return relevant.length > 0 ? relevant.slice(-15) : terminalOutput.slice(-10);
  }, [terminalOutput]);

  return (
    <View style={styles.errorContainer}>
      <View style={styles.errorIconContainer}>
        <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
      </View>
      <Text style={styles.errorTitle}>{t('terminal:preview.startupFailed')}</Text>
      <Text style={styles.errorMessage} numberOfLines={3}>
        {previewError.message}
      </Text>

      {/* Terminal error log */}
      {errorLines.length > 0 && (
        <View style={styles.errorLogContainer}>
          <View style={styles.errorLogHeader}>
            <Ionicons name="terminal" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorLogHeaderText}>Log</Text>
          </View>
          <ScrollView style={styles.errorLogScroll} nestedScrollEnabled>
            {errorLines.map((line, i) => (
              <Text key={i} style={[styles.errorLogLine, {
                color: line.toLowerCase().includes('error') || line.includes('×') ? '#f87171' : 'rgba(255,255,255,0.5)',
              }]} numberOfLines={3}>
                {line}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}

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
          style={styles.fixWithAiButton}
          onPress={onSendErrorReport}
          activeOpacity={0.7}
        >
          <Ionicons name="sparkles" size={18} color="#fff" />
          <Text style={styles.fixWithAiButtonText}>{t('terminal:preview.fixWithAi')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ============ SHARED: macOS Dock ============
const MacDock: React.FC = () => {
  const [openApp, setOpenApp] = React.useState<string | null>(null);

  const dockApps = [
    { id: 'safari', icon: 'compass-outline', label: 'Safari', color1: '#3B82F6', color2: '#1D4ED8' },
    { id: 'terminal', icon: 'terminal', label: 'Terminale', color1: '#2D2D2D', color2: '#111111', active: true },
    { id: 'security', icon: 'shield-half-outline', label: 'Privacy', color1: '#6366F1', color2: '#4338CA' },
    { id: 'ai', icon: 'sparkles', label: 'AI Assistant', color1: '#A855F7', color2: '#7C3AED' },
  ];

  return (
    <>
      {/* Fake app overlay */}
      {openApp && (
        <TouchableOpacity
          style={styles.fakeAppOverlay}
          activeOpacity={1}
          onPress={() => setOpenApp(null)}
        >
          <Reanimated.View entering={FadeIn.duration(200)} style={styles.fakeAppWindow}>
            <View style={styles.fakeAppTitleBar}>
              <TouchableOpacity onPress={() => setOpenApp(null)}>
                <View style={[styles.devWindowDot, { backgroundColor: '#FF5F57' }]} />
              </TouchableOpacity>
              <Text style={styles.fakeAppTitle}>
                {dockApps.find(a => a.id === openApp)?.label}
              </Text>
              <View style={{ width: 12 }} />
            </View>
            <View style={styles.fakeAppContent}>
              <Ionicons
                name={(dockApps.find(a => a.id === openApp)?.icon || 'apps') as any}
                size={40}
                color="rgba(255,255,255,0.15)"
              />
              <Text style={styles.fakeAppText}>
                {openApp === 'safari' ? 'Navigazione non disponibile' :
                 openApp === 'terminal' ? '$ _' :
                 openApp === 'security' ? 'Nessuna minaccia rilevata' :
                 'AI Assistant pronto'}
              </Text>
            </View>
          </Reanimated.View>
        </TouchableOpacity>
      )}

      <View style={styles.macDock}>
        <View style={styles.macDockBar}>
          {dockApps.map((app) => (
            <TouchableOpacity
              key={app.id}
              activeOpacity={0.7}
              onPress={() => setOpenApp(app.id)}
            >
              <View style={styles.macDockIconWrap}>
                <View style={[styles.macDockIcon, app.active && styles.macDockIconActive]}>
                  <LinearGradient
                    colors={[app.color1, app.color2]}
                    style={styles.macDockIconGradient}
                  >
                    <Ionicons name={app.icon as any} size={22} color="#fff" />
                  </LinearGradient>
                </View>
                {(app.active || openApp === app.id) && <View style={styles.macDockDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </>
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
    borderRadius: 22,
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
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 10,
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
    borderRadius: 25,
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
    borderRadius: 22,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  fixWithAiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  fixWithAiButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  errorLogContainer: {
    width: '100%',
    maxHeight: 180,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  errorLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  errorLogHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorLogScroll: {
    padding: 10,
  },
  errorLogLine: {
    fontSize: 10,
    fontFamily: 'Courier New',
    lineHeight: 15,
    color: 'rgba(255, 255, 255, 0.5)',
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
  // Session expired screen
  sessionBgOrbA: {
    position: 'absolute',
    top: '12%',
    left: '-16%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(139, 92, 246, 0.26)',
  },
  sessionBgOrbB: {
    position: 'absolute',
    top: '6%',
    right: '-10%',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
  },
  sessionBgOrbC: {
    position: 'absolute',
    bottom: '10%',
    left: '8%',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
  },
  sessionCard: {
    width: '90%',
    maxWidth: 390,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(12, 10, 24, 0.8)',
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 22,
    overflow: 'hidden',
  },
  sessionCardGlow: {
    position: 'absolute',
    top: -80,
    right: -50,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  sessionHeader: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 18,
  },
  sessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.26)',
  },
  sessionBadgeText: {
    color: '#FED7AA',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sessionIconOuter: {
    width: 148,
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  sessionIconRing: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.22)',
    backgroundColor: 'rgba(251, 191, 36, 0.06)',
  },
  sessionIconInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  sessionTitle: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 10,
  },
  sessionMessage: {
    fontSize: 15,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginBottom: 16,
  },
  sessionInfoRow: {
    width: '100%',
    gap: 8,
    marginBottom: 20,
  },
  sessionInfoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sessionInfoText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '600',
  },
  sessionCta: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 10,
  },
  sessionCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
  },
  sessionCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sessionHint: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Fake app overlay (dock click)
  fakeAppOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  fakeAppWindow: {
    width: '75%',
    maxWidth: 300,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
  },
  fakeAppTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  fakeAppTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  fakeAppContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 14,
  },
  fakeAppText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '500',
  },
});
