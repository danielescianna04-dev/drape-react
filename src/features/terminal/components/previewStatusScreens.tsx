import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, ActivityIndicator, Dimensions, TextInput } from 'react-native';
import Reanimated, { FadeIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTranslation } from 'react-i18next';
import { PreviewLog } from '../../../hooks/api/usePreviewLogs';
import { useNavigationStore } from '../../../core/navigation/navigationStore';
import { tracciaPaginaPianiVista } from '../../../core/services/analyticsService';
import { WorkstationAPI } from '../../../services/api/workstationAPI';

const techIconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
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
  static: 'logo-html5',
  'python-console': 'logo-python',
  'javascript-console': 'logo-nodejs',
  'c-lang': 'code-slash-outline',
  cpp: 'code-working-outline',
  java: 'cafe-outline',
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
  static: '#E34F26',
  'python-console': '#3776AB',
  'javascript-console': '#F7DF1E',
  'c-lang': '#A8B9CC',
  cpp: '#00599C',
  java: '#ED8B00',
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
  static: 'HTML/CSS/JS',
  'python-console': 'Python',
  'javascript-console': 'JavaScript',
  'c-lang': 'C',
  cpp: 'C++',
  java: 'Java',
};

const getTechIcon = (tech?: string): keyof typeof Ionicons.glyphMap => (tech && techIconMap[tech]) || 'logo-html5';
const getTechColor = (tech?: string): string => (tech && techColorMap[tech]) || '#E34F26';
const getTechDisplayName = (tech?: string): string => (tech && techNameMap[tech]) || tech || 'Web';

const CustomStartCommand = ({ projectId, t, styles }: { projectId?: string; t: any; styles: any }) => {
  const [editing, setEditing] = useState(false);
  const [command, setCommand] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleTap = useCallback(async () => {
    if (!loaded && projectId) {
      try {
        const content = await WorkstationAPI.readFile(projectId, '.drape.json');
        if (content) {
          const config = JSON.parse(content);
          if (config.startCommand) setCommand(config.startCommand);
        }
      } catch {}
      setLoaded(true);
    }
    setEditing(true);
  }, [projectId, loaded]);

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const trimmed = command.trim();
      if (trimmed) {
        await WorkstationAPI.writeFile(projectId, '.drape.json', JSON.stringify({ startCommand: trimmed }, null, 2));
      } else {
        try { await WorkstationAPI.deleteFile(projectId, '.drape.json'); } catch {}
      }
      setEditing(false);
    } catch {}
    setSaving(false);
  }, [projectId, command]);

  if (!editing) {
    return (
      <TouchableOpacity style={styles.devInfoRow} onPress={handleTap} activeOpacity={0.6}>
        <Text style={styles.devInfoLabel}>Comando</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.devInfoValue, { fontSize: 12, color: command ? '#fff' : 'rgba(255,255,255,0.3)' }]} numberOfLines={1}>
            {command || 'auto-detect'}
          </Text>
          <Ionicons name="pencil-outline" size={12} color="rgba(255,255,255,0.3)" />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.customCmdEditContainer}>
      <Text style={[styles.devInfoLabel, { marginBottom: 6 }]}>Comando</Text>
      <View style={styles.customCmdInputRow}>
        <TextInput
          style={styles.customCmdInput}
          value={command}
          onChangeText={setCommand}
          placeholder="es. npm run dev"
          placeholderTextColor="rgba(255,255,255,0.2)"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoFocus
        />
        <TouchableOpacity style={styles.customCmdSaveBtn} onPress={handleSave} activeOpacity={0.7} disabled={saving}>
          <Ionicons name="checkmark" size={16} color="#10B981" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.customCmdSaveBtn} onPress={() => setEditing(false)} activeOpacity={0.7}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>
      <Text style={styles.customCmdHint}>Vuoto = auto-detect</Text>
    </View>
  );
};

