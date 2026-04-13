import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Alert, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight, FadeInDown } from 'react-native-reanimated';
import { I18nextProvider } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import i18n from './src/i18n';
import { useLanguageStore } from './src/i18n/languageStore';

import { ProjectsHomeScreen } from './src/features/projects/ProjectsHomeScreen';
import { NavigationContainer } from '@react-navigation/native';
import { CreateProjectScreen } from './src/features/projects/CreateProjectScreen';
import { AllProjectsScreen } from './src/features/projects/AllProjectsScreen';
import { ImportGitHubModal } from './src/features/terminal/components/ImportGitHubModal';
import { GitHubAuthModal } from './src/features/terminal/components/GitHubAuthModal';
import { LoadingModal } from './src/shared/components/molecules/LoadingModal';
import { GitAuthPopup } from './src/features/terminal/components/GitAuthPopup';
import { ErrorBoundary } from './src/shared/components/ErrorBoundary';
import { OfflineOverlay } from './src/shared/components/OfflineOverlay';
import { InAppToast } from './src/shared/components/InAppToast';
import { workstationService } from './src/core/workstation/workstationService-firebase';
import { useTerminalStore } from './src/core/terminal/terminalStore';
import { useTabStore } from './src/core/tabs/tabStore';
import { useAuthStore } from './src/core/auth/authStore';
import { NetworkConfigProvider } from './src/providers/NetworkConfigProvider';
import { migrateGitAccounts } from './src/core/migrations/migrateGitAccounts';
import { liveActivityService } from './src/core/services/liveActivityService';
import { useBackendLogs } from './src/hooks/api/useBackendLogs';
import { useFileSync } from './src/hooks/business/useFileSync';
import { useNavigationStore } from './src/core/navigation/navigationStore';
import type { Screen } from './src/core/navigation/navigationStore';
import { tracciaSchermata } from './src/core/services/analyticsService';
import * as Notifications from 'expo-notifications';
import { useOTAUpdates } from './src/hooks/app/useOTAUpdates';
import { useConsentStore } from './src/core/services/consentService';
import { WorkspaceScreen } from './src/app/WorkspaceScreen';
import { SettingsOverlay } from './src/app/SettingsOverlay';
import { AppWorkspaceRoutes } from './src/app/AppWorkspaceRoutes';
import { useFileCacheStore } from './src/core/cache/fileCacheStore';
import {
  AuthRoute,
  ConsentRoute,
  FirstProjectChoiceRoute,
  ForceUpdateRoute,
  NativeLoadingRoute,
  OnboardingFlowRoute,
  OnboardingPlansRoute,
  SplashRoute,
} from './src/app/AppPreWorkspaceRoutes';
import { useAppProjectActions } from './src/app/useAppProjectActions';
import { useAppRouting } from './src/app/useAppRouting';
import { getTrackedAppScreenLabel } from './src/app/appScreenAnalytics';
import { extractGitHubRepoUrlFromDeepLink } from './src/app/appDeepLinkUtils';
import { resolveOverlayCloseScreen } from './src/app/appOverlayRouting';
import { shouldShowAuthRoute, shouldShowNativeLoadingRoute } from './src/app/appRouteGuards';
import { shouldShowHomeShell, shouldShowWorkspaceShell } from './src/app/appScreenVisibility';


