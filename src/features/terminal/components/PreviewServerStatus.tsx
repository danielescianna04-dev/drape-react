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
import {
  PreviewErrorScreenView,
  PreviewLoadingScreenView,
  PreviewSessionExpiredScreenView,
  PreviewStartScreenView,
} from './previewStatusScreens';

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

function getTechIcon(tech?: string): keyof typeof Ionicons.glyphMap {
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

// ============ CUSTOM START COMMAND ============
const CustomStartCommand: React.FC<{ projectId?: string; t: any }> = ({ projectId, t }) => {
  const [editing, setEditing] = useState(false);
  const [command, setCommand] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load existing custom command on first tap
  const handleTap = useCallback(async () => {
    if (!loaded && projectId) {
      try {
        const content = await WorkstationAPI.readFile(projectId, '.bynot.json');
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
        await WorkstationAPI.writeFile(projectId, '.bynot.json', JSON.stringify({ startCommand: trimmed }, null, 2));
      } else {
        try { await WorkstationAPI.deleteFile(projectId, '.bynot.json'); } catch {}
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

// ============ START SCREEN ============
export const PreviewStartScreen: React.FC<{
  currentWorkstation: any;
  isStartTransitioning: boolean;
  startTransitionAnim: Animated.Value;
  onStartWithTransition: () => void;
  t: any;
}> = (props) => <PreviewStartScreenView {...props} styles={styles} />;

// ============ SESSION EXPIRED SCREEN ============
export const PreviewSessionExpiredScreen: React.FC<{
  sessionExpiredMessage: string;
  onStartServer: () => void;
  t: any;
}> = (props) => <PreviewSessionExpiredScreenView {...props} styles={styles} />;

// ============ ERROR SCREEN ============
export const PreviewErrorScreen: React.FC<{
  previewError: { message: string; timestamp: Date };
  terminalOutput?: string[];
  onClose: () => void;
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  topInset: number;
  t: any;
}> = (props) => <PreviewErrorScreenView {...props} styles={styles} />;

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
  onClose: _onClose,
  topInset: _topInset,
  ...props
}) => <PreviewLoadingScreenView {...props} styles={styles} />;

// ============ SHARED: Error Content ============
const ErrorContent: React.FC<{
  previewError: { message: string; timestamp: Date };
  terminalOutput?: string[];
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  t: any;
}> = ({ previewError, terminalOutput, onRetryPreview, onSendErrorReport, t }) => {
  // Check if this is a limit error (prefixed by PreviewPanel)
  const limitMatch = previewError.message.match(/^__LIMIT__(\w+)__::(.+)$/);
  const isLimitError = !!limitMatch;
  const displayMessage = limitMatch ? limitMatch[2] : previewError.message;

  // Show last terminal lines that contain errors
  const errorLines = React.useMemo(() => {
    if (!terminalOutput || terminalOutput.length === 0) return [];
    const relevant = terminalOutput.filter(line => {
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

        <View style={{
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderRadius: 16,
          padding: 16,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: 'rgba(139, 92, 246, 0.2)',
          width: '100%',
        }}>
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
            style={[styles.retryButton, {
              backgroundColor: '#7C3AED',
              flex: 1,
            }]}
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

      {/* Terminal error log */}
      {errorLines.length > 0 && (
        <View style={styles.errorLogContainer}>
          <View style={styles.errorLogHeader}>
            <Ionicons name="terminal" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorLogHeaderText}>{t('terminal:preview.dock.log')}</Text>
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
const MacDock: React.FC<{ t: ReturnType<typeof useTranslation>['t'] }> = ({ t }) => {
  const [openApp, setOpenApp] = React.useState<string | null>(null);

  const dockApps = [
    { id: 'safari', icon: 'compass-outline', label: 'Safari', color1: '#3B82F6', color2: '#1D4ED8' },
    { id: 'terminal', icon: 'terminal', label: t('terminal:preview.dock.terminal'), color1: '#2D2D2D', color2: '#111111', active: true },
    { id: 'security', icon: 'shield-half-outline', label: t('terminal:preview.dock.privacy'), color1: '#6366F1', color2: '#4338CA' },
    { id: 'ai', icon: 'sparkles', label: t('terminal:preview.aiAssistant'), color1: '#A855F7', color2: '#7C3AED' },
  ];

  return null;
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

  // Custom start command
  customCmdEditContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  customCmdInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customCmdInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#fff',
  },
  customCmdHint: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 4,
    marginLeft: 2,
  },
  customCmdSaveBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
