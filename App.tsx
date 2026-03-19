import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Alert, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SplashScreen } from './src/features/splash/SplashScreen';
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
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { OnboardingFlowScreen } from './src/features/onboarding/OnboardingFlowScreen';
import { FirstProjectChoiceScreen } from './src/features/onboarding/FirstProjectChoiceScreen';
import { ImportGitHubModal } from './src/features/terminal/components/ImportGitHubModal';
import { GitHubAuthModal } from './src/features/terminal/components/GitHubAuthModal';
import { LoadingModal } from './src/shared/components/molecules/LoadingModal';
import { GitAuthPopup } from './src/features/terminal/components/GitAuthPopup';
import { ErrorBoundary } from './src/shared/components/ErrorBoundary';
import { OfflineOverlay } from './src/shared/components/OfflineOverlay';
import { InAppToast } from './src/shared/components/InAppToast';
import { workstationService } from './src/core/workstation/workstationService-firebase';
import { githubTokenService } from './src/core/github/githubTokenService';
import { gitAccountService } from './src/core/git/gitAccountService';
import { requestGitAuth } from './src/core/github/gitAuthStore';
import { useTerminalStore } from './src/core/terminal/terminalStore';
import { useTabStore } from './src/core/tabs/tabStore';
import { useAuthStore, consumePendingNewUser } from './src/core/auth/authStore';
import { AuthScreen } from './src/features/auth/AuthScreen';
import ChatPage from './src/pages/Chat/ChatPage';
import { VSCodeSidebar } from './src/features/terminal/components/VSCodeSidebar';
import { FileViewer } from './src/features/terminal/components/FileViewer';
import { NetworkConfigProvider } from './src/providers/NetworkConfigProvider';
import { migrateGitAccounts } from './src/core/migrations/migrateGitAccounts';
import { config } from './src/config/config';
import { useCloneStatusStore } from './src/core/clone/cloneStatusStore';
import { liveActivityService } from './src/core/services/liveActivityService';
import { useFileCacheStore } from './src/core/cache/fileCacheStore';
import { useBackendLogs } from './src/hooks/api/useBackendLogs';
import { useFileSync } from './src/hooks/business/useFileSync';
import { useNavigationStore } from './src/core/navigation/navigationStore';
import { tracciaSchermata, tracciaEntrataNelProgetto } from './src/core/services/analyticsService';
import { useUIStore } from './src/core/terminal/uiStore';
import { getAuthToken } from './src/core/api/getAuthToken';
import * as Notifications from 'expo-notifications';
import { useOTAUpdates } from './src/hooks/app/useOTAUpdates';
import { useConsentStore } from './src/core/services/consentService';
import { ConsentBanner } from './src/core/components/ConsentBanner';

// Helper to parse Git URL from any provider
type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'gitea' | 'unknown';
interface ParsedGitUrl {
  provider: GitProvider;
  owner: string;
  repo: string;
  fullName: string;
}

