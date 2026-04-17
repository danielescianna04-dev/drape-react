import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Alert,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import type { ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../core/git/gitAccountService';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { useAuthStore } from '../../core/auth/authStore';
import { useTranslation } from 'react-i18next';
import { useLanguageStore } from '../../i18n/languageStore';
import { pushNotificationService } from '../../core/services/pushNotificationService';
import { deviceService } from '../../core/services/deviceService';
import { getSystemConfig } from '../../core/config/systemConfig';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { tracciaLogout, tracciaEliminaAccount, tracciaLinguaCambiata, tracciaAcquistiRipristinati, tracciaAccountGitRimosso, tracciaErrore, tracciaPaginaPianiVista, tracciaPaginaPianiChiusa, tracciaCicloFatturazioneCambiato, tracciaPianoVisualizzato, tracciaDocumentoLegaleVisto, tracciaNotificheToggle, tracciaSchermata, tracciaImpostazioniAperte, tracciaImpostazioniChiuse } from '../../core/services/analyticsService';
import { auth } from '../../config/firebase';
import { useIAPStore } from '../../core/iap/iapStore';

export interface SystemStatus {
  tokens: {
    used: number;
    limit: number;
    percent: number;
    hourly: number[];
  };
  previews: {
    limit: number;
    limitPerProject?: number;
    totalStarts?: number;
    maxUsedOnProject?: number;
    activeSessions?: number;
    activeProjects?: number;
    byProject?: { name: string; used: number; limit: number; isActive?: boolean }[];
  };
  projects: {
    active: number;
    used?: number;
    limit: number;
    percent: number;
  };
  search: {
    used: number;
    limit: number;
    percent: number;
  };
  storage?: {
    usedMb: number;
    limitMb: number;
    percent: number;
  };
}

export interface BudgetStatus {
  plan: {
    id: string;
    name: string;
    monthlyBudgetEur: number;
  };
  usage: {
    spentEur: number;
    remainingEur: number;
    percentUsed: number;
  };
}

export interface ProjectAIAnalytics {
  period: {
    start: string;
    end: string;
  };
  overview: {
    projectCount: number;
    totalCostEur: number;
    averageCostPerProjectEur: number;
    totalTokens: number;
    generationCostEur: number;
    verifyCostEur: number;
    verifyEscalationCostEur: number;
    premiumEscalationProjects: number;
  };
  byModel: Array<{
    model: string;
    costEur: number;
    inputTokens: number;
    outputTokens: number;
    count: number;
  }>;
  topProjects: Array<{
    projectId: string;
    projectName: string | null;
    totalCostEur: number;
    totalTokens: number;
    requestCount: number;
    generationCostEur: number;
    verifyCostEur: number;
    verifyEscalationCostEur: number;
    lastActivityAt: string;
  }>;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.84;
const GAP = 12;
const SNAP_INTERVAL = CARD_WIDTH + GAP;

export { SCREEN_WIDTH, CARD_WIDTH, GAP, SNAP_INTERVAL };

export const useSettingsData = (onClose: () => void, initialShowPlans: boolean, initialPlanIndex: number) => {
  const insets_not_used = null; // insets come from the component via useSafeAreaInsets
  const isUnlimitedPreviews = (limit?: number) => typeof limit === 'number' && limit < 0;
  const { user, logout, deleteAccount } = useAuthStore();
  const { t } = useTranslation('settings');
  const { language, setLanguage: setAppLanguage } = useLanguageStore();
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [notifOperations, setNotifOperations] = useState(true);
  const [notifGithub, setNotifGithub] = useState(true);
  const [notifReengagement, setNotifReengagement] = useState(true);

  const updateNotifPreference = (key: string, value: boolean) => {
    const prefs = {
      operations: key === 'operations' ? value : notifOperations,
      github: key === 'github' ? value : notifGithub,
      reengagement: key === 'reengagement' ? value : notifReengagement,
    };
    if (user?.uid) {
      pushNotificationService.updatePreferences(user.uid, prefs).catch((err) => console.warn('[Settings] Failed to update notification preferences:', err?.message || err));
    }
  };

  const [accounts, setAccounts] = useState<GitAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPlanSelection, setShowPlanSelection] = useState(initialShowPlans);
  const [showResourceUsage, setShowResourceUsage] = useState(false);
  const [tokenTimeframe, setTokenTimeframe] = useState<'24h' | '7d' | '30d'>('24h');
  const [currentPlan, setCurrentPlan] = useState<'free' | 'go' | 'pro' | 'team'>((user?.plan || 'free') as 'free' | 'go' | 'pro' | 'team');
  const [visiblePlanIndex, setVisiblePlanIndex] = useState(initialPlanIndex);
  const planScrollRef = useRef<ScrollView>(null);
  const didInitialPlanScrollRef = useRef(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const { products: iapProducts, currentProductId, isPurchasing, isRestoring, purchase: iapPurchase, restorePurchases, showCelebration, celebrationPlan, closeCelebration, loadProducts } = useIAPStore();
  const [showEditName, setShowEditName] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showLegal, setShowLegal] = useState<'privacy' | 'terms' | null>(null);
  const isEmailUser = auth.currentUser?.providerData.some(p => p.providerId === 'password') ?? false;
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [deviceModelName, setDeviceModelName] = useState<string>('');

  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [projectAiAnalytics, setProjectAiAnalytics] = useState<ProjectAIAnalytics | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const userId = user?.uid || useTerminalStore.getState().userId || 'anonymous';

  // Keep currentPlan in sync with auth store user plan + re-fetch stats
  useEffect(() => {
    if (user?.plan) {
      setCurrentPlan(user.plan);
      // Re-fetch system status when plan changes (e.g. after IAP upgrade)
      fetchSystemStatus();
    }
  }, [user?.plan]);

  useEffect(() => {
    if (!showPlanSelection) {
      didInitialPlanScrollRef.current = false;
      return;
    }

    if (didInitialPlanScrollRef.current) return;
    didInitialPlanScrollRef.current = true;

    requestAnimationFrame(() => {
      planScrollRef.current?.scrollTo({ x: initialPlanIndex * SNAP_INTERVAL, animated: false });
      setVisiblePlanIndex(initialPlanIndex);
    });
  }, [showPlanSelection, initialPlanIndex]);

  // Swipe-back gesture
  const swipeX = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => {
      // Only activate for horizontal right swipes starting from left edge area
      return gs.dx > 10 && Math.abs(gs.dy) < Math.abs(gs.dx) && gs.moveX < 40;
    },
    onPanResponderMove: (_, gs) => {
      if (gs.dx > 0) swipeX.setValue(gs.dx);
    },
    onPanResponderRelease: (_, gs) => {
      const screenWidth = Dimensions.get('window').width;
      if (gs.dx > screenWidth * 0.3 || gs.vx > 0.5) {
        Animated.timing(swipeX, {
          toValue: screenWidth,
          duration: 200,
          useNativeDriver: true,
        }).start(() => onClose());
      } else {
        Animated.spring(swipeX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }).start();
      }
    },
  }), [onClose]);

  // Plan screen entrance/exit animations
  const planHeaderAnim = useRef(new Animated.Value(0)).current;
  const planToggleAnim = useRef(new Animated.Value(0)).current;
  const planCardsAnim = useRef(new Animated.Value(0)).current;
  const planFooterAnim = useRef(new Animated.Value(0)).current;
  const planExitAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (showPlanSelection) {
      loadProducts(true).catch(() => {});
      planExitAnim.setValue(1);
      planHeaderAnim.setValue(0);
      planToggleAnim.setValue(0);
      planCardsAnim.setValue(0);
      planFooterAnim.setValue(0);
      Animated.stagger(100, [
        Animated.timing(planHeaderAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(planToggleAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(planCardsAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(planFooterAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [showPlanSelection]);

  // Animated close for plan screen
  const handleClosePlans = () => {
    tracciaPaginaPianiChiusa();
    if (initialShowPlans) {
      Animated.timing(planExitAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => onClose());
    } else {
      setShowPlanSelection(false);
    }
  };

  // Load saved notification preferences on mount
  useEffect(() => {
    const loadNotifPrefs = async () => {
      try {
        const saved = await AsyncStorage.getItem('notification_preferences');
        if (saved) {
          const prefs = JSON.parse(saved);
          setNotifications(prefs.notifications ?? true);
          setNotifOperations(prefs.operations ?? true);
          setNotifGithub(prefs.github ?? true);
          setNotifReengagement(prefs.reengagement ?? true);
        }
      } catch (e) {
        console.warn('[Settings] Failed to load notification prefs:', e);
      }
    };
    loadNotifPrefs();
  }, []);

  // Save notification preferences when they change
  useEffect(() => {
    const saveNotifPrefs = async () => {
      try {
        await AsyncStorage.setItem('notification_preferences', JSON.stringify({
          notifications,
          operations: notifOperations,
          github: notifGithub,
          reengagement: notifReengagement,
        }));
      } catch (e) {
        console.warn('[Settings] Failed to save notification prefs:', e);
      }
    };
    saveNotifPrefs();
  }, [notifications, notifOperations, notifGithub, notifReengagement]);

  useEffect(() => {
    loadAccounts();
    fetchSystemStatus();
    loadDeviceId();

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();

    return () => shimmerLoop.stop();
  }, []);

  const fetchSystemStatus = async () => {
    try {
      setStatusLoading(true);
      const { apiUrl } = getSystemConfig().backend;
      const authHeaders = await getAuthHeaders();

      // Fetch system status (per-user)
      const response = await fetch(`${apiUrl}/stats/system-status`, {
        headers: authHeaders,
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.tokens) {
          setSystemStatus(data);
        }
      } else {
        console.warn('[Settings] system-status returned', response.status);
      }

      // Fetch budget status.
      // Try the authenticated canonical route first, then fall back to the legacy path
      // for backends that haven't been redeployed yet.
      const budgetUrls = [
        `${apiUrl}/ai/budget`,
        `${apiUrl}/ai/budget/${encodeURIComponent(userId)}`,
      ];

      let budgetLoaded = false;
      let lastBudgetStatus: number | null = null;

      for (const budgetUrl of budgetUrls) {
        const budgetResponse = await fetch(budgetUrl, {
          headers: authHeaders,
        });

        lastBudgetStatus = budgetResponse.status;

        if (!budgetResponse.ok) {
          if (budgetResponse.status === 404) continue;
          break;
        }

        const budgetData = await budgetResponse.json();
        if (budgetData.success) {
          setBudgetStatus(budgetData);
          budgetLoaded = true;
          break;
        }
      }

      if (!budgetLoaded && lastBudgetStatus !== null) {
        console.warn('[Settings] budget returned', lastBudgetStatus);
      }

      const analyticsResponse = await fetch(`${apiUrl}/stats/project-ai-analytics`, {
        headers: authHeaders,
      });
      if (analyticsResponse.ok) {
        const analyticsData = await analyticsResponse.json();
        if (analyticsData?.success && analyticsData?.overview) {
          setProjectAiAnalytics(analyticsData);
        }
      } else {
        console.warn('[Settings] project-ai-analytics returned', analyticsResponse.status);
      }
    } catch (error) {
      console.warn('[Settings] Network error fetching system status');
    } finally {
      setStatusLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      setLoading(true);
      // Use getAllAccounts to get both local and Firebase accounts (cross-device sync)
      const accs = await gitAccountService.getAllAccounts(userId);
      setAccounts(accs);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeviceId = async () => {
    try {
      const deviceId = await deviceService.getDeviceId();
      setCurrentDeviceId(deviceId);
      // Get device model name (e.g., "iPhone 16 Pro Max")
      const modelName = deviceService.getDeviceModelName();
      setDeviceModelName(modelName);
    } catch (error) {
      console.error('Error loading device ID:', error);
    }
  };

  const handleDeleteAccount = (account: GitAccount) => {
    const providerConfig = GIT_PROVIDERS.find(p => p.id === account.provider);
    const providerName = providerConfig?.name || account.provider;

    Alert.alert(
      t('gitAccounts.removeAccount'),
      t('gitAccounts.removeConfirm', { account: `${account.username} (${providerName})` }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              tracciaAccountGitRimosso(account.provider);
              await gitAccountService.deleteAccount(account, userId);
              loadAccounts();
            } catch (error: any) {
              tracciaErrore(error?.message || 'Remove account error', 'git_account_remove');
              Alert.alert(t('common:error'), t('gitAccounts.removeError'));
            }
          },
        },
      ]
    );
  };

  return {
    t,
    user,
    logout,
    deleteAccount,
    language,
    setAppLanguage,
    darkMode,
    setDarkMode,
    notifications,
    setNotifications,
    notifOperations,
    setNotifOperations,
    notifGithub,
    setNotifGithub,
    notifReengagement,
    setNotifReengagement,
    updateNotifPreference,
    accounts,
    loading,
    showAddModal,
    setShowAddModal,
    showPlanSelection,
    setShowPlanSelection,
    showResourceUsage,
    setShowResourceUsage,
    tokenTimeframe,
    setTokenTimeframe,
    currentPlan,
    visiblePlanIndex,
    setVisiblePlanIndex,
    planScrollRef,
    billingCycle,
    setBillingCycle,
    iapProducts,
    currentProductId,
    isPurchasing,
    isRestoring,
    iapPurchase,
    restorePurchases,
    showCelebration,
    celebrationPlan,
    closeCelebration,
    showEditName,
    setShowEditName,
    showChangePassword,
    setShowChangePassword,
    showChangeEmail,
    setShowChangeEmail,
    showLegal,
    setShowLegal,
    isEmailUser,
    currentDeviceId,
    deviceModelName,
    systemStatus,
    budgetStatus,
    projectAiAnalytics,
    statusLoading,
    shimmerAnim,
    swipeX,
    panResponder,
    planHeaderAnim,
    planToggleAnim,
    planCardsAnim,
    planFooterAnim,
    planExitAnim,
    handleClosePlans,
    fetchSystemStatus,
    loadAccounts,
    handleDeleteAccount,
    isUnlimitedPreviews,
  };
};