const MacDock = ({ t }: { t: ReturnType<typeof useTranslation>['t'] }) => {
  const [openApp] = React.useState<string | null>(null);
  const dockApps = [
    { id: 'safari', icon: 'compass-outline', label: 'Safari', color1: '#3B82F6', color2: '#1D4ED8' },
    { id: 'terminal', icon: 'terminal', label: t('terminal:preview.dock.terminal'), color1: '#2D2D2D', color2: '#111111', active: true },
    { id: 'security', icon: 'shield-half-outline', label: t('terminal:preview.dock.privacy'), color1: '#6366F1', color2: '#4338CA' },
    { id: 'ai', icon: 'sparkles', label: t('terminal:preview.aiAssistant'), color1: '#A855F7', color2: '#7C3AED' },
  ];
  void dockApps;
  void openApp;
  return null;
};

const ErrorContent = ({
  previewError,
  terminalOutput,
  onRetryPreview,
  onSendErrorReport,
  t,
  styles,
}: {
  previewError: { message: string; timestamp: Date };
  terminalOutput?: string[];
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  t: any;
  styles: any;
}) => {
  const limitMatch = previewError.message.match(/^__LIMIT__(\w+)__::(.+)$/);
  const isLimitError = !!limitMatch;
  const displayMessage = limitMatch ? limitMatch[2] : previewError.message;

  const errorLines = React.useMemo(() => {
    if (!terminalOutput || terminalOutput.length === 0) return [];
    const relevant = terminalOutput.filter((line) => {
      const lower = line.toLowerCase();
      return lower.includes('error') || lower.includes('failed') || lower.includes('cannot') || lower.includes('warning') || lower.includes('×');
    });
    return relevant.length > 0 ? relevant.slice(-15) : terminalOutput.slice(-10);
  }, [terminalOutput]);

  if (isLimitError) {
    return (
      <View style={styles.errorContainer}>
        <View style={[styles.errorIconContainer, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
          <Ionicons name="lock-closed" size={48} color="#A78BFA" />
        </View>
        <Text style={styles.errorTitle}>{t('projects:limit.reached')}</Text>
        <Text style={[styles.errorMessage, { marginBottom: 20 }]} numberOfLines={3}>
          {displayMessage}
        </Text>

        <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.2)', width: '100%' }}>
          <Text style={{ color: '#C4B5FD', fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
            {t('terminal:preview.upgradeWith')}
          </Text>
          <View style={{ gap: 6 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              <Ionicons name="checkmark-circle" size={14} color="#A78BFA" /> {t('terminal:preview.upgradePreviews')}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              <Ionicons name="checkmark-circle" size={14} color="#A78BFA" /> {t('terminal:preview.upgradeBudget')}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              <Ionicons name="checkmark-circle" size={14} color="#A78BFA" /> {t('terminal:preview.upgradeFeatures')}
            </Text>
          </View>
        </View>

        <View style={styles.errorButtonsContainer}>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: '#7C3AED', flex: 1 }]}
            onPress={() => { tracciaPaginaPianiVista('preview_limit'); useNavigationStore.getState().navigateTo('plans'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="rocket" size={18} color="#fff" />
            <Text style={styles.retryButtonText}>{t('terminal:preview.upgradeCta')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.errorContainer}>
      <View style={styles.errorIconContainer}>
        <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
      </View>
      <Text style={styles.errorTitle}>{t('terminal:preview.startupFailed')}</Text>
      <Text style={styles.errorMessage} numberOfLines={3}>
        {displayMessage}
      </Text>

      {errorLines.length > 0 && (
        <View style={styles.errorLogContainer}>
          <View style={styles.errorLogHeader}>
            <Ionicons name="terminal" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorLogHeaderText}>{t('terminal:preview.dock.log')}</Text>
          </View>
          <ScrollView style={styles.errorLogScroll} nestedScrollEnabled>
            {errorLines.map((line, i) => (
              <Text key={i} style={[styles.errorLogLine, { color: line.toLowerCase().includes('error') || line.includes('×') ? '#f87171' : 'rgba(255,255,255,0.5)' }]} numberOfLines={3}>
                {line}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.errorButtonsContainer}>
        <TouchableOpacity style={styles.retryButton} onPress={onRetryPreview} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retryButtonText}>{t('common:retry')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.fixWithAiButton} onPress={onSendErrorReport} activeOpacity={0.7}>
          <Ionicons name="sparkles" size={18} color="#fff" />
          <Text style={styles.fixWithAiButtonText}>{t('terminal:preview.fixWithAi')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const PreviewStartScreenView = ({
  currentWorkstation,
  isStartTransitioning,
  startTransitionAnim,
  onStartWithTransition,
  t,
  styles,
}: {
  currentWorkstation: any;
  isStartTransitioning: boolean;
  startTransitionAnim: Animated.Value;
  onStartWithTransition: () => void;
  t: any;
  styles: any;
}) => {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const winW = Math.min(screenW * 0.85, 340);
  const winH = 420;
  const maxX = (screenW - winW) / 2;
  const maxY = (screenH - winH) / 2;

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
      if (Math.abs(translateX.value) < 20 && Math.abs(translateY.value) < 20) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }) as any);

  return (
    <View style={styles.startScreen}>
      <LinearGradient colors={AppColors.gradient.dark as unknown as [string, string, string, string]} locations={[0, 0.3, 0.7, 1]} style={StyleSheet.absoluteFill} />
      <Reanimated.View style={[dragStyle, { width: '85%', maxWidth: 340, alignSelf: 'center' }]}>
        <Animated.View
          style={[
            styles.devTerminalWindow,
            {
              opacity: startTransitionAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.5, 0] }),
              transform: [
                { scale: startTransitionAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] }) },
                { translateY: startTransitionAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
              ],
            },
          ]}
        >
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

          <View style={styles.devWindowContent}>
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
                  <Text style={styles.devEnvBadgeText}>{t('terminal:preview.dock.development')}</Text>
                </View>
              </View>
              <View style={styles.devInfoDivider} />
              <CustomStartCommand projectId={currentWorkstation?.id} t={t} styles={styles} />
            </View>

            <TouchableOpacity style={styles.devStartBtn} onPress={onStartWithTransition} activeOpacity={0.85} disabled={isStartTransitioning}>
              <LinearGradient colors={isStartTransitioning ? ['#4C1D95', '#4C1D95'] : [AppColors.primary, '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.devStartBtnGradient}>
                {isStartTransitioning ? <ActivityIndicator size="small" color="#fff" /> : <>
                  <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
                  <Text style={styles.devStartBtnText}>{t('terminal:preview.startPreview')}</Text>
                </>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Reanimated.View>
      <MacDock t={t} />
    </View>
  );
};

export const PreviewSessionExpiredScreenView = ({
  sessionExpiredMessage,
  onStartServer,
  t,
  styles,
}: {
  sessionExpiredMessage: string;
  onStartServer: () => void;
  t: any;
  styles: any;
}) => {
  const message = sessionExpiredMessage || t('terminal:preview.sessionExpired');

  return (
    <Reanimated.View style={styles.startScreen} entering={FadeIn.duration(300)}>
      <LinearGradient colors={['#13052A', '#090518', '#06050F', '#080719', '#13052A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
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
          <LinearGradient colors={['#F59E0B', '#EA580C']} start={{ x: 0.2, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.sessionIconInner}>
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
        <TouchableOpacity style={styles.sessionCta} onPress={onStartServer} activeOpacity={0.9}>
          <LinearGradient colors={['#9B8AFF', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sessionCtaGradient}>
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={styles.sessionCtaText}>{t('terminal:preview.sessionRestartCta')}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.sessionHint}>{t('terminal:preview.tapToRestart')}</Text>
      </View>
    </Reanimated.View>
  );
};

export const PreviewErrorScreenView = ({
  previewError,
  terminalOutput,
  onClose,
  onRetryPreview,
  onSendErrorReport,
  topInset,
  t,
  styles,
}: {
  previewError: { message: string; timestamp: Date };
  terminalOutput?: string[];
  onClose: () => void;
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  topInset: number;
  t: any;
  styles: any;
}) => (
  <View style={styles.startScreen}>
    <LinearGradient colors={AppColors.gradient.dark as unknown as [string, string, string, string]} locations={[0, 0.3, 0.7, 1]} style={StyleSheet.absoluteFill} />
    <TouchableOpacity onPress={onClose} style={[styles.startCloseButton, { top: topInset + 8, right: 16 }]} activeOpacity={0.7}>
      <Ionicons name="close" size={22} color="rgba(255, 255, 255, 0.4)" />
    </TouchableOpacity>
    <View style={styles.fullScreenContent}>
      <ErrorContent
        previewError={previewError}
        terminalOutput={terminalOutput}
        onRetryPreview={onRetryPreview}
        onSendErrorReport={onSendErrorReport}
        t={t}
        styles={styles}
      />
    </View>
  </View>
);

export const PreviewLoadingScreenView = ({
  previewError,
  previewLogs,
  terminalOutput,
  displayedMessage,
  startingMessage,
  smoothProgress,
  elapsedSeconds,
  pulseAnim,
  onRetryPreview,
  onSendErrorReport,
  t,
  styles,
}: {
  previewError: { message: string; timestamp: Date } | null;
  previewLogs: PreviewLog[];
  terminalOutput?: string[];
  displayedMessage: string;
  startingMessage: string;
  smoothProgress: number;
  elapsedSeconds: number;
  pulseAnim: Animated.Value;
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  t: any;
  styles: any;
}) => {
  const terminalLines = React.useMemo(() => {
    if (terminalOutput && terminalOutput.length > 0) return terminalOutput;
    if (previewLogs.length > 0) return previewLogs.map((entry) => entry.message);
    return [];
  }, [terminalOutput, previewLogs]);

  return (
    <View style={styles.startScreen}>
      <LinearGradient colors={AppColors.gradient.dark as unknown as [string, string, string, string]} locations={[0, 0.3, 0.7, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.fullScreenContent}>
        {previewError ? (
          <ErrorContent
            previewError={previewError}
            terminalOutput={terminalOutput}
            onRetryPreview={onRetryPreview}
            onSendErrorReport={onSendErrorReport}
            t={t}
            styles={styles}
          />
        ) : (
          <View style={styles.terminalContainer}>
            <View style={styles.terminalHeader}>
              <View style={styles.terminalTrafficLights}>
                <View style={[styles.terminalLight, styles.terminalLightRed]} />
                <View style={[styles.terminalLight, styles.terminalLightYellow]} />
                <View style={[styles.terminalLight, styles.terminalLightGreen]} />
              </View>
              <Text style={styles.terminalTitle}>{t('terminal:preview.dock.terminalWindowTitle')}</Text>
            </View>
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
              <Animated.View style={[styles.terminalCursor, { opacity: pulseAnim.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1] }) }]} />
            </ScrollView>
            <View style={styles.terminalFooter}>
              <View style={styles.terminalProgressBar}>
                <View style={[styles.terminalProgressFill, { width: `${smoothProgress}%` }]} />
              </View>
              <Text style={styles.terminalProgressText} numberOfLines={1}>
                {startingMessage || t('terminal:preview.loading')}
              </Text>
              {elapsedSeconds > 0 && (
                <Text style={styles.terminalRemainingText}>
                  {elapsedSeconds < 60 ? `${elapsedSeconds}s` : `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
      <MacDock t={t} />
    </View>
  );
};