const parseGitUrl = (url: string): ParsedGitUrl => {
  const lowerUrl = url.toLowerCase();
  let provider: GitProvider = 'unknown';
  let owner = 'unknown';
  let repo = url.split('/').pop()?.replace('.git', '') || 'repository';

  // Detect provider and extract owner/repo
  if (lowerUrl.includes('github.com')) {
    provider = 'github';
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (match) { owner = match[1]; repo = match[2].replace('.git', ''); }
  } else if (lowerUrl.includes('gitlab.com') || lowerUrl.includes('gitlab.')) {
    provider = 'gitlab';
    const match = url.match(/gitlab[^\/]*\/([^\/]+)\/([^\/\?#]+)/);
    if (match) { owner = match[1]; repo = match[2].replace('.git', ''); }
  } else if (lowerUrl.includes('bitbucket.org') || lowerUrl.includes('bitbucket.')) {
    provider = 'bitbucket';
    const match = url.match(/bitbucket[^\/]*\/([^\/]+)\/([^\/\?#]+)/);
    if (match) { owner = match[1]; repo = match[2].replace('.git', ''); }
  } else if (lowerUrl.endsWith('.git') || lowerUrl.includes('/git/')) {
    provider = 'gitea'; // Generic self-hosted
    const match = url.match(/\/([^\/]+)\/([^\/\?#]+?)(?:\.git)?$/);
    if (match) { owner = match[1]; repo = match[2]; }
  }

  return { provider, owner, repo, fullName: `${owner}/${repo}` };
};

// Check repo accessibility for any provider
const checkRepoAccess = async (
  url: string,
  token: string | null,
  parsed: ParsedGitUrl
): Promise<{ accessible: boolean; status: number }> => {
  try {
    let apiUrl: string;
    let headers: Record<string, string> = {};

    switch (parsed.provider) {
      case 'github':
        apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
        headers['Accept'] = 'application/vnd.github.v3+json';
        if (token) headers['Authorization'] = `token ${token}`;
        break;
      case 'gitlab':
        apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(parsed.fullName)}`;
        if (token) headers['PRIVATE-TOKEN'] = token;
        break;
      case 'bitbucket':
        apiUrl = `https://api.bitbucket.org/2.0/repositories/${parsed.owner}/${parsed.repo}`;
        if (token) headers['Authorization'] = `Basic ${btoa(token)}`;
        break;
      default:
        // For unknown providers, skip API check
        return { accessible: true, status: 200 };
    }

    const response = await fetch(apiUrl, { headers });
    return {
      accessible: response.status >= 200 && response.status < 400,
      status: response.status
    };
  } catch (e) {
    console.warn('📥 [checkRepoAccess] Error:', e);
    return { accessible: true, status: 200 }; // Allow clone attempt on network errors
  }
};

type Screen = 'splash' | 'auth' | 'consent' | 'onboarding' | 'onboardingFlow' | 'firstProjectChoice' | 'home' | 'create' | 'terminal' | 'allProjects' | 'settings' | 'plans';


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

export default function App() {
  const [currentScreen, _setCurrentScreen] = useState<Screen>('splash');
  const setCurrentScreen = (screen: Screen | ((prev: Screen) => Screen)) => {
    _setCurrentScreen(prev => {
      const next = typeof screen === 'function' ? screen(prev) : screen;
      if (next !== prev && next !== 'splash') {
        // Map internal screen names to Italian labels for analytics
        const screenLabels: Record<string, string> = {
          auth: 'Login', home: 'Home',
          allProjects: 'Tutti i Progetti',
          settings: 'Impostazioni', plans: 'Piani',
          firstProjectChoice: 'Scelta Primo Progetto',
          // onboarding/onboardingFlow: tracked by OnboardingFlowScreen with specific step names
          // create: tracked by CreateProjectScreen with specific step names (Idea/Linguaggio/Nome)
        };
        // Skip screens that self-track (onboarding steps track themselves)
        if (!screenLabels[next]) return next;
        tracciaSchermata(screenLabels[next] || next);
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
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [limitModal, setLimitModal] = useState<{ message: string } | null>(null);
  const [pendingFirstProjectImportFromScreen, setPendingFirstProjectImportFromScreen] = useState<{
    previousWorkstationId: string | null;
  } | null>(null);

  const { addWorkstation, setWorkstation, clearGlobalTerminalLog, globalTerminalLog, currentWorkstation } = useTerminalStore();
  const { addTerminalItem: addTerminalItemToStore, clearTerminalItems, updateTerminalItemsByType } = useTabStore();
  const { user, isInitialized, isNewUser, initialize } = useAuthStore();
  const consent = useConsentStore((state) => state.consent);
  const consentLoaded = useConsentStore((state) => state.hasLoaded);

  // Stream backend logs to terminal (always enabled when logged in)
  useBackendLogs({ enabled: isInitialized && !!user });

  // Global file synchronization via WebSocket
  useFileSync();

  // OTA updates + backend version check
  const { forceNativeUpdate, storeUrl } = useOTAUpdates();

  // Track projects currently being cloned to prevent duplicates
  const cloningProjects = useRef<Set<string>>(new Set());

  // Track import in progress to prevent double calls
  const importInProgress = useRef(false);

  const finalizeFirstProjectSetup = () => {
    if (!isFirstCreate) return;

    const userId = useAuthStore.getState().user?.uid;
    if (userId) {
      useAuthStore.setState((state) => ({
        user: state.user ? { ...state.user, hasCreatedFirstProject: true } : state.user,
      }));

      workstationService.markFirstProjectCreated(userId)
        .catch((e: any) => console.warn('[App] Failed to mark first project:', e.message));
    }

    setOnboardingDraft({ experienceLevel: null, referralSource: null });
    setOnboardingInitialStep('welcome');
    setIsFirstCreate(false);
  };

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

  // Navigate after login: new users → onboarding flow, free users → plans, paid → home
  useEffect(() => {
    if (!isInitialized || !user || !consentLoaded) return;

    // Check module-level flag (immune to React batching / Zustand race conditions)
    const pendingNew = consumePendingNewUser();
    const shouldOnboard =
      isNewUser ||
      pendingNew ||
      (user.onboardingCompleted === false && !user.hasCreatedFirstProject);
    const shouldResumeFirstCreate = user.onboardingCompleted === true && user.hasCreatedFirstProject === false;
    const shouldRequestExistingUserConsent = !shouldOnboard && consent === null;

    // New users MUST see onboarding, regardless of current screen
    if (shouldOnboard && currentScreen !== 'onboardingFlow' && currentScreen !== 'create') {
      useAuthStore.setState({ isNewUser: false });
      setIsFirstCreate(true);
      setOnboardingDraft({ experienceLevel: null, referralSource: null });
      setCurrentScreen('onboardingFlow');
      return;
    }

    if (
      shouldRequestExistingUserConsent &&
      currentScreen !== 'consent' &&
      currentScreen !== 'onboardingFlow'
    ) {
      setCurrentScreen('consent');
      return;
    }

    // User finished onboarding but never completed the first project creation flow.
    if (
      shouldResumeFirstCreate &&
      currentScreen !== 'create' &&
      currentScreen !== 'firstProjectChoice' &&
      currentScreen !== 'consent' &&
      currentScreen !== 'terminal' &&
      currentScreen !== 'onboardingFlow'
    ) {
      setIsFirstCreate(true);
      setOnboardingInitialStep('referral');
      setCurrentScreen('firstProjectChoice');
      return;
    }

    // Post-auth navigation (only from auth screen)
    if (currentScreen === 'auth') {
      const plan = user.plan || 'free';
      if (shouldRequestExistingUserConsent) {
        setCurrentScreen('consent');
      } else if (plan === 'free') {
        setCurrentScreen('onboarding');
      } else {
        setCurrentScreen('home');
      }
    }
  }, [user, isInitialized, currentScreen, isNewUser, consent, consentLoaded]);

  // Listen to navigation store for cross-component navigation
  const pendingNavigation = useNavigationStore((state) => state.pendingNavigation);
  useEffect(() => {
    if (pendingNavigation) {
      // Don't override onboarding screens — new users must complete the flow
      if (currentScreen === 'onboardingFlow' || currentScreen === 'onboarding' || currentScreen === 'consent' || currentScreen === 'firstProjectChoice') {
        useNavigationStore.getState().clearPendingNavigation();
        return;
      }
      setCurrentScreen(pendingNavigation);
      useNavigationStore.getState().clearPendingNavigation();
    }
  }, [pendingNavigation, currentScreen]);

  useEffect(() => {
    if (!pendingFirstProjectImportFromScreen) return;

    if (currentScreen === 'terminal') {
      setPendingFirstProjectImportFromScreen(null);
      return;
    }

    if (currentScreen !== 'firstProjectChoice') return;

    const previousWorkstationId = pendingFirstProjectImportFromScreen.previousWorkstationId;
    const nextWorkstationId = currentWorkstation?.id || null;

    if (!nextWorkstationId || nextWorkstationId === previousWorkstationId) return;

    finalizeFirstProjectSetup();
    setPendingFirstProjectImportFromScreen(null);
    setCurrentScreen('terminal');
  }, [pendingFirstProjectImportFromScreen, currentWorkstation?.id, currentScreen]);

  // Automatically track previous screen whenever currentScreen changes.
  // We skip screens like 'settings' and 'plans' because we want to return FROM them to the previous workspace.
  useEffect(() => {
    if (currentScreen !== 'settings' && currentScreen !== 'plans' && currentScreen !== 'splash' && currentScreen !== 'auth' && currentScreen !== 'onboardingFlow' && currentScreen !== 'consent' && currentScreen !== 'firstProjectChoice') {
      useNavigationStore.setState({ previousScreen: currentScreen });
    }
  }, [currentScreen]);

  // Helper function to check auth BEFORE opening project
  // Returns token if auth successful, empty string if no auth needed (public repo), null if cancelled
  const checkAuthBeforeOpen = async (
    githubUrl: string,
    workstationName: string,
    linkedGithubAccount?: string
  ): Promise<string | null> => {
    const userId = useTerminalStore.getState().userId || 'anonymous';
    const match = githubUrl.match(/github\.com\/([^\/]+)\//);
    const owner = match ? match[1] : 'unknown';

    // Check if we have accounts - use getAllAccounts to include Firebase accounts (cross-device sync)
    const accounts = await gitAccountService.getAllAccounts(userId);

    // If NO accounts at all, DON'T block - let the clone proceed without auth
    // The backend will determine if auth is needed (public vs private repo)
    if (accounts.length === 0) {
      return ''; // Empty string = no token, but proceed anyway
    }

    // Try to get token for this repository using gitAccountService
    const tokenResult = await gitAccountService.getTokenForRepo(userId, githubUrl);
    let token = tokenResult?.token || null;

    // If we have accounts but no token for this specific repo, still allow proceeding
    // The clone process will request auth if needed (for private repos)
    if (!token) {
      return ''; // Empty string = proceed without pre-auth
    }

    return token;
  };

  // Helper function to clone repository with auth popup if needed
  const cloneRepositoryWithAuth = async (
    projectId: string,
    githubUrl: string,
    tabId: string,
    workstationName: string,
    linkedGithubAccount?: string, // Account GitHub già collegato al progetto
    preAuthToken?: string | null // Token already obtained from checkAuthBeforeOpen
  ) => {
    // Prevent duplicate clones for the same project
    if (cloningProjects.current.has(projectId)) {
      return;
    }

    // Mark as cloning
    cloningProjects.current.add(projectId);
    const userId = useTerminalStore.getState().userId || 'anonymous';
    const match = githubUrl.match(/github\.com\/([^\/]+)\//);
    const owner = match ? match[1] : 'unknown';
    const repoName = githubUrl.split('/').pop()?.replace('.git', '') || workstationName;

    // Use pre-authenticated token if provided, or try to get one from saved accounts
    let token = preAuthToken || null;
    let usedAccountUsername = linkedGithubAccount || owner;

    // If no pre-auth token, check if we have one saved (but DON'T show popup yet)
    if (!token) {
      const tokenResult = await gitAccountService.getTokenForRepo(userId, githubUrl);
      token = tokenResult?.token || null;
    }

    // If we have a token, save the account to the project
    if (token) {
      try {
        const validation = await githubTokenService.validateToken(token);
        if (validation.valid && validation.username) {
          usedAccountUsername = validation.username;
          await workstationService.updateProjectGitHubAccount(projectId, usedAccountUsername);
        }
      } catch (e) {
        // Could not validate token
      }
    }

    // DON'T show auth popup here - try to clone first
    // The backend will tell us if auth is needed (401 for private repos)
    addTerminalItemToStore(tabId, {
      id: `loading-${Date.now()}`,
      type: 'loading',
      content: 'Cloning repository to workstation',
      timestamp: new Date(),
    });

    try {
      await workstationService.getWorkstationFiles(projectId, githubUrl, token || undefined);

      // Mark project as cloned in Firebase
      await workstationService.markProjectAsCloned(projectId);

      updateTerminalItemsByType(tabId, 'loading', {
        type: 'system',
        content: 'Cloning repository to workstation'
      });

      addTerminalItemToStore(tabId, {
        id: `success-${Date.now()}`,
        type: 'output',
        content: `✓ Repository cloned successfully: ${repoName}`,
        timestamp: new Date(),
      });

      // End Live Activity with success + notification (if active from handleImportRepo)
      if (liveActivityService.isActivityActive()) {
        liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
        liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
      }
    } catch (err: any) {
      updateTerminalItemsByType(tabId, 'loading', {
        type: 'system',
        content: 'Cloning repository to workstation'
      });

      // Check if it's an auth error - silently show popup (NO error message)
      const isAuthError = err.requiresAuth || err.response?.status === 401;
      if (isAuthError) {
        try {
          const newToken = await requestGitAuth(
            `Repository privato. Autenticazione richiesta per "${repoName}"`,
            { repositoryUrl: githubUrl, owner }
          );
          addTerminalItemToStore(tabId, {
            id: `retry-${Date.now()}`,
            type: 'loading',
            content: 'Ritentando con nuove credenziali...',
            timestamp: new Date(),
          });

          // Retry clone with new token
          await workstationService.getWorkstationFiles(projectId, githubUrl, newToken);

          // Mark project as cloned
          await workstationService.markProjectAsCloned(projectId);

          updateTerminalItemsByType(tabId, 'loading', {
            type: 'system',
            content: 'Ritentando con nuove credenziali...'
          });

          addTerminalItemToStore(tabId, {
            id: `success-${Date.now()}`,
            type: 'output',
            content: `✓ Repository cloned successfully: ${repoName}`,
            timestamp: new Date(),
          });

          // End Live Activity with success + notification
          if (liveActivityService.isActivityActive()) {
            liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
            liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
          }
        } catch (authErr: any) {
          liveActivityService.endPreviewActivity().catch(() => {});
          // Only show error if user didn't just cancel
          if (authErr.message !== 'Authentication cancelled') {
            addTerminalItemToStore(tabId, {
              id: `error-${Date.now()}`,
              type: 'error',
              content: `✗ ${authErr.message || 'Autenticazione fallita'}`,
              timestamp: new Date(),
            });
          } else {
            // User cancelled - just show a system message, not an error
            addTerminalItemToStore(tabId, {
              id: `cancelled-${Date.now()}`,
              type: 'system',
              content: 'Autenticazione annullata',
              timestamp: new Date(),
            });
          }
        }
      } else {
        addTerminalItemToStore(tabId, {
          id: `error-${Date.now()}`,
          type: 'error',
          content: `✗ ${err.message || 'Failed to clone repository'}`,
          timestamp: new Date(),
        });
      }
    } finally {
      // Remove from cloning set when done (success or failure)
      cloningProjects.current.delete(projectId);
    }
  };

  const handleDeepLink = (url: string) => {
    const { path } = Linking.parse(url);
    if (path) {
      // Validate it's a proper GitHub URL
      const githubMatch = path.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
      if (githubMatch) {
        const githubUrl = `https://github.com/${githubMatch[1]}/${githubMatch[2]}`;
        handleImportRepo(githubUrl);
      }
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

  const handleImportRepo = async (url: string, newToken?: string, forceCopy?: boolean, branch?: string, skipLimitCheck?: boolean) => {
    // Guard against double calls
    if (importInProgress.current) {
      return;
    }

    importInProgress.current = true;

    const importModalWasOpen = showImportModal;
    if (importModalWasOpen) {
      setShowImportModal(false);
      // iOS cannot reliably stack the loading/auth modals on top of the import modal.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Set global loading message
    setLoadingMessage('Cloning repository...');

    try {
      setIsImporting(true);
      const userId = useTerminalStore.getState().userId || 'anonymous';

      // Parse URL for any Git provider
      const parsed = parseGitUrl(url);
      const { owner, repo: repoName, provider } = parsed;

      // Start Live Activity (Dynamic Island)
      liveActivityService.startPreviewActivity(repoName, {
        remainingSeconds: 90,
        currentStep: 'Clonazione repository...',
        progress: 0,
      }, 'clone').catch(() => {});


      // Check if a project with this repo already exists (unless forceCopy is true)
      if (!forceCopy) {
        const existingProject = await workstationService.checkExistingProject(url, userId);
        if (existingProject) {

          // If project exists but is NOT cloned, it's an incomplete import (e.g., auth failed)
          // Continue with this project instead of showing dialog
          if (!existingProject.cloned) {
            // Don't create a new project, use the existing one
            const project = existingProject;

            let githubToken = newToken;
            if (!githubToken) {
              const tokenResult = await gitAccountService.getTokenForRepo(userId, url);
              githubToken = tokenResult?.token || null;
            }

            const wsResult = await workstationService.createWorkstationForProject(project, githubToken, branch);

            const workstation = {
              id: wsResult.workstationId || project.id,
              projectId: project.id,
              name: project.name,
              language: 'Unknown',
              status: wsResult.status as any,
              createdAt: project.createdAt,
              files: [],
              githubUrl: project.repositoryUrl,
              folderId: null,
            };

            addWorkstation(workstation);
            setWorkstation(workstation);
            setShowImportModal(false);
            setIsImporting(false);
            importInProgress.current = false;
            setLoadingMessage(''); // Clear loading
            finalizeFirstProjectSetup();

            // Clear state and navigate
            const { activeTabId: currentActiveTabId } = useTabStore.getState();
            if (currentActiveTabId) {
              clearTerminalItems(currentActiveTabId);
            }
            clearGlobalTerminalLog();
            setCurrentScreen('terminal');

            // Clone repository
            setTimeout(async () => {
              const { activeTabId, tabs } = useTabStore.getState();
              const currentTab = tabs.find(t => t.id === activeTabId);
              const repoName = url.split('/').pop()?.replace('.git', '') || 'repository';

              if (currentTab) {
                addTerminalItemToStore(currentTab.id, {
                  id: `loading-${Date.now()}`,
                  type: 'loading',
                  content: 'Cloning repository to workstation',
                  timestamp: new Date(),
                });

                try {
                  await workstationService.getWorkstationFiles(workstation.projectId, url, githubToken || undefined);
                  await workstationService.markProjectAsCloned(workstation.projectId);

                  updateTerminalItemsByType(currentTab.id, 'loading', {
                    type: 'system',
                    content: 'Cloning repository to workstation'
                  });

                  addTerminalItemToStore(currentTab.id, {
                    id: `success-${Date.now()}`,
                    type: 'output',
                    content: `✓ Repository cloned successfully: ${repoName}`,
                    timestamp: new Date(),
                  });

                  // End Live Activity with success + notification
                  if (liveActivityService.isActivityActive()) {
                    liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
                  }
                  liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
                } catch (err: any) {
                  updateTerminalItemsByType(currentTab.id, 'loading', {
                    type: 'system',
                    content: 'Cloning repository to workstation'
                  });

                  const isAuthError = err.requiresAuth || err.response?.status === 401;
                  if (isAuthError) {
                    try {
                      const match = url.match(/github\.com\/([^\/]+)\//);
                      const owner = match ? match[1] : 'unknown';
                      const token = await requestGitAuth(
                        `Repository privato. Autenticazione richiesta per "${repoName}"`,
                        { repositoryUrl: url, owner }
                      );

                      addTerminalItemToStore(currentTab.id, {
                        id: `retry-loading-${Date.now()}`,
                        type: 'loading',
                        content: 'Ritentando con nuove credenziali...',
                        timestamp: new Date(),
                      });

                      await workstationService.getWorkstationFiles(workstation.projectId, url, token);
                      await workstationService.markProjectAsCloned(workstation.projectId);

                      updateTerminalItemsByType(currentTab.id, 'loading', {
                        type: 'system',
                        content: 'Ritentando con nuove credenziali...'
                      });

                      addTerminalItemToStore(currentTab.id, {
                        id: `success-${Date.now()}`,
                        type: 'output',
                        content: `✓ Repository cloned successfully: ${repoName}`,
                        timestamp: new Date(),
                      });

                      // End Live Activity with success + notification
                      if (liveActivityService.isActivityActive()) {
                        liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
                      }
                      liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
                    } catch (authErr: any) {
                      liveActivityService.endPreviewActivity().catch(() => {});
                      if (authErr.message !== 'Authentication cancelled') {
                        addTerminalItemToStore(currentTab.id, {
                          id: `error-${Date.now()}`,
                          type: 'error',
                          content: `✗ ${authErr.message || 'Autenticazione fallita'}`,
                          timestamp: new Date(),
                        });
                      } else {
                        addTerminalItemToStore(currentTab.id, {
                          id: `cancelled-${Date.now()}`,
                          type: 'system',
                          content: 'Autenticazione annullata',
                          timestamp: new Date(),
                        });
                      }
                    }
                  } else {
                    addTerminalItemToStore(currentTab.id, {
                      id: `error-${Date.now()}`,
                      type: 'error',
                      content: `✗ ${err.message || 'Failed to clone repository'}`,
                      timestamp: new Date(),
                    });
                  }
                }
              }
            }, 100);

            return;
          }

          // Project exists AND is cloned - show dialog
          setIsImporting(false);
          importInProgress.current = false;
          setShowImportModal(false);
          setLoadingMessage(''); // Clear loading

          // Ask user what they want to do
          Alert.alert(
            'Repository già importata',
            `Hai già un progetto "${existingProject.name}" per questa repository.`,
            [
              {
                text: 'Annulla',
                style: 'cancel',
              },
              {
                text: 'Apri esistente',
                onPress: () => {
                  // Open the existing project
                  const workstation = {
                    id: `ws-${existingProject.id.toLowerCase()}`,
                    projectId: existingProject.id,
                    name: existingProject.name,
                    language: 'Unknown',
                    status: 'running' as const,
                    createdAt: existingProject.createdAt,
                    files: [],
                    githubUrl: existingProject.repositoryUrl,
                    repositoryUrl: existingProject.repositoryUrl,
                    folderId: null,
                    cloned: existingProject.cloned || false,
                  };
                  finalizeFirstProjectSetup();
                  setWorkstation(workstation);
                  setCurrentScreen('terminal');
                },
              },
              {
                text: 'Crea copia',
                onPress: () => {
                  // Re-call with forceCopy=true
                  handleImportRepo(url, newToken, true, branch);
                },
              },
            ]
          );
          return;
        }
      }

      let githubToken = newToken;

      if (!githubToken) {
        // Check if we have accounts - use getAllAccounts to include Firebase accounts (cross-device sync)
        const accounts = await gitAccountService.getAllAccounts(userId);

        // If NO accounts, try without auth first (works for public repos)
        // Auth will be requested later if clone fails with 401
        if (accounts.length === 0) {
          githubToken = null; // Will try clone without token first
        } else {
          // Have accounts - check if we have token for this repo
          const tokenResult = await gitAccountService.getTokenForRepo(userId, url);
          const existingToken = tokenResult?.token || null;

          // If only one account and has token, use it silently
          if (accounts.length === 1 && existingToken) {
            githubToken = existingToken;
          } else {
            // Multiple accounts or no token - let clone try without auth first
            // If it's a private repo, auth will be requested on 401
            githubToken = existingToken; // Use existing if available, null otherwise
          }
        }
      } else {
        // Save token to both services to keep them in sync
        await githubTokenService.saveToken(owner, githubToken, userId);
        try {
          await gitAccountService.saveAccount('github', githubToken, userId);
        } catch (err) {
          console.warn('⚠️ Could not sync token to gitAccountService:', err);
        }
      }

      // Verify repo accessibility BEFORE creating the project
      // This prevents creating empty projects for private repos without auth
      try {
        const { accessible, status } = await checkRepoAccess(url, githubToken, parsed);

        if (!accessible) {
          // Repo is private or not accessible with current token

          // Close the import modal FIRST to avoid iOS modal conflict
          setShowImportModal(false);
          // Wait for modal dismiss animation to complete
          await new Promise(resolve => setTimeout(resolve, 500));

          // Update Live Activity
          liveActivityService.updatePreviewActivity({
            remainingSeconds: 60,
            currentStep: 'Autenticazione richiesta...',
            progress: 0.2,
          }).catch(() => {});

          try {
            const providerName = provider === 'github' ? 'GitHub' : provider === 'gitlab' ? 'GitLab' : provider === 'bitbucket' ? 'Bitbucket' : 'Git';
            const authToken = await requestGitAuth(
              `Repository privato o non accessibile.\nCollega un account ${providerName} per clonare "${repoName}".`,
              { repositoryUrl: url, owner }
            );

            if (authToken) {
              githubToken = authToken;

              // Re-verify with new token
              const recheck = await checkRepoAccess(url, authToken, parsed);

              if (!recheck.accessible) {
                throw new Error(`L'account collegato non ha accesso a questa repository.`);
              }
            }
          } catch (authErr: any) {
            liveActivityService.endPreviewActivity().catch(() => {});
            if (authErr.message === 'Authentication cancelled') {
              throw new Error('__CANCELLED__');
            }
            throw authErr;
          }
        }
      } catch (accessErr: any) {
        if (accessErr.message === '__CANCELLED__') {
          // User cancelled — silent return
          setIsImporting(false);
          setPendingFirstProjectImportFromScreen(null);
          importInProgress.current = false;
          setLoadingMessage('');
          liveActivityService.endPreviewActivity().catch(() => {});
          return;
        }
        if (accessErr.message?.includes('non ha accesso')) {
          Alert.alert('Accesso negato', accessErr.message);
          setIsImporting(false);
          setPendingFirstProjectImportFromScreen(null);
          importInProgress.current = false;
          setLoadingMessage('');
          liveActivityService.endPreviewActivity().catch(() => {});
          return;
        }
        // Network errors etc. — let clone try anyway
        console.warn('📥 [handleImportRepo] Repo access check failed (network?):', accessErr.message);
      }

      // Pre-check clone limits using lifetime counters (never reset on delete)
      // Skip during onboarding first project — user must always be able to create their first project
      const userPlan = useAuthStore.getState().user?.plan || 'free';
      const planCloneLimits: Record<string, number> = { free: 1, go: 5, pro: 25, team: 100 };
      const maxCloned = planCloneLimits[userPlan] || 1;
      const lifetimeCounts = await workstationService.getLifetimeCreationCounts(userId);
      if (!skipLimitCheck && lifetimeCounts.cloned >= maxCloned) {
        importInProgress.current = false;
        setIsImporting(false);
        setPendingFirstProjectImportFromScreen(null);
        setLoadingMessage('');
        setShowImportModal(false);
        setTimeout(() => {
          setLimitModal({ message: i18n.t('projects:limit.cloneLimitReached', { max: maxCloned, plan: userPlan }) });
        }, 400);
        return;
      }

      // If creating a copy, count existing copies and use next number
      let copyNumber: number | undefined;
      if (forceCopy) {
        const existingCount = await workstationService.countExistingCopies(url, userId);
        copyNumber = existingCount; // First copy will be "copia 1" (when existingCount=1)
      }

      const project = await workstationService.saveGitProject(url, userId, copyNumber);
      let wsResult;
      try {
        wsResult = await workstationService.createWorkstationForProject(project, githubToken, branch);
      } catch (wsError: any) {
        // Clone failed — clean up the project doc created above
        await workstationService.deleteProject(project.id).catch(() => {});
        throw wsError;
      }

      const workstation = {
        id: wsResult.workstationId || project.id,
        projectId: project.id,
        name: project.name,
        language: 'Unknown',
        status: wsResult.status as any,
        createdAt: project.createdAt,
        files: [],
        githubUrl: project.repositoryUrl,
        folderId: null,
      };

      // SEED CACHE: If files returned, cache them immediately
      if (wsResult.files && wsResult.files.length > 0) {
        // For file explorer, we store simpler paths - ensure they are strings
        const filePaths = wsResult.files.map((f: any) => typeof f === 'string' ? f : f.path);
        useFileCacheStore.getState().setFiles(project.id, filePaths);
      }

      addWorkstation(workstation);
      setWorkstation(workstation);
      setShowImportModal(false);
      setIsImporting(false);
      importInProgress.current = false;
      finalizeFirstProjectSetup();

      // Stop loading only when ready to navigate
      setLoadingMessage('');

      const { activeTabId } = useTabStore.getState();

      // Clear the current tab BEFORE navigating to avoid showing old items
      if (activeTabId) {
        clearTerminalItems(activeTabId);
      }

      // ALSO clear the global terminal log!
      clearGlobalTerminalLog();

      tracciaEntrataNelProgetto(workstation.name || repoName);
      setCurrentScreen('terminal');

      // Add loading message to chat and clone repository
      setTimeout(async () => {
        const { activeTabId: currentActiveTabId, tabs } = useTabStore.getState();

        const currentTab = tabs.find(t => t.id === currentActiveTabId);

        if (currentTab) {

          addTerminalItemToStore(currentTab.id, {
            id: `loading-${Date.now()}`,
            type: 'loading',
            content: 'Cloning repository to workstation',
            timestamp: new Date(),
          });

          try {
            await workstationService.getWorkstationFiles(workstation.projectId, url, githubToken || undefined);

            // Mark project as cloned
            await workstationService.markProjectAsCloned(workstation.projectId);

            updateTerminalItemsByType(currentTab.id, 'loading', {
              type: 'system',
              content: 'Cloning repository to workstation'
            });

            addTerminalItemToStore(currentTab.id, {
              id: `success-${Date.now()}`,
              type: 'output',
              content: `✓ Repository cloned successfully: ${repoName}`,
              timestamp: new Date(),
            });

            // End Live Activity with success + notification
            if (liveActivityService.isActivityActive()) {
              liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
            }
            liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
          } catch (err: any) {
            updateTerminalItemsByType(currentTab.id, 'loading', {
              type: 'system',
              content: 'Cloning repository to workstation'
            });

            // Check if it's an auth error - silently show popup (NO error message)
            const isAuthError = err.requiresAuth || err.response?.status === 401;
            if (isAuthError) {
              // Update Live Activity step
              liveActivityService.updatePreviewActivity({
                remainingSeconds: 60,
                currentStep: 'Autenticazione...',
                progress: 0.3,
              }).catch(() => {});

              try {
                const token = await requestGitAuth(
                  `Repository privato. Autenticazione richiesta per "${repoName}"`,
                  { repositoryUrl: url, owner }
                );

                // Show retry loading message
                addTerminalItemToStore(currentTab.id, {
                  id: `retry-loading-${Date.now()}`,
                  type: 'loading',
                  content: 'Ritentando con nuove credenziali...',
                  timestamp: new Date(),
                });

                // Update Live Activity
                liveActivityService.updatePreviewActivity({
                  remainingSeconds: 45,
                  currentStep: 'Clonazione con credenziali...',
                  progress: 0.5,
                }).catch(() => {});

                // Retry clone with new token
                await workstationService.getWorkstationFiles(workstation.projectId, url, token);

                // Mark project as cloned
                await workstationService.markProjectAsCloned(workstation.projectId);

                // Update loading to system
                updateTerminalItemsByType(currentTab.id, 'loading', {
                  type: 'system',
                  content: 'Ritentando con nuove credenziali...'
                });

                addTerminalItemToStore(currentTab.id, {
                  id: `success-${Date.now()}`,
                  type: 'output',
                  content: `✓ Repository cloned successfully: ${repoName}`,
                  timestamp: new Date(),
                });

                // End Live Activity with success + notification
                if (liveActivityService.isActivityActive()) {
                  liveActivityService.endWithSuccess(repoName, 'Clonato!').catch(() => {});
                }
                liveActivityService.sendNotification('Repository clonato!', `${repoName} e' pronto`, { type: 'clone_complete' }).catch(() => {});
              } catch (authErr: any) {
                liveActivityService.endPreviewActivity().catch(() => {});
                // Only show error if user didn't just cancel
                if (authErr.message !== 'Authentication cancelled') {
                  addTerminalItemToStore(currentTab.id, {
                    id: `error-${Date.now()}`,
                    type: 'error',
                    content: `✗ ${authErr.message || 'Autenticazione fallita'}`,
                    timestamp: new Date(),
                  });
                } else {
                  // User cancelled - just show a system message, not an error
                  addTerminalItemToStore(currentTab.id, {
                    id: `cancelled-${Date.now()}`,
                    type: 'system',
                    content: 'Autenticazione annullata',
                    timestamp: new Date(),
                  });
                }
              }
            } else {
              liveActivityService.endPreviewActivity().catch(() => {});
              // Clone failed — delete the project so it doesn't count toward limits
              await workstationService.deleteProject(workstation.projectId).catch(() => {});
              addTerminalItemToStore(currentTab.id, {
                id: `error-${Date.now()}`,
                type: 'error',
                content: `✗ ${err.message || 'Failed to clone repository'}`,
                timestamp: new Date(),
              });
            }
          }
        }
      }, 100);
    } catch (error: any) {
      liveActivityService.endPreviewActivity().catch(() => {});
      setIsImporting(false);
      setPendingFirstProjectImportFromScreen(null);
      setLoadingMessage(''); // Clear loading on error

      // Handle limit errors (403 with specific error codes)
      const errorCode = error.response?.data?.error;
      const errorMsg = error.response?.data?.message;
      if (error.response?.status === 403 && (errorCode === 'CLONE_LIMIT_EXCEEDED' || errorCode === 'PROJECT_LIMIT_EXCEEDED' || errorCode === 'STORAGE_LIMIT_EXCEEDED')) {
        importInProgress.current = false;
        // Close import modal first — iOS can't present two modals simultaneously
        setShowImportModal(false);
        setTimeout(() => {
          setLimitModal({ message: errorMsg || i18n.t('projects:alerts.cloneLimitMessage', { max: 1 }) });
        }, 400);
        return;
      }

      // If auth error, silently show popup (NO error message, NO console.error)
      const isAuthError = error.requiresAuth || error.response?.status === 401;
      if (!isAuthError) {
        // Only log as error if it's NOT an expected auth error
        console.error('Import error:', error.response?.status, error.message);
      }
      if (isAuthError && !newToken) {
        setShowImportModal(false);
        // Reset flag before retry to allow the new call
        importInProgress.current = false;
        try {
          const token = await requestGitAuth(
            'Repository privato. Autenticazione GitHub richiesta.',
            { repositoryUrl: url, owner: url.match(/github\.com\/([^\/]+)\//)?.[1] }
          );
          // Retry with new token
          handleImportRepo(url, token, forceCopy, branch);
        } catch (err) {
          // User cancelled, do nothing - no error shown
        }
      } else {
        // Reset flag if not retrying
        importInProgress.current = false;
      }
    } finally {
      // Ensure flag is reset even if we forgot somewhere
      // (Note: will be reset before this in retry cases)
      if (importInProgress.current) {
        importInProgress.current = false;
      }
      if (loadingMessage) {
        setLoadingMessage('');
      }
    }
  };

  const handleFirstProjectClone = async (url: string, branch?: string) => {
    const previousWorkstationId = useTerminalStore.getState().currentWorkstation?.id || null;

    await handleImportRepo(url, undefined, undefined, branch, true);

    const nextWorkstation = useTerminalStore.getState().currentWorkstation;
    const nextWorkstationId = nextWorkstation?.id || null;

    if (
      currentScreen === 'firstProjectChoice' &&
      nextWorkstationId &&
      nextWorkstationId !== previousWorkstationId
    ) {
      finalizeFirstProjectSetup();
      setCurrentScreen('terminal');
    }
  };

  // Handle splash screen finish - navigate based on auth state
  const handleSplashFinish = () => {
    if (isInitialized && user && consentLoaded) {
      const pendingNew = consumePendingNewUser();
      const shouldOnboard =
        isNewUser ||
        pendingNew ||
        (user.onboardingCompleted === false && !user.hasCreatedFirstProject);
      const shouldResumeFirstCreate = user.onboardingCompleted === true && user.hasCreatedFirstProject === false;
      const shouldRequestExistingUserConsent = !shouldOnboard && consent === null;
      if (shouldOnboard) {
        useAuthStore.setState({ isNewUser: false });
        setIsFirstCreate(true);
        setOnboardingDraft({ experienceLevel: null, referralSource: null });
        setCurrentScreen('onboardingFlow');
      } else if (shouldRequestExistingUserConsent) {
        setCurrentScreen('consent');
      } else if (shouldResumeFirstCreate) {
        setIsFirstCreate(true);
        setOnboardingInitialStep('referral');
        setCurrentScreen('firstProjectChoice');
      } else {
        const plan = user.plan || 'free';
        if (plan === 'free') {
          setCurrentScreen('onboarding');
        } else {
          setCurrentScreen('home');
        }
      }
    } else {
      // Set to 'auth' — if auth isn't initialized yet, the !isInitialized guard
      // will show a loading spinner (not the auth screen) until ready.
      // Once isInitialized becomes true, the useEffect below routes correctly.
      setCurrentScreen('auth');
    }
  };

  if (currentScreen === 'splash') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0D0816' }}>
        <SafeAreaProvider style={{ backgroundColor: '#0D0816' }}>
          <SplashScreen onFinish={handleSplashFinish} />
          <StatusBar style="light" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // Show seamless dark screen while auth is initializing (must be BEFORE auth check)
  if (!isInitialized || !consentLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0D0816' }}>
        <SafeAreaProvider style={{ backgroundColor: '#0D0816' }}>
          <View style={{ flex: 1, backgroundColor: '#0D0816' }} />
          <StatusBar style="light" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // Force native update — blocks everything until user updates from App Store
  if (forceNativeUpdate) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
        <SafeAreaProvider style={{ backgroundColor: '#0a0a0a' }}>
          <ForceUpdateScreen storeUrl={storeUrl} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  // Show auth screen only when initialized and no user
  if (!user) {
    return (
      <I18nextProvider i18n={i18n}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
          <SafeAreaProvider style={{ backgroundColor: '#000' }}>
            <AuthScreen />

            <StatusBar style="light" />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </I18nextProvider>
    );
  }

  if (currentScreen === 'onboarding') {
    return (
      <I18nextProvider i18n={i18n}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
          <SafeAreaProvider style={{ backgroundColor: '#000' }}>
            <SettingsScreen
              onClose={() => {
                useAuthStore.setState({ isNewUser: false });
                setCurrentScreen('home');
              }}
              initialShowPlans={true}
              initialPlanIndex={1}
            />
            <StatusBar style="light" />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </I18nextProvider>
    );
  }

  if (currentScreen === 'onboardingFlow') {
    return (
      <I18nextProvider i18n={i18n}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
          <SafeAreaProvider style={{ backgroundColor: '#0A0A0F' }}>
            <OnboardingFlowScreen
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
                // Update local state BEFORE navigation so useEffect doesn't redirect back
                useAuthStore.setState(state => ({
                  user: state.user ? { ...state.user, onboardingCompleted: true } : state.user,
                  isNewUser: false,
                }));
                setOnboardingInitialStep('welcome');
                setCurrentScreen('firstProjectChoice');
              }}
            />
            <StatusBar style="light" />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </I18nextProvider>
    );
  }

  if (currentScreen === 'firstProjectChoice') {
    return (
      <I18nextProvider i18n={i18n}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
          <SafeAreaProvider style={{ backgroundColor: '#0A0A0F' }}>
            <View style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
              <FirstProjectChoiceScreen
                onBack={() => {
                  setOnboardingInitialStep('referral');
                  setCurrentScreen('onboardingFlow');
                }}
                onCreate={() => {
                  setCreateKey(k => k + 1);
                  setCurrentScreen('create');
                }}
                onClone={() => setShowImportModal(true)}
              />

              <ImportGitHubModal
                visible={showImportModal}
                onClose={() => {
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
              <StatusBar style="light" />
            </View>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </I18nextProvider>
    );
  }

  if (currentScreen === 'consent') {
    return (
      <I18nextProvider i18n={i18n}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
          <SafeAreaProvider style={{ backgroundColor: '#0A0A0F' }}>
            <ConsentBanner
              mode="screen"
              onResolved={() => {
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
            <StatusBar style="light" />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </I18nextProvider>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <SafeAreaProvider style={{ backgroundColor: '#000' }}>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <NetworkConfigProvider>
              <ErrorBoundary>
              {(currentScreen === 'home' || (currentScreen === 'create' && !isFirstCreate) || (currentScreen === 'settings' && useNavigationStore.getState().previousScreen === 'home')) && (
                <View
                  key="home-screen"
                  style={{ flex: 1 }}
                >
                  <NavigationContainer independent={true}>
                    <ProjectsHomeScreen
                      onCreateProject={() => {
                        setCreateKey(k => k + 1);
                        setCurrentScreen('create');
                      }}
                      onImportProject={() => setShowImportModal(true)}
                      onMyProjects={() => setCurrentScreen('allProjects')}
                      onSettings={() => setCurrentScreen('settings')}
                      onOpenPlans={() => setCurrentScreen('plans')}
                      onOpenProject={async (workstation) => {
                        const githubUrl = workstation.githubUrl || workstation.repositoryUrl;

                        // Check if we're switching to a DIFFERENT project
                        // Only consider it the same project if the workstation ID matches exactly
                        const currentWorkstation = useTerminalStore.getState().currentWorkstation;
                        const isSameProject = currentWorkstation?.id === workstation.id;

                        // NAVIGATE IMMEDIATELY - auth/clone happens in background
                        // Only clear terminal items when switching to a DIFFERENT project
                        if (!isSameProject) {
                          clearGlobalTerminalLog();

                          // Save current project's tabs before switching
                          if (currentWorkstation?.id) {
                            useTabStore.getState().saveProjectTabs(currentWorkstation.id);
                          }

                          // Restore tabs for the new project (or start fresh)
                          useTabStore.getState().restoreProjectTabs(workstation.id);
                        }

                        // INSTANT navigation - no blocking auth check
                        setWorkstation(workstation);
                        setCurrentScreen('terminal');

                        // Background operations (auth check + clone sync)
                        setTimeout(async () => {
                          const { activeTabId, tabs } = useTabStore.getState();
                          const currentTab = tabs.find(t => t.id === activeTabId);
                          const apiToken = await getAuthToken(true);
                          const apiHeaders: Record<string, string> = {
                            'Content-Type': 'application/json',
                            ...(apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {}),
                          };

                          if (currentTab) {
                            if (githubUrl) {
                              // Get auth token in background (non-blocking for UI)
                              let authToken: string | null = null;
                              try {
                                authToken = await checkAuthBeforeOpen(
                                  githubUrl,
                                  workstation.name,
                                  workstation.githubAccountUsername
                                );
                                // If user cancelled auth popup, authToken will be null
                                // We still continue - clone might work for public repos
                              } catch (e) {
                                console.warn('Auth check failed, continuing without token:', e);
                              }

                              // Start clone status tracking
                              const repoName = githubUrl.split('/').pop()?.replace('.git', '') || 'repository';
                              useCloneStatusStore.getState().startClone(workstation.id, repoName);

                              // Trigger clone to ensure files are in Coder workspace
                              fetch(`${config.apiUrl}/fly/clone`, {
                                method: 'POST',
                                headers: apiHeaders,
                                body: JSON.stringify({
                                  workstationId: workstation.id,
                                  repositoryUrl: githubUrl,
                                  githubToken: authToken || null,
                                  userId: useAuthStore.getState().user?.email || 'anonymous',
                                }),
                              }).then(r => r.json()).then(result => {
                                if (result.success) {
                                  useCloneStatusStore.getState().completeClone(workstation.id);
                                  // Clear file cache so it refreshes with new files
                                  useFileCacheStore.getState().clearCache(workstation.id);
                                  // Save project info (for Next.js warnings, etc.)
                                  if (result.projectInfo) {
                                    useTerminalStore.getState().setProjectInfo(result.projectInfo);
                                  } else {
                                  }
                                } else {
                                  console.warn('⚠️ [Clone] Sync issue:', result.error || result.message);
                                  useCloneStatusStore.getState().failClone(workstation.id, result.error || result.message);
                                }
                              }).catch(e => {
                                console.warn('Clone sync error:', e.message);
                                useCloneStatusStore.getState().failClone(workstation.id, e.message);
                              });

                              // If not marked as cloned, do the full clone with auth
                              if (!workstation.cloned) {
                                await cloneRepositoryWithAuth(
                                  workstation.projectId || workstation.id,
                                  githubUrl,
                                  currentTab.id,
                                  workstation.name,
                                  workstation.githubAccountUsername,
                                  authToken // Pass the pre-authenticated token
                                );
                              }
                            } else {
                              // No githubUrl - project might be already on VM or a local project.
                              // Warm the project/container using the current fly endpoint.
                              fetch(`${config.apiUrl}/fly/clone`, {
                                method: 'POST',
                                headers: apiHeaders,
                                body: JSON.stringify({
                                  projectId: workstation.id,
                                }),
                              }).then(r => r.json()).then(result => {
                                if (result.success || result.machineId) {
                                } else {
                                  console.warn('⚠️ [VM] Start issue:', result.error || result.message);
                                }
                              }).catch(e => {
                                console.warn('VM start error:', e.message);
                              });
                            }
                          }
                        }, 50); // Reduced delay for faster background start
                      }}
                    />
                  </NavigationContainer>
                </View>
              )}

              {currentScreen === 'create' && (
                <View
                  key={`create-screen-${createKey}`}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
                >
                  <CreateProjectScreen
                    progressOffset={isFirstCreate ? 5 : 0}
                    progressTotal={isFirstCreate ? 8 : 3}
                    onBack={() => {
                      if (isFirstCreate) {
                        setCurrentScreen('firstProjectChoice');
                      } else {
                        setCurrentScreen('home');
                      }
                    }}
                    onOpenPlans={() => setCurrentScreen('plans')}
                    onCreate={async (workstation) => {
                      // 0. Save to Firebase so it appears in home screen
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
                      // 1. Set the new workstation
                      setWorkstation(workstation);

                      // 2. Clear previous tabs to avoid "zombie" state
                      useTabStore.getState().clearTabs();

                      // 3. SEED THE CACHE with the files returned by backend (instant loading!)
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

                      // Add welcome message to chat
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
                  />
                </View>
              )}

              {(currentScreen === 'terminal' || ((currentScreen === 'settings' || currentScreen === 'plans') && useNavigationStore.getState().previousScreen === 'terminal')) && (
                <Animated.View
                  key="terminal-screen"
                  entering={FadeInDown.duration(800)}
                  exiting={FadeOut.duration(400)}
                  style={{ flex: 1 }}
                >
                  <VSCodeSidebar
                    onExit={() => setCurrentScreen('home')}
                  >
                    {(tab, isCardMode, cardDimensions) => {
                      // Render different components based on tab type
                      if (tab.type === 'file') {
                        return (
                          <FileViewer
                            visible={true}
                            filePath={tab.data?.filePath || ''}
                            projectId={tab.data?.projectId || ''}
                            repositoryUrl={tab.data?.repositoryUrl}
                            userId={tab.data?.userId || 'anonymous'}
                            onClose={() => { }}
                            refreshKey={tab.data?.refreshKey}
                          />
                        );
                      }

                      // Default to ChatPage for all other types
                      return (
                        <ChatPage tab={tab} isCardMode={isCardMode} cardDimensions={cardDimensions} />
                      );
                    }}
                  </VSCodeSidebar>
                </Animated.View>
              )}

              {currentScreen === 'allProjects' && (
                <Animated.View
                  key="all-projects-screen"
                  entering={SlideInRight.duration(300)}
                  exiting={FadeOut.duration(200)}
                  style={{ flex: 1 }}
                >
                  <AllProjectsScreen
                    onClose={() => setCurrentScreen('home')}
                    onOpenProject={async (workstation) => {
                      const githubUrl = workstation.githubUrl || workstation.repositoryUrl;

                      // Check if we're switching to a DIFFERENT project
                      // Only consider it the same project if the workstation ID matches exactly
                      const currentWorkstation = useTerminalStore.getState().currentWorkstation;
                      const isSameProject = currentWorkstation?.id === workstation.id;

                      // NAVIGATE IMMEDIATELY - auth/clone happens in background
                      // Only clear terminal items when switching to a DIFFERENT project
                      if (!isSameProject) {
                        // Clear global terminal log
                        clearGlobalTerminalLog();

                        // Find the most recent chat for this project
                        const { chatHistory } = useTerminalStore.getState();
                        const projectChats = chatHistory.filter(c =>
                          c.repositoryId === workstation.id || c.repositoryId === workstation.projectId
                        );
                        const mostRecentChat = projectChats.sort((a, b) =>
                          new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
                        )[0];

                        const { activeTabId: preNavTabId, updateTab } = useTabStore.getState();

                        if (mostRecentChat && mostRecentChat.messages && mostRecentChat.messages.length > 0) {
                          // Load the most recent chat with its messages
                          if (preNavTabId) {
                            updateTab(preNavTabId, {
                              title: mostRecentChat.title,
                              data: { chatId: mostRecentChat.id },
                              terminalItems: mostRecentChat.messages
                            });
                          }
                        } else {
                          // No existing chat - clear items and start fresh
                          if (preNavTabId) {
                            clearTerminalItems(preNavTabId);
                          }
                        }
                      } else {
                      }

                      // INSTANT navigation - no blocking auth check
                      setWorkstation(workstation);
                      setCurrentScreen('terminal');

                      // Background operations (auth check + clone sync)
                      setTimeout(async () => {
                        const { activeTabId, tabs } = useTabStore.getState();
                        const currentTab = tabs.find(t => t.id === activeTabId);

                        if (currentTab && githubUrl) {
                          // Get auth token in background (non-blocking for UI)
                          let authToken: string | null = null;
                          try {
                            authToken = await checkAuthBeforeOpen(
                              githubUrl,
                              workstation.name,
                              workstation.githubAccountUsername
                            );
                          } catch (e) {
                            console.warn('Auth check failed, continuing without token:', e);
                          }

                          // Check if project is already cloned - skip clone if so
                          if (workstation.cloned) {
                          } else {
                            // Project not cloned yet - do the clone
                            await cloneRepositoryWithAuth(
                              workstation.projectId || workstation.id,
                              githubUrl,
                              currentTab.id,
                              workstation.name,
                              workstation.githubAccountUsername,
                              authToken // Pass the pre-authenticated token
                            );
                          }
                        }
                      }, 50); // Reduced delay for faster background start
                    }}
                  />
                </Animated.View>
              )}

              {currentScreen === 'settings' && (
                <Animated.View
                  key="settings-screen"
                  entering={SlideInRight.duration(300)}
                  exiting={FadeOut.duration(200)}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
                >
                  <SettingsScreen
                    onClose={() => {
                      const prev = useNavigationStore.getState().previousScreen;
                      setCurrentScreen(prev || 'home');
                    }}
                  />
                </Animated.View>
              )}

              {currentScreen === 'plans' && (
                <Animated.View
                  key="plans-screen"
                  entering={SlideInRight.duration(300)}
                  exiting={FadeOut.duration(200)}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
                >
                  <SettingsScreen
                    onClose={() => {
                      const prev = useNavigationStore.getState().previousScreen;
                      setCurrentScreen(prev || 'home');
                    }}
                    initialShowPlans={true}
                    initialPlanIndex={1}
                  />
                </Animated.View>
              )}
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