function ForceUpdateScreen({ storeUrl }: { storeUrl: string }) {
  return (
    <View style={fuStyles.container}>
      <StatusBar style="light" />
      <Text style={fuStyles.emoji}>🚀</Text>
      <Text style={fuStyles.title}>{i18n.t('common:ota.forceTitle')}</Text>
      <Text style={fuStyles.subtitle}>{i18n.t('common:ota.forceMessage')}</Text>
      <TouchableOpacity style={fuStyles.button} onPress={() => Linking.openURL(storeUrl)}>
        <Text style={fuStyles.buttonText}>{i18n.t('common:ota.forceButton')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const fuStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 48, marginBottom: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  subtitle: { color: '#666', fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 40 },
  button: { backgroundColor: '#6366f1', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

const MAINTENANCE_MODE = false;

function MaintenanceScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0C0816', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <StatusBar style="light" />
      <Ionicons name="construct-outline" size={64} color="#8B5CF6" style={{ marginBottom: 24 }} />
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 12 }}>
        Manutenzione in corso
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, textAlign: 'center', lineHeight: 24 }}>
        Stiamo migliorando Drape per offrirti un'esperienza ancora migliore.{'\n\n'}Torneremo online il{' '}
        <Text style={{ color: '#A78BFA', fontWeight: '600' }}>9 Aprile 2026</Text>.
      </Text>
      <View style={{ marginTop: 40, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, backgroundColor: 'rgba(139, 92, 246, 0.12)', borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.25)' }}>
        <Text style={{ color: '#A78BFA', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
          Grazie per la pazienza 💜
        </Text>
      </View>
    </View>
  );
}

export default function App() {
  if (MAINTENANCE_MODE) {
    return (
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <MaintenanceScreen />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  const [currentScreen, _setCurrentScreen] = useState<Screen>('splash');
  const setCurrentScreen = (screen: Screen | ((prev: Screen) => Screen)) => {
    _setCurrentScreen(prev => {
      const next = typeof screen === 'function' ? screen(prev) : screen;
      if (next !== prev && next !== 'splash') {
        const label = getTrackedAppScreenLabel(next);
        if (!label) return next;
        tracciaSchermata(label);
      }
      return next;
    });
  };
  const [createKey, setCreateKey] = useState(0);
  const [isFirstCreate, setIsFirstCreate] = useState(false);
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<'welcome' | 'consent' | 'experience' | 'referral'>('welcome');
  const [onboardingDraft, setOnboardingDraft] = useState<{
    experienceLevel: string | null;
    referralSource: string | null;
  }>({
    experienceLevel: null,
    referralSource: null,
  });

  const { setWorkstation, clearGlobalTerminalLog } = useTerminalStore();
  const { clearTerminalItems, addTerminalItem: addTerminalItemToStore } = useTabStore();
  const { initialize } = useAuthStore();
  const consent = useConsentStore((state) => state.consent);

  // Stream backend logs to terminal (always enabled when logged in)
  const { isInitialized, user } = useAuthStore();
  useBackendLogs({ enabled: isInitialized && !!user });

  // Global file synchronization via WebSocket
  useFileSync();

  // OTA updates + backend version check
  const { forceNativeUpdate, storeUrl } = useOTAUpdates();

  // --- Project actions hook ---
  const projectActions = useAppProjectActions({
    setCurrentScreen,
    currentScreen,
    isFirstCreate,
    setIsFirstCreate,
    setOnboardingDraft,
    setOnboardingInitialStep,
  });

  const {
    showImportModal, setShowImportModal,
    showAuthModal, setShowAuthModal,
    pendingRepoUrl, setPendingRepoUrl,
    isImporting,
    loadingMessage,
    limitModal, setLimitModal,
    pendingFirstProjectImportFromScreen, setPendingFirstProjectImportFromScreen,
    handleImportRepo,
    handleFirstProjectClone,
    handleOpenProject,
    finalizeFirstProjectSetup,
    currentWorkstation,
  } = projectActions;

  // --- Routing hook ---
  const { handleSplashFinish, consentLoaded } = useAppRouting({
    currentScreen,
    setCurrentScreen,
    setIsFirstCreate,
    setOnboardingInitialStep,
    setOnboardingDraft,
    onboardingInitialStep,
    onboardingDraft,
    pendingFirstProjectImportFromScreen,
    setPendingFirstProjectImportFromScreen,
    finalizeFirstProjectSetup,
  });
  const previousScreen = useNavigationStore((state) => state.previousScreen);

  // Initialize auth listener on app start
  useEffect(() => {
    initialize();

    // Initialize language from storage
    useLanguageStore.getState().initialize();

    // Load GDPR consent from AsyncStorage (must happen before any tracking)
    useConsentStore.getState().loadConsent();

    // Richiedi permesso notifiche push all'avvio (non-blocking)
    liveActivityService.requestNotificationPermission().catch(() => {});

    // Pulisci le Live Activity orfane rimaste da sessioni precedenti (crash, kill, ecc.)
    liveActivityService.endAllActivities().catch(() => {});

    // Notification tap handling is centralized in pushNotificationService.handleNotificationTap
  }, []);

  // Deep link handling
  const handleDeepLink = (url: string) => {
    const githubUrl = extractGitHubRepoUrlFromDeepLink(url);
    if (githubUrl) {
      handleImportRepo(githubUrl);
    }
  };

  // Run migration on app startup to sync old accounts to new storage
  useEffect(() => {
    const runMigration = async () => {
      const userId = useTerminalStore.getState().userId || 'anonymous';
      await migrateGitAccounts(userId);
    };
    runMigration();
  }, []);

  // Load chat history from AsyncStorage on app startup
  useEffect(() => {
    const loadChatHistory = async () => {
      await useTerminalStore.getState().loadChats();
    };
    loadChatHistory();
  }, []);

  useEffect(() => {
    const handleInitialUrl = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          handleDeepLink(url);
        }
      } catch (error) {
        console.error('Error getting initial URL:', error);
      }
    };

    handleInitialUrl();

    const subscription = Linking.addEventListener('url', ({ url }) => {
      try {
        handleDeepLink(url);
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (currentScreen === 'splash') {
    return <SplashRoute onFinish={handleSplashFinish} />;
  }

  // Show seamless dark screen while auth is initializing (must be BEFORE auth check)
  if (shouldShowNativeLoadingRoute({ isInitialized, consentLoaded })) {
    return <NativeLoadingRoute />;
  }

  // Force native update — blocks everything until user updates from App Store
  if (forceNativeUpdate) {
    return (
      <ForceUpdateRoute>
        <ForceUpdateScreen storeUrl={storeUrl} />
      </ForceUpdateRoute>
    );
  }

  // Show auth screen only when initialized and no user
  if (shouldShowAuthRoute({ hasUser: !!user })) {
    return <AuthRoute i18n={i18n} />;
  }

  if (currentScreen === 'onboarding') {
    return (
      <OnboardingPlansRoute
        i18n={i18n}
        onClose={() => {
          useAuthStore.setState({ isNewUser: false });
          setCurrentScreen('home');
        }}
      />
    );
  }

  if (currentScreen === 'onboardingFlow') {
    return (
      <OnboardingFlowRoute
        i18n={i18n}
        userId={user.uid}
        initialStep={onboardingInitialStep}
        experienceLevel={onboardingDraft.experienceLevel}
        referralSource={onboardingDraft.referralSource}
        onExperienceLevelChange={(value) =>
          setOnboardingDraft((current) => ({ ...current, experienceLevel: value }))
        }
        onReferralSourceChange={(value) =>
          setOnboardingDraft((current) => ({ ...current, referralSource: value }))
        }
        onComplete={() => {
          useAuthStore.setState(state => ({
            user: state.user ? { ...state.user, onboardingCompleted: true } : state.user,
            isNewUser: false,
          }));
          setOnboardingInitialStep('welcome');
          setCurrentScreen('firstProjectChoice');
        }}
      />
    );
  }

  if (currentScreen === 'firstProjectChoice') {
    return (
      <FirstProjectChoiceRoute
        i18n={i18n}
        onBack={() => {
          setOnboardingInitialStep('referral');
          setCurrentScreen('onboardingFlow');
        }}
        onCreate={() => {
          setCreateKey(k => k + 1);
          setCurrentScreen('create');
        }}
        onCloneOpen={() => setShowImportModal(true)}
        showImportModal={showImportModal}
        onCloseImport={() => {
          setShowImportModal(false);
          if (!isImporting) {
            setPendingFirstProjectImportFromScreen(null);
          }
        }}
        onImport={(url, branch) => {
          setPendingFirstProjectImportFromScreen({
            previousWorkstationId: currentWorkstation?.id || null,
          });
          handleFirstProjectClone(url, branch).catch((error) => {
            console.warn('[App] First project clone flow failed:', error?.message || error);
          });
        }}
        isImporting={isImporting}
        showAuthModal={showAuthModal}
        onCloseAuth={() => {
          setShowAuthModal(false);
          setPendingRepoUrl('');
        }}
        onAuthenticated={(token) => {
          setShowAuthModal(false);
          if (pendingRepoUrl) {
            handleImportRepo(pendingRepoUrl, token);
            setPendingRepoUrl('');
          }
        }}
        loadingMessage={loadingMessage}
      />
    );
  }

  if (currentScreen === 'consent') {
    return (
      <ConsentRoute
        i18n={i18n}
        onResolved={() => {
          useAuthStore.getState().refreshConsentAwareServices().catch(() => {});
          const shouldResumeFirstCreate = user.onboardingCompleted === true && user.hasCreatedFirstProject === false;
          if (shouldResumeFirstCreate) {
            setIsFirstCreate(true);
            setOnboardingInitialStep('referral');
            setCurrentScreen('firstProjectChoice');
            return;
          }
          const plan = user.plan || 'free';
          if (plan === 'free') {
            setCurrentScreen('onboarding');
          } else {
            setCurrentScreen('home');
          }
        }}
      />
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <SafeAreaProvider style={{ backgroundColor: '#000' }}>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <NetworkConfigProvider>
              <ErrorBoundary>
              <AppWorkspaceRoutes
                currentScreen={currentScreen}
                previousScreen={previousScreen}
                createKey={createKey}
                isFirstCreate={isFirstCreate}
                shouldShowHomeShell={shouldShowHomeShell(currentScreen, previousScreen, isFirstCreate)}
                shouldShowWorkspaceShell={shouldShowWorkspaceShell(currentScreen, previousScreen)}
                onCreateProject={() => {
                  setCreateKey(k => k + 1);
                  setCurrentScreen('create');
                }}
                onImportProject={() => setShowImportModal(true)}
                onMyProjects={() => setCurrentScreen('allProjects')}
                onSettings={() => setCurrentScreen('settings')}
                onOpenPlans={() => setCurrentScreen('plans')}
                onOpenProject={handleOpenProject}
                onCreateBack={() => {
                  if (isFirstCreate) {
                    setCurrentScreen('firstProjectChoice');
                  } else {
                    setCurrentScreen('home');
                  }
                }}
                onCreateOpenPlans={() => setCurrentScreen('plans')}
                onCreateComplete={async (workstation) => {
                  const userId = useAuthStore.getState().user?.uid;
                  if (userId) {
                    workstationService.saveProjectWithId(
                      workstation.projectId || workstation.id,
                      workstation.name,
                      userId,
                      workstation.technology || workstation.language,
                    ).catch((e: any) => console.warn('[App] Failed to save project to Firebase:', e.message));
                  }

                  finalizeFirstProjectSetup();
                  setWorkstation(workstation);
                  useTabStore.getState().clearTabs();

                  if (workstation.files && workstation.files.length > 0) {
                    const filePaths = workstation.files.map((f: any) =>
                      typeof f === 'string' ? f : f.path
                    );
                    useFileCacheStore.getState().setFiles(
                      workstation.projectId || workstation.id,
                      filePaths
                    );
                  }
                  setCurrentScreen('terminal');

                  setTimeout(() => {
                    const { activeTabId, tabs } = useTabStore.getState();
                    const currentTab = tabs.find(t => t.id === activeTabId);

                    if (currentTab) {
                      clearTerminalItems(currentTab.id);
                      addTerminalItemToStore(currentTab.id, {
                        id: `welcome-${Date.now()}`,
                        type: 'system',
                        content: `__PROJECT_CREATED__${JSON.stringify({ name: workstation.name, language: workstation.language || 'html' })}`,
                        timestamp: new Date(),
                      });
                    }
                  }, 100);
                }}
                onExitWorkspace={() => setCurrentScreen('home')}
                onCloseAllProjects={() => setCurrentScreen('home')}
                onCloseSettings={() => setCurrentScreen(resolveOverlayCloseScreen<Screen>(previousScreen as Screen | null | undefined, 'home'))}
                onClosePlans={() => setCurrentScreen(resolveOverlayCloseScreen<Screen>(previousScreen as Screen | null | undefined, 'home'))}
              />
            </ErrorBoundary>
          </NetworkConfigProvider>
        </View>

        <ImportGitHubModal
          visible={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={(url, branch) => handleImportRepo(url, undefined, undefined, branch)}
          isLoading={isImporting}
        />
        <GitHubAuthModal
          visible={showAuthModal}
          onClose={() => {
            setShowAuthModal(false);
            setPendingRepoUrl('');
          }}
          onAuthenticated={(token) => {
            setShowAuthModal(false);
            if (pendingRepoUrl) {
              handleImportRepo(pendingRepoUrl, token);
              setPendingRepoUrl('');
            }
          }}
        />
        <LoadingModal
          visible={!!loadingMessage}
          message={loadingMessage}
        />
        <GitAuthPopup />
        <OfflineOverlay />
        <InAppToast />

        {/* Limit reached modal (clone/project/storage) */}
        <Modal visible={!!limitModal} transparent animationType="fade" onRequestClose={() => setLimitModal(null)}>
          <View style={limitStyles.overlay}>
            <View style={limitStyles.card}>
              <View style={limitStyles.iconWrap}>
                <Ionicons name="lock-closed" size={28} color="#A78BFA" />
              </View>
              <Text style={limitStyles.title}>{i18n.t('projects:limit.reached')}</Text>
              <Text style={limitStyles.message}>{limitModal?.message}</Text>

              <View style={limitStyles.features}>
                <View style={limitStyles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#A78BFA" />
                  <Text style={limitStyles.featureText}>10 progetti + 5 clonati</Text>
                </View>
                <View style={limitStyles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#A78BFA" />
                  <Text style={limitStyles.featureText}>7x budget AI</Text>
                </View>
                <View style={limitStyles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#A78BFA" />
                  <Text style={limitStyles.featureText}>Modelli premium</Text>
                </View>
              </View>

              <TouchableOpacity
                style={limitStyles.upgradeBtn}
                activeOpacity={0.85}
                onPress={() => { setLimitModal(null); setCurrentScreen('plans'); }}
              >
                <LinearGradient
                  colors={['#7C3AED', '#5B21B6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={limitStyles.upgradeBtnGrad}
                >
                  <Ionicons name="rocket" size={16} color="#fff" />
                  <Text style={limitStyles.upgradeBtnText}>{i18n.t('projects:limit.upgradeCta')}</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={limitStyles.dismissBtn} onPress={() => setLimitModal(null)}>
                <Text style={limitStyles.dismissBtnText}>{i18n.t('projects:limit.notNow')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  </I18nextProvider>
  );
}

const limitStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1a1a1a',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  features: {
    width: '100%',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.12)',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  upgradeBtn: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
  },
  upgradeBtnGrad: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  upgradeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  dismissBtn: {
    paddingVertical: 10,
  },
  dismissBtnText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
});
