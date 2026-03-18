import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Alert,
  Dimensions,
  PanResponder,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle, Rect, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../core/git/gitAccountService';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { useAuthStore } from '../../core/auth/authStore';
import { useTranslation } from 'react-i18next';
import { useLanguageStore } from '../../i18n/languageStore';
import { pushNotificationService } from '../../core/services/pushNotificationService';
import { deviceService } from '../../core/services/deviceService';
import { AppColors } from '../../shared/theme/colors';
import { getSystemConfig } from '../../core/config/systemConfig';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { trackLogout, trackDeleteAccount, trackLanguageChange, trackRestorePurchases, trackGitAccountRemove, trackError, trackPlansView, trackPlansClose, trackBillingCycleChange, trackPlanSelect, trackLegalView, trackNotificationToggle, trackScreenView, trackSettingsModalOpen, trackSettingsModalClose } from '../../core/services/analyticsService';
import { AddGitAccountModal } from './components/AddGitAccountModal';
import { ProfileSection } from './components/ProfileSection';
import { GitAccountsSection } from './components/GitAccountsSection';
import { SubscriptionSection } from './components/SubscriptionSection';
import { AppearanceSection } from './components/AppearanceSection';
import { NotificationSection } from './components/NotificationSection';
import { InfoSection } from './components/InfoSection';
import { DeviceSection } from './components/DeviceSection';
import { AccountActionsSection } from './components/AccountActionsSection';
import { EditNameModal } from './components/EditNameModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { SecuritySection } from './components/SecuritySection';
import { DataExportSection } from './components/DataExportSection';
import { useConsentStore } from '../../core/services/consentService';
import { ChangeEmailModal } from './components/ChangeEmailModal';
import { auth } from '../../config/firebase';
import { LegalPage } from './components/LegalPage';
import { PurchaseCelebrationModal } from '../../shared/components/modals/PurchaseCelebrationModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIAPStore } from '../../core/iap/iapStore';
import { IAP_PRODUCT_IDS, getProductId } from '../../core/iap/iapConstants';
import { useToastStore } from '../../core/toast/toastStore';

interface SystemStatus {
  tokens: {
    used: number;
    limit: number;
    percent: number;
    hourly: number[];
  };
  previews: {
    limit: number;
    byProject?: { name: string; used: number; limit: number }[];
  };
  projects: {
    active: number;
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

interface BudgetStatus {
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

interface Props {
  onClose: () => void;
  initialShowPlans?: boolean;
  initialPlanIndex?: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.84;
const GAP = 12;
const SNAP_INTERVAL = CARD_WIDTH + GAP;
const SIDE_INSET = (SCREEN_WIDTH - CARD_WIDTH) / 2;

// Components extracted to separate files

export const SettingsScreen = ({ onClose, initialShowPlans = false, initialPlanIndex = 0 }: Props) => {
  const insets = useSafeAreaInsets();
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
  const [currentPlan, setCurrentPlan] = useState<'free' | 'go' | 'pro' | 'team'>(user?.plan === 'starter' ? 'free' : (user?.plan || 'free') as 'free' | 'go' | 'pro' | 'team');
  const [visiblePlanIndex, setVisiblePlanIndex] = useState(initialPlanIndex);
  const planScrollRef = useRef<ScrollView>(null);
  const didInitialPlanScrollRef = useRef(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const { products: iapProducts, currentProductId, isPurchasing, isRestoring, purchase: iapPurchase, restorePurchases, showCelebration, celebrationPlan, closeCelebration } = useIAPStore();
  const [showEditName, setShowEditName] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [showLegal, setShowLegal] = useState<'privacy' | 'terms' | null>(null);
  const isEmailUser = auth.currentUser?.providerData.some(p => p.providerId === 'password') ?? false;
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [deviceModelName, setDeviceModelName] = useState<string>('');

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
    trackPlansClose();
    // First update state, then animate out
    // The useEffect will reset animations when plans open again
    if (initialShowPlans) {
      // Came from onboarding or direct plans route - animate then close entire settings
      Animated.timing(planExitAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => onClose());
    } else {
      // Came from settings "Piano Attuale" - just hide plans overlay immediately
      // No animation needed since we're just swapping views within settings
      setShowPlanSelection(false);
    }
  };
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const userId = user?.uid || useTerminalStore.getState().userId || 'anonymous';

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
      const response = await fetch(`${apiUrl}/stats/system-status?userId=${encodeURIComponent(userId)}`, {
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

      // Fetch budget status
      const budgetResponse = await fetch(`${apiUrl}/ai/budget/${userId}`, {
        headers: authHeaders,
      });
      if (budgetResponse.ok) {
        const budgetData = await budgetResponse.json();
        if (budgetData.success) {
          setBudgetStatus(budgetData);
        }
      } else {
        console.warn('[Settings] budget returned', budgetResponse.status);
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
              trackGitAccountRemove(account.provider);
              await gitAccountService.deleteAccount(account, userId);
              loadAccounts();
            } catch (error: any) {
              trackError(error?.message || 'Remove account error', 'git_account_remove');
              Alert.alert(t('common:error'), t('gitAccounts.removeError'));
            }
          },
        },
      ]
    );
  };

  // Render functions moved to component files

  const renderPlanCard = (planId: 'free' | 'pro' | 'max', name: string, price: string, description: string, features: string[], color: string, isPopular?: boolean) => {
    const isCurrent = currentPlan === planId;
    const yearlyDiscount = billingCycle === 'yearly' ? ' -20%' : '';

    return (
      <TouchableOpacity
        style={[
          styles.planCard,
          isCurrent && { borderColor: `${color}40`, borderWidth: 1.5 },
          isPopular && styles.planCardPopular
        ]}
        activeOpacity={0.9}
        onPress={() => {
          if (!isCurrent) {
            Alert.alert(
              t('plans.upgradeTo', { plan: name }),
              t('plans.confirmUpgrade', { plan: name, cycle: billingCycle === 'monthly' ? t('plans.monthly') : t('plans.yearly') }),
              [
                { text: t('common:cancel'), style: 'cancel' },
                { text: t('common:confirm'), onPress: () => setCurrentPlan(planId) }
              ]
            );
          }
        }}
      >
        {isPopular && (
          <LinearGradient
            colors={[color, `${color}80`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.popularBadge}
          >
            <Text style={styles.popularBadgeText}>{t('plans.recommended')}</Text>
          </LinearGradient>
        )}

        <View style={styles.planHeader}>
          <View style={styles.planTitleContainer}>
            <Text style={styles.planName}>{name}</Text>
            <Text style={styles.planDescription}>{description}</Text>
          </View>
          {isCurrent && (
            <BlurView intensity={30} tint="light" style={styles.currentBadge}>
              <Ionicons name="checkmark-circle" size={14} color={color} />
              <Text style={[styles.currentBadgeText, { color }]}>{t('plans.active')}</Text>
            </BlurView>
          )}
        </View>

        <View style={styles.priceContainer}>
          <Text style={styles.planPrice}>{price}</Text>
          <Text style={styles.priceSubtext}>{billingCycle === 'monthly' ? t('plans.perMonth') : t('plans.perYear')}</Text>
          {billingCycle === 'yearly' && planId !== 'free' && (
            <View style={styles.discountTag}>
              <Text style={styles.discountText}>{t('plans.save20')}</Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.planFeatures}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={[styles.featureDot, { backgroundColor: isCurrent ? color : 'rgba(255,255,255,0.2)' }]} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.planButton,
            { backgroundColor: isCurrent ? 'rgba(255,255,255,0.05)' : color },
            isCurrent && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }
          ]}
          onPress={() => !isCurrent && setCurrentPlan(planId)}
        >
          <Text style={[styles.planButtonText, isCurrent && { color: 'rgba(255,255,255,0.5)' }]}>
            {isCurrent ? t('plans.currentPlan') : t('plans.upgradeTo', { plan: name })}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderPlanSelection = () => {
    // Get localized prices from App Store (fallback to hardcoded)
    const getCurrencySymbol = (currency?: string): string => {
      if (currency === 'EUR') return '€';
      if (currency === 'USD') return '$';
      if (currency === 'GBP') return '£';
      if (currency === 'JPY') return '¥';
      return currency || '€';
    };

    const getPrice = (productId: string, fallback: string): string => {
      const product = iapProducts.find(p => p.productId === productId);
      return product?.localizedPrice || fallback;
    };

    const getIntroPrice = (productId: string): string | undefined => {
      const product = iapProducts.find(p => p.productId === productId);
      if (!product?.introductoryPrice) return undefined;
      // Format: introductoryPrice is the raw amount (e.g. "5.99")
      return `${getCurrencySymbol(product.currency)}${product.introductoryPrice}`;
    };

    const currentCyclePaidProduct = iapProducts.find((p) =>
      billingCycle === 'monthly'
        ? p.productId === IAP_PRODUCT_IDS.GO_MONTHLY || p.productId === IAP_PRODUCT_IDS.PRO_MONTHLY
        : p.productId === IAP_PRODUCT_IDS.GO_YEARLY || p.productId === IAP_PRODUCT_IDS.PRO_YEARLY
    );

    const freePlanPrice = `${getCurrencySymbol(currentCyclePaidProduct?.currency)}0`;

    const plans = [
      {
        id: 'free',
        name: t('plans.free.name'),
        price: freePlanPrice,
        introPrice: undefined as string | undefined,
        description: t('plans.free.description'),
        features: t('plans.free.features', { returnObjects: true }) as string[],
        color: '#94A3B8'
      },
      {
        id: 'go',
        name: t('plans.go.name'),
        price: billingCycle === 'monthly'
          ? getPrice(IAP_PRODUCT_IDS.GO_MONTHLY, '€22.99')
          : getPrice(IAP_PRODUCT_IDS.GO_YEARLY, '€229.99'),
        introPrice: billingCycle === 'monthly' ? getIntroPrice(IAP_PRODUCT_IDS.GO_MONTHLY) : undefined,
        description: t('plans.go.description'),
        features: t('plans.go.features', { returnObjects: true }) as string[],
        color: AppColors.primary,
        isPopular: true
      },
      {
        id: 'pro',
        name: t('plans.pro.name'),
        price: billingCycle === 'monthly'
          ? getPrice(IAP_PRODUCT_IDS.PRO_MONTHLY, '€39.99')
          : getPrice(IAP_PRODUCT_IDS.PRO_YEARLY, '€449.99'),
        introPrice: billingCycle === 'monthly' ? getIntroPrice(IAP_PRODUCT_IDS.PRO_MONTHLY) : undefined,
        description: t('plans.pro.description'),
        features: t('plans.pro.features', { returnObjects: true }) as string[],
        color: '#F472B6'
      }
    ];

    return (
      <Animated.View style={[styles.container, {
        opacity: planExitAnim,
        transform: [{
          scale: planExitAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }),
        }],
      }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LinearGradient
            colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
          />
          <LinearGradient
            colors={['#0C0816', '#1E1040', '#0C0816']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
          />
        </View>

        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.backButtonCompact}
            onPress={handleClosePlans}
          >
            {isLiquidGlassSupported ? (
              <LiquidGlassView
                key="plans-close-btn"
                style={styles.backButtonGlass}
                interactive={true}
                effect="regular"
                colorScheme="dark"
              >
                <Ionicons name="close" size={20} color="#fff" />
              </LiquidGlassView>
            ) : (
              <BlurView intensity={20} tint="dark" style={styles.backButtonBlurCompact}>
                <Ionicons name="close" size={20} color="#fff" />
              </BlurView>
            )}
          </TouchableOpacity>
          <Text style={styles.headerTitleSmall}>{t('plans.upgradeTitle')}</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.plansContentContainer}
        >
          {/* Hero */}
          <Animated.View style={[styles.planSelectionHero, {
            opacity: planHeaderAnim,
            transform: [{ translateY: planHeaderAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          }]}>
            <Text style={styles.plansMainTitle}>{t('plans.elevateTitle')}</Text>
            <Text style={styles.plansSubtitleSmall}>{t('plans.elevateDesc')}</Text>
          </Animated.View>

          {/* Billing Switcher */}
          <Animated.View style={[styles.pricingToggleContainer, {
            opacity: planToggleAnim,
            transform: [{ translateY: planToggleAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          }]}>
            <TouchableOpacity
              style={[styles.pricingOption, billingCycle === 'monthly' && styles.pricingOptionActive]}
              onPress={() => { trackBillingCycleChange('monthly'); setBillingCycle('monthly'); }}
            >
              <Text style={[styles.pricingOptionText, billingCycle === 'monthly' && styles.pricingOptionTextActive]}>{t('plans.monthly')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pricingOption, billingCycle === 'yearly' && styles.pricingOptionActive]}
              onPress={() => { trackBillingCycleChange('yearly'); setBillingCycle('yearly'); }}
            >
              <Text style={[styles.pricingOptionText, billingCycle === 'yearly' && styles.pricingOptionTextActive]}>{t('plans.yearly')}</Text>
              <View style={styles.yearlySavings}>
                <Text style={styles.yearlySavingsText}>-20%</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Vertical Plan Cards */}
          <Animated.View style={[styles.plansVerticalList, {
            opacity: planCardsAnim,
            transform: [{ translateY: planCardsAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
          }]}>
            {plans.map((plan, idx) => {
              const isExactCurrent = plan.id === 'free'
                ? (currentPlan === 'free')
                : currentProductId
                  ? currentProductId === getProductId(plan.id as 'go' | 'pro', billingCycle)
                  : currentPlan === plan.id;
              const isPopular = !!plan.isPopular;
              const isFree = plan.id === 'free';

              return (
                <View key={plan.id} style={[styles.pvCardOuter, isPopular && styles.pvCardOuterPopular]}>
                  {/* Gradient border glow for popular plan */}
                  {isPopular && (
                    <LinearGradient
                      colors={[`${plan.color}50`, `${plan.color}15`, `${plan.color}30`]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.pvGlowBorder}
                    />
                  )}
                  <View style={[
                    styles.pvCard,
                    isPopular && styles.pvCardPopular,
                    isExactCurrent && !isPopular && { borderColor: `${plan.color}30` },
                  ]}>
                    {/* Top glow */}
                    <LinearGradient
                      colors={[`${plan.color}${isPopular ? '18' : '0A'}`, 'transparent']}
                      style={styles.pvCardGlow}
                    />

                    {/* Header row: name + price */}
                    <View style={styles.pvHeaderRow}>
                      <View style={styles.pvLeft}>
                        <View style={styles.pvNameRow}>
                          <Text style={[styles.pvName, isPopular && { color: '#fff' }]}>{plan.name}</Text>
                          {isPopular && (
                            <View style={[styles.pvPopularBadge, { backgroundColor: `${plan.color}20`, borderColor: `${plan.color}35` }]}>
                              <Ionicons name="sparkles" size={9} color={plan.color} />
                              <Text style={[styles.pvPopularText, { color: plan.color }]}>POPULAR</Text>
                            </View>
                          )}
                          {isExactCurrent && (
                            <View style={[styles.pvActiveBadge, { backgroundColor: '#3FB95018', borderColor: '#3FB95030' }]}>
                              <Ionicons name="checkmark-circle" size={11} color="#3FB950" />
                              <Text style={styles.pvActiveText}>ACTIVE</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.pvDesc}>{plan.description}</Text>
                      </View>
                      <View style={styles.pvPriceBlock}>
                        {plan.introPrice ? (
                          <>
                            <Text style={[styles.pvPrice, isPopular && { color: '#fff' }]}>{plan.introPrice}</Text>
                            <View style={styles.pvPriceMeta}>
                              <Text style={styles.pvPeriod}>{billingCycle === 'monthly' ? t('plans.perMonth') : t('plans.perYear')}</Text>
                              <Text style={styles.pvOrigPrice}>{plan.price}</Text>
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={[styles.pvPrice, isPopular && { color: '#fff' }]}>{plan.price}</Text>
                            <Text style={styles.pvPeriod}>{isFree ? '' : billingCycle === 'monthly' ? t('plans.perMonth') : t('plans.perYear')}</Text>
                          </>
                        )}
                      </View>
                    </View>

                    {/* Divider */}
                    <View style={styles.pvDivider} />

                    {/* Features */}
                    <View style={styles.pvFeatures}>
                      {plan.features.map((f, i) => (
                        <View key={i} style={styles.pvFeatureRow}>
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color={isPopular ? plan.color : 'rgba(255,255,255,0.25)'}
                          />
                          <Text style={[styles.pvFeatureText, isPopular && { color: 'rgba(255,255,255,0.85)' }]}>{f}</Text>
                        </View>
                      ))}
                    </View>

                    {/* CTA */}
                    {!isFree && (
                      <TouchableOpacity
                        style={[
                          styles.pvCta,
                          isExactCurrent
                            ? styles.pvCtaCurrent
                            : isPopular
                              ? [styles.pvCtaPopular, { backgroundColor: plan.color, shadowColor: plan.color }]
                              : { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
                          isPurchasing && !isExactCurrent && { opacity: 0.6 },
                        ]}
                        disabled={isExactCurrent || isPurchasing}
                        onPress={() => {
                          if (!isPurchasing) {
                            trackPlanSelect(plan.id + '_' + billingCycle);
                            iapPurchase(plan.id as 'go' | 'pro', billingCycle);
                          }
                        }}
                      >
                        <Text style={[styles.pvCtaText, isExactCurrent && { color: 'rgba(255,255,255,0.35)' }]}>
                          {isExactCurrent ? t('plans.currentPlan') : t('plans.upgradeTo', { plan: plan.name })}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {isFree && isExactCurrent && (
                      <View style={[styles.pvCta, styles.pvCtaCurrent]}>
                        <Text style={[styles.pvCtaText, { color: 'rgba(255,255,255,0.35)' }]}>{t('plans.currentPlan')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </Animated.View>

          {/* Footer */}
          <Animated.View style={[styles.pvFooter, { opacity: planFooterAnim }]}>
            <Text style={styles.restoreCaption}>{t('plans.secureTransactions')}</Text>
            <TouchableOpacity
              onPress={async () => {
                trackRestorePurchases();
                const result = await restorePurchases();
                const { showToast } = useToastStore.getState();
                if (!result.success) {
                  showToast({ message: t('plans.restoreError'), type: 'error', icon: 'alert-circle' });
                } else if (result.plan && result.plan !== 'free') {
                  showToast({ message: t('plans.restoreSuccess'), type: 'success', icon: 'checkmark-circle' });
                } else {
                  showToast({ message: t('plans.restoreNoPurchases'), type: 'info', icon: 'information-circle' });
                }
              }}
              disabled={isRestoring}
              style={styles.restoreButton}
            >
              <Text style={styles.restoreButtonText}>
                {isRestoring ? t('plans.restoring') : t('plans.restorePurchases')}
              </Text>
            </TouchableOpacity>
            <Text style={styles.legalNotice}>
              {t('plans.legalNotice')}
            </Text>
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => { trackLegalView('privacy'); setShowLegal('privacy'); }}>
                <Text style={styles.legalLinkText}>{t('plans.privacyPolicy')}</Text>
              </TouchableOpacity>
              <Text style={styles.legalLinkSeparator}>  ·  </Text>
              <TouchableOpacity onPress={() => { trackLegalView('terms'); setShowLegal('terms'); }}>
                <Text style={styles.legalLinkText}>{t('plans.termsOfService')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </Animated.View>
    );
  };

  const renderResourceUsage = () => {
    // Budget data
    const percentUsed = budgetStatus?.usage.percentUsed || 0;
    const planName = budgetStatus?.plan.name || 'Free';
    // Get color based on usage
    const getBudgetColor = () => {
      if (percentUsed >= 90) return '#F87171'; // Red
      if (percentUsed >= 70) return '#FBBF24'; // Yellow
      return '#6366F1'; // Indigo/blue like Claude
    };

    const daysLeft = Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()));

    // Token usage
    const tokensUsed = systemStatus?.tokens.used || 0;
    const tokensLimit = systemStatus?.tokens.limit || 50000;
    const tokensPercent = systemStatus?.tokens.percent || 0;
    const formatTokens = (n: number) => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
      return `${n}`;
    };

    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LinearGradient
            colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
          />
          <LinearGradient
            colors={['#0C0816', '#1E1040', '#0C0816']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
          />
        </View>

        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.backButtonCompact}
            onPress={() => setShowResourceUsage(false)}
          >
            {isLiquidGlassSupported ? (
              <LiquidGlassView
                key="usage-close-btn"
                style={styles.backButtonGlass}
                interactive={true}
                effect="regular"
                colorScheme="dark"
              >
                <Ionicons name="close" size={20} color="#fff" />
              </LiquidGlassView>
            ) : (
              <BlurView intensity={20} tint="dark" style={styles.backButtonBlurCompact}>
                <Ionicons name="close" size={20} color="#fff" />
              </BlurView>
            )}
          </TouchableOpacity>
          <Text style={styles.headerTitleSmall}>{t('resources.usage')}</Text>
          <TouchableOpacity onPress={fetchSystemStatus} style={{ width: 44, alignItems: 'center' }}>
            <Ionicons name="refresh-outline" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* Budget Card */}
          <BlurView intensity={30} tint="dark" style={styles.mainMonitorCard}>
            <Text style={styles.monitorTitle}>{t('subscription.aiBudget')}</Text>
            <Text style={styles.monitorSub}>{t('subscription.currentPlan')} {planName} · {t('subscription.resetsIn')} {daysLeft}{t('subscription.days').charAt(0)}</Text>

            {/* Progress Bar */}
            <View style={styles.budgetProgressContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.budgetProgressBg, { flex: 1 }]}>
                  <View
                    style={[styles.budgetProgressFill, {
                      width: `${Math.max(Math.min(percentUsed, 100), percentUsed > 0 ? 2 : 0)}%`,
                      backgroundColor: getBudgetColor(),
                    }]}
                  />
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500', minWidth: 65 }}>
                  {Math.min(percentUsed, 100)}%
                </Text>
              </View>
            </View>
          </BlurView>

          {/* System Resources */}
          <Text style={styles.detailSectionTitle}>{t('resources.title')}</Text>

          <View style={styles.hudGridRefined}>
            <View style={styles.usageGridRow}>
              <BlurView intensity={20} tint="dark" style={styles.usageCardRefinedHalf}>
                <Ionicons name="eye-outline" size={18} color="#34D399" style={{ marginBottom: 8 }} />
                <Text style={styles.usageNameMini}>{t('resources.previews')}</Text>
                {systemStatus?.previews?.byProject && systemStatus.previews.byProject.length > 0 ? (
                  <View style={{ marginTop: 8, gap: 6, width: '100%' }}>
                    {systemStatus.previews.byProject.slice(0, 3).map((p, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }} numberOfLines={1}>{p.name}</Text>
                        </View>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{p.used}/{p.limit}</Text>
                      </View>
                    ))}
                    {systemStatus.previews.byProject.length > 3 && (
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
                        +{systemStatus.previews.byProject.length - 3}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={[styles.usageSubtext, { marginTop: 4 }]}>
                    {systemStatus?.previews?.limit || 5} {t('resources.perProject')}
                  </Text>
                )}
              </BlurView>

              <BlurView intensity={20} tint="dark" style={styles.usageCardRefinedHalf}>
                <Ionicons name="folder-outline" size={18} color="#60A5FA" style={{ marginBottom: 16 }} />
                <View style={styles.usageTextRow}>
                  <Text style={styles.usageNameMini}>{t('resources.projects')}</Text>
                  <Text style={styles.usagePercent}>{systemStatus?.projects.percent || 0}%</Text>
                </View>
                <View style={styles.miniBarBg}>
                  <View style={[styles.miniBarFill, { width: `${systemStatus?.projects.percent || 0}%`, backgroundColor: '#60A5FA' }]} />
                </View>
                <Text style={styles.usageSubtext}>{systemStatus?.projects.active || 0} / {systemStatus?.projects.limit || 5}</Text>
              </BlurView>
            </View>
          </View>

          {/* Storage */}
          {systemStatus?.storage && (
            <BlurView intensity={20} tint="dark" style={[styles.mainMonitorCard, { marginTop: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="server-outline" size={16} color="#A78BFA" />
                  <Text style={styles.monitorTitle}>{t('resources.storage')}</Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{systemStatus.storage.usedMb} MB / {systemStatus.storage.limitMb} MB</Text>
              </View>
              <View style={styles.miniBarBg}>
                <View style={[styles.miniBarFill, { width: `${Math.min(systemStatus.storage.percent, 100)}%`, backgroundColor: '#A78BFA' }]} />
              </View>
            </BlurView>
          )}

          {currentPlan === 'free' && (
            <TouchableOpacity
              style={styles.premiumBanner}
              activeOpacity={0.8}
              onPress={() => {
                setShowResourceUsage(false);
                trackPlansView('premium_banner');
                setShowPlanSelection(true);
              }}
            >
              <LinearGradient
                colors={[AppColors.primary, '#6C3AE0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.premiumBannerGradient}
              >
                <View style={styles.premiumBannerContent}>
                  <View style={styles.premiumIconBox}>
                    <Ionicons name="diamond" size={18} color="#fff" />
                  </View>
                  <Text style={styles.premiumTitle}>{t('plans.upgradeTo', { plan: 'Go' })}</Text>
                  <Text style={styles.premiumSub}>{t('plans.upgradeFeatures')}</Text>
                </View>
                <View style={styles.premiumArrow}>
                  <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.8)" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  };

  if (showPlanSelection) return renderPlanSelection();
  if (showResourceUsage) return renderResourceUsage();

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateX: swipeX }] }]}
      {...panResponder.panHandlers}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
        />
        <LinearGradient
          colors={['#0C0816', '#1E1040', '#0C0816']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
        />
      </View>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backButtonWrapper}
          activeOpacity={0.7}
          onPress={onClose}
        >
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              key={loading ? 'loading-back' : 'loaded-back'}
              style={styles.backButtonGlass}
              interactive={true}
              effect="regular"
              colorScheme="dark"
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </LiquidGlassView>
          ) : (
            <View style={styles.backButton}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* User Profile Section */}
        <ProfileSection
          user={user}
          currentPlan={currentPlan}
          onEditPress={() => { trackSettingsModalOpen('edit_name'); setShowEditName(true); }}
          loading={loading}
        />

        {/* Git Accounts Section */}
        <GitAccountsSection
          accounts={accounts}
          loading={loading}
          shimmerAnim={shimmerAnim}
          onAddAccount={() => setShowAddModal(true)}
          onDeleteAccount={handleDeleteAccount}
          t={t}
        />

        {/* Subscription & Usage Section */}
        <SubscriptionSection
          currentPlan={currentPlan}
          budgetStatus={budgetStatus}
          loading={loading}
          onPlanPress={() => { trackPlansView('settings'); setShowPlanSelection(true); }}
          onBudgetPress={() => { trackScreenView('usage'); setShowResourceUsage(true); }}
          t={t}
        />

        {/* Appearance Section */}
        <AppearanceSection
          language={language}
          loading={loading}
          onLanguageChange={(lang) => { trackLanguageChange(lang); setAppLanguage(lang); }}
          t={t}
        />

        {/* Notifications Section */}
        <NotificationSection
          notifications={notifications}
          notifOperations={notifOperations}
          notifGithub={notifGithub}
          notifReengagement={notifReengagement}
          loading={loading}
          onNotificationsChange={setNotifications}
          onOperationsChange={(v) => { trackNotificationToggle('operations', String(v)); setNotifOperations(v); updateNotifPreference('operations', v); }}
          onGithubChange={(v) => { trackNotificationToggle('github', String(v)); setNotifGithub(v); updateNotifPreference('github', v); }}
          onReengagementChange={(v) => { trackNotificationToggle('reengagement', String(v)); setNotifReengagement(v); updateNotifPreference('reengagement', v); }}
          t={t}
        />

        {/* Info Section */}
        <InfoSection
          loading={loading}
          t={t}
          onOpenTerms={() => { trackLegalView('terms'); setShowLegal('terms'); }}
          onOpenPrivacy={() => { trackLegalView('privacy'); setShowLegal('privacy'); }}
        />

        {/* Device Section */}
        <DeviceSection
          deviceModelName={deviceModelName}
          currentDeviceId={currentDeviceId}
          loading={loading}
          t={t}
        />

        {/* Security Section (email users only) */}
        {isEmailUser && (
          <SecuritySection
            onChangePassword={() => { trackSettingsModalOpen('change_password'); setShowChangePassword(true); }}
            onChangeEmail={() => { trackSettingsModalOpen('change_email'); setShowChangeEmail(true); }}
            loading={loading}
            t={t}
          />
        )}

        {/* Data Export (GDPR Right to Portability) */}
        <DataExportSection
          loading={loading}
          t={t}
        />

        {/* DEV: Reset GDPR consent for testing — remove before production */}
        {__DEV__ && (
          <TouchableOpacity
            style={{ marginHorizontal: 20, marginBottom: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', alignItems: 'center' }}
            onPress={async () => {
              await AsyncStorage.removeItem('@drape_gdpr_consent');
              useConsentStore.setState({ consent: null });
              Alert.alert('Consent Reset', 'Riavvia l\'app per vedere il consent banner.');
            }}
          >
            <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '600' }}>🔧 Reset GDPR Consent (DEV)</Text>
          </TouchableOpacity>
        )}

        {/* Account Actions (Logout) */}
        <AccountActionsSection
          userEmail={user?.email}
          loading={loading}
          onLogout={() => Alert.alert(t('logout.title'), t('logout.confirm'), [
            { text: t('common:cancel'), style: 'cancel' },
            {
              text: t('logout.button'), style: 'destructive', onPress: async () => {
                try {
                  trackLogout();
                  await logout();
                  onClose();
                } catch (error: any) {
                  trackError(error?.message || 'Logout error', 'logout');
                  Alert.alert(t('common:error'), t('logout.error'));
                }
              }
            },
          ])}
          onDeleteAccount={() => Alert.alert(t('deleteAccount.title'), t('deleteAccount.confirm'), [
            { text: t('common:cancel'), style: 'cancel' },
            {
              text: t('deleteAccount.button'), style: 'destructive', onPress: async () => {
                const doDelete = async (password?: string) => {
                  try {
                    await trackDeleteAccount();
                    await deleteAccount(password);
                    Alert.alert('', t('deleteAccount.success'));
                    onClose();
                  } catch (error: any) {
                    if (error.message === 'password-required') {
                      Alert.prompt(
                        t('deleteAccount.title'),
                        t('deleteAccount.enterPassword'),
                        [
                          { text: t('common:cancel'), style: 'cancel' },
                          { text: t('deleteAccount.button'), style: 'destructive', onPress: (pwd) => doDelete(pwd) },
                        ],
                        'secure-text'
                      );
                    } else if (error.message === 'wrong-password') {
                      Alert.alert(t('common:error'), t('deleteAccount.wrongPassword'));
                    } else if (error.message === 'google-reauth-required') {
                      Alert.alert(t('common:error'), t('deleteAccount.reauth'));
                    } else if (error.message === 'cancelled') {
                      // User cancelled Apple re-auth, do nothing
                    } else {
                      trackError(error?.message || 'Delete account error', 'delete_account');
                      Alert.alert(t('common:error'), t('deleteAccount.error') + (error?.message ? `\n\n${error.message}` : ''));
                    }
                  }
                };
                await doDelete();
              }
            },
          ])}
          t={t}
        />

        <View style={{ height: 40 }} />
      </ScrollView>

      <AddGitAccountModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAccountAdded={() => {
          setShowAddModal(false);
          loadAccounts();
        }}
      />

      <EditNameModal
        visible={showEditName}
        currentName={user?.displayName || ''}
        onClose={() => { trackSettingsModalClose('edit_name'); setShowEditName(false); }}
        onSave={(newName) => useAuthStore.getState().updateDisplayName(newName)}
        t={t}
      />

      <ChangePasswordModal
        visible={showChangePassword}
        onClose={() => { trackSettingsModalClose('change_password'); setShowChangePassword(false); }}
        t={t}
      />

      <ChangeEmailModal
        visible={showChangeEmail}
        currentEmail={user?.email || ''}
        onClose={() => { trackSettingsModalClose('change_email'); setShowChangeEmail(false); }}
        t={t}
      />

      <PurchaseCelebrationModal
        visible={showCelebration}
        planName={celebrationPlan}
        onClose={closeCelebration}
      />

      {showLegal && (
        <LegalPage type={showLegal} onClose={() => setShowLegal(null)} />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0812',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backButtonWrapper: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonGlass: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  backButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  // Styles moved to component files (ProfileSection, GitAccountsSection, SubscriptionSection, etc.)
  // Plans — vertical premium layout
  headerTitleSmall: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  backButtonCompact: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonBlurCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  planSelectionHero: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  plansMainTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  plansSubtitleSmall: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  pricingToggleContainer: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 999,
    padding: 3,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  plansContentContainer: {
    paddingBottom: 40,
  },
  pricingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    gap: 6,
  },
  pricingOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pricingOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
  },
  pricingOptionTextActive: {
    color: '#fff',
  },
  yearlySavings: {
    backgroundColor: `${AppColors.primary}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  yearlySavingsText: {
    fontSize: 10,
    fontWeight: '900',
    color: AppColors.primary,
  },
  // Vertical plan cards
  plansVerticalList: {
    paddingHorizontal: 20,
    gap: 14,
  },
  pvCardOuter: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  pvCardOuterPopular: {
    borderRadius: 24,
    padding: 1.5,
    overflow: 'hidden',
  },
  pvGlowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  pvCard: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  pvCardPopular: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 0,
  },
  pvCardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  pvHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pvLeft: {
    flex: 1,
    marginRight: 16,
  },
  pvNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pvName: {
    fontSize: 22,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: -0.5,
  },
  pvPopularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  pvPopularText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pvActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  pvActiveText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#3FB950',
    letterSpacing: 0.5,
  },
  pvDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 18,
  },
  pvPriceBlock: {
    alignItems: 'flex-end',
  },
  pvPrice: {
    fontSize: 32,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: -1,
  },
  pvPriceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pvPeriod: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
  },
  pvOrigPrice: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.2)',
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  pvDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 16,
  },
  pvFeatures: {
    gap: 10,
    marginBottom: 18,
  },
  pvFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pvFeatureText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    lineHeight: 18,
  },
  pvCta: {
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pvCtaCurrent: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pvCtaPopular: {
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  pvCtaText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  pvFooter: {
    alignItems: 'center',
    marginTop: 28,
    paddingHorizontal: 24,
  },
  restoreCaption: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.3)',
  },
  restoreButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  restoreButtonText: {
    color: AppColors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  legalNotice: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
    lineHeight: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  legalLinkText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    textDecorationLine: 'underline',
  },
  legalLinkSeparator: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.15)',
  },
  // Resource Dashboard Styles
  mainMonitorCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  monitorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  monitorTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  monitorSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 6,
  },
  monitorValueBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  monitorValueText: {
    fontSize: 14,
    fontWeight: '900',
  },
  chartWrapper: {
    marginBottom: 24,
  },
  chartInnerContainer: {
    flexDirection: 'row',
    height: 160,
  },
  yAxisLabels: {
    width: 40,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 2,
  },
  axisTextMini: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.25)',
  },
  segmentsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 2,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
  },
  segmentLabelActive: {
    color: '#fff',
  },
  metricsStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  metricMini: {
    alignItems: 'center',
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  miniValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  miniDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignSelf: 'center',
  },
  detailSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 24,
  },
  hudGridRefined: {
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  usageGridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  usageCardRefinedHalf: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  usageTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  usageNameMini: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  usagePercent: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.3)',
  },
  miniBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    marginBottom: 8,
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  usageSubtext: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.25)',
  },
  premiumBanner: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  premiumBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  premiumBannerContent: {
    flex: 1,
  },
  premiumIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  premiumTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 3,
  },
  premiumSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 16,
  },
  premiumArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Budget styles
  budgetProgressContainer: {
    marginTop: 12,
  },
  budgetProgressBg: {
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  budgetProgressFill: {
    height: '100%',
    borderRadius: 6,
  },
  budgetProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  budgetProgressText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
  },
  budgetStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  budgetStatItem: {
    alignItems: 'center',
  },
  budgetStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  budgetStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  budgetStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  // EditNameModal and Language switcher styles moved to component files
});
