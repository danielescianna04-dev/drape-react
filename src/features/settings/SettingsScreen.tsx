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
import { gitAccountService, GitAccount } from '../../core/git/gitAccountService';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { useAuthStore } from '../../core/auth/authStore';
import { useTranslation } from 'react-i18next';
import { useLanguageStore } from '../../i18n/languageStore';
import { pushNotificationService } from '../../core/services/pushNotificationService';
import { deviceService } from '../../core/services/deviceService';
import { AppColors } from '../../shared/theme/colors';
import { getSystemConfig } from '../../core/config/systemConfig';
import { getAuthHeaders } from '../../core/api/getAuthToken';
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
import { LegalPage } from './components/LegalPage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIAPStore } from '../../core/iap/iapStore';
import { IAP_PRODUCT_IDS, getProductId } from '../../core/iap/iapConstants';

interface SystemStatus {
  tokens: {
    used: number;
    limit: number;
    percent: number;
    hourly: number[];
  };
  previews: {
    active: number;
    limit: number;
    percent: number;
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.84;
const GAP = 12;
const SNAP_INTERVAL = CARD_WIDTH + GAP;
const SIDE_INSET = (SCREEN_WIDTH - CARD_WIDTH) / 2;

// Components extracted to separate files

export const SettingsScreen = ({ onClose, initialShowPlans = false, initialPlanIndex = 0 }: Props) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
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
  const [currentPlan, setCurrentPlan] = useState<'free' | 'go' | 'starter' | 'pro' | 'team'>(user?.plan || 'free');
  const [visiblePlanIndex, setVisiblePlanIndex] = useState(initialPlanIndex);
  const planScrollRef = useRef<ScrollView>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const { products: iapProducts, currentProductId, isPurchasing, isRestoring, purchase: iapPurchase, restorePurchases } = useIAPStore();
  const [showEditName, setShowEditName] = useState(false);
  const [showLegal, setShowLegal] = useState<'privacy' | 'terms' | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [deviceModelName, setDeviceModelName] = useState<string>('');

  // Keep currentPlan in sync with auth store user plan
  useEffect(() => {
    if (user?.plan) {
      setCurrentPlan(user.plan);
    }
  }, [user?.plan]);

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
      const response = await fetch(`${apiUrl}/stats/system-status?userId=${encodeURIComponent(userId)}&planId=${encodeURIComponent(currentPlan)}`, {
        headers: authHeaders,
      });
      const data = await response.json();
      setSystemStatus(data);

      // Fetch budget status
      const budgetResponse = await fetch(`${apiUrl}/ai/budget/${userId}?planId=${currentPlan}`, {
        headers: authHeaders,
      });
      const budgetData = await budgetResponse.json();
      if (budgetData.success) {
        setBudgetStatus(budgetData);
      }
    } catch (error) {
      console.error('Error fetching system status:', error);
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
              await gitAccountService.deleteAccount(account, userId);
              loadAccounts();
            } catch (error) {
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
              `Passa a ${name}`,
              `Vuoi attivare il piano ${name} (${billingCycle})?`,
              [
                { text: 'Annulla', style: 'cancel' },
                { text: 'Conferma', onPress: () => setCurrentPlan(planId) }
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
            <Text style={styles.popularBadgeText}>CONSIGLIATO</Text>
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
              <Text style={[styles.currentBadgeText, { color }]}>ATTIVO</Text>
            </BlurView>
          )}
        </View>

        <View style={styles.priceContainer}>
          <Text style={styles.planPrice}>{price}</Text>
          <Text style={styles.priceSubtext}>{billingCycle === 'monthly' ? '/mese' : '/anno'}</Text>
          {billingCycle === 'yearly' && planId !== 'free' && (
            <View style={styles.discountTag}>
              <Text style={styles.discountText}>RISPARMIA 20%</Text>
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
            {isCurrent ? 'Piano Attuale' : `Attiva ${name}`}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderPlanSelection = () => {
    // Get localized prices from App Store (fallback to hardcoded)
    const getPrice = (productId: string, fallback: string): string => {
      const product = iapProducts.find(p => p.productId === productId);
      return product?.localizedPrice || fallback;
    };

    const plans = [
      {
        id: 'free',
        name: 'Starter',
        price: '€0',
        description: 'Per chi vuole esplorare le basi.',
        features: ['3 progetti + 2 clonati', '5 preview al mese', 'Budget AI base', '1GB Storage Cloud'],
        color: '#94A3B8'
      },
      {
        id: 'go',
        name: 'Go',
        price: billingCycle === 'monthly'
          ? getPrice(IAP_PRODUCT_IDS.GO_MONTHLY, '€22.99')
          : getPrice(IAP_PRODUCT_IDS.GO_YEARLY, '€19.17'),
        description: 'Per chi vuole creare sul serio.',
        features: ['10 progetti + 5 clonati', '20 preview al mese', 'Budget AI potenziato', '5GB Storage Cloud', 'Supporto email'],
        color: AppColors.primary,
        isPopular: true
      },
      {
        id: 'pro',
        name: 'Pro',
        price: billingCycle === 'monthly'
          ? getPrice(IAP_PRODUCT_IDS.PRO_MONTHLY, '€39.99')
          : getPrice(IAP_PRODUCT_IDS.PRO_YEARLY, '€33.33'),
        description: 'Potenza massima per sviluppatori.',
        features: ['50 progetti + 25 clonati', 'Preview illimitate', 'Budget AI illimitato', '10GB Storage Cloud', 'Supporto prioritario'],
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
        <LinearGradient colors={['#0A0A0C', '#0A0A0C']} style={StyleSheet.absoluteFill} />

        {/* Background is uniform #0A0A0C via LinearGradient */}

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
          <Text style={styles.headerTitleSmall}>Upgrade Plan</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          <Animated.View style={[styles.planSelectionHero, {
            opacity: planHeaderAnim,
            transform: [{ translateY: planHeaderAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          }]}>
            <Text style={styles.plansMainTitle}>Eleva il tuo Sviluppo</Text>
            <Text style={styles.plansSubtitleSmall}>Scatena la potenza dell'AI nei tuoi progetti con i piani Drape.</Text>
          </Animated.View>

          {/* Billing Switcher */}
          <Animated.View style={[styles.pricingToggleContainer, {
            opacity: planToggleAnim,
            transform: [{ translateY: planToggleAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          }]}>
            <TouchableOpacity
              style={[styles.pricingOption, billingCycle === 'monthly' && styles.pricingOptionActive]}
              onPress={() => setBillingCycle('monthly')}
            >
              <Text style={[styles.pricingOptionText, billingCycle === 'monthly' && styles.pricingOptionTextActive]}>Mensile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pricingOption, billingCycle === 'yearly' && styles.pricingOptionActive]}
              onPress={() => setBillingCycle('yearly')}
            >
              <Text style={[styles.pricingOptionText, billingCycle === 'yearly' && styles.pricingOptionTextActive]}>Annuale</Text>
              <View style={styles.yearlySavings}>
                <Text style={styles.yearlySavingsText}>-20%</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={{
            opacity: planCardsAnim,
            transform: [
              { translateY: planCardsAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
              { scale: planCardsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
            ],
          }}>
          <ScrollView
            ref={planScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP_INTERVAL}
            snapToAlignment="start"
            decelerationRate="fast"
            contentContainerStyle={styles.plansScrollContent}
            scrollEventThrottle={16}
            onLayout={() => {
              if (initialPlanIndex > 0 && planScrollRef.current) {
                setTimeout(() => {
                  planScrollRef.current?.scrollTo({ x: initialPlanIndex * SNAP_INTERVAL, animated: false });
                }, 50);
              }
            }}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const index = Math.round(x / SNAP_INTERVAL);
              if (index >= 0 && index <= 2 && index !== visiblePlanIndex) {
                setVisiblePlanIndex(index);
              }
            }}
          >
            {plans.map((plan, idx) => {
              // "Piano Attuale" only if exact product matches (plan + billing cycle)
              const isExactCurrent = plan.id === 'free'
                ? (currentPlan === 'free' || currentPlan === 'starter')
                : currentProductId === getProductId(plan.id as 'go' | 'pro', billingCycle);

              return (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCardNew,
                  visiblePlanIndex === idx && { borderColor: `${plan.color}40`, backgroundColor: 'rgba(255,255,255,0.04)' }
                ]}
                activeOpacity={0.9}
                onPress={() => {
                  if (!isExactCurrent && plan.id !== 'free' && !isPurchasing) {
                    iapPurchase(plan.id as 'go' | 'pro', billingCycle);
                  }
                }}
              >
                {plan.isPopular && (
                  <LinearGradient
                    colors={[plan.color, '#F472B6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.featuredBadge}
                  >
                    <Text style={styles.featuredBadgeText}>CONSIGLIATO</Text>
                  </LinearGradient>
                )}

                <View style={styles.planHeaderNew}>
                  <View>
                    <Text style={styles.planNameSmall}>{plan.name}</Text>
                    <Text style={styles.planDescriptionSmall}>{plan.description}</Text>
                  </View>
                  {isExactCurrent && (
                    <View style={[styles.activeIndicator, { backgroundColor: `${plan.color}20` }]}>
                      <Ionicons name="checkmark" size={12} color={plan.color} />
                    </View>
                  )}
                </View>

                <View style={styles.priceRow}>
                  <Text style={styles.priceTextLarge}>{plan.price}</Text>
                  <Text style={styles.pricePeriod}>/mese</Text>
                </View>

                <View style={styles.planDividerNew} />

                <View style={styles.featuresList}>
                  {plan.features.map((f, i) => (
                    <View key={i} style={styles.featureItemNew}>
                      <View style={[styles.featureMark, { backgroundColor: visiblePlanIndex === idx ? plan.color : 'rgba(255,255,255,0.2)' }]} />
                      <Text style={styles.featureLabel}>{f}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[
                    styles.planActionBtn,
                    isExactCurrent
                      ? { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }
                      : { backgroundColor: plan.color },
                    isPurchasing && plan.id !== 'free' && !isExactCurrent && { opacity: 0.6 },
                  ]}
                  disabled={isExactCurrent || plan.id === 'free' || isPurchasing}
                  onPress={() => {
                    if (plan.id !== 'free' && !isPurchasing) {
                      iapPurchase(plan.id as 'go' | 'pro', billingCycle);
                    }
                  }}
                >
                  <Text style={[styles.planActionText, isExactCurrent && { color: 'rgba(255,255,255,0.4)' }]}>
                    {isExactCurrent ? 'Piano Attuale' : plan.id === 'free' ? 'Piano Gratuito' : `Attiva ${plan.name}`}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
              );
            })}
          </ScrollView>
          </Animated.View>

          {/* Dots */}
          <Animated.View style={[styles.dotsRow, {
            opacity: planFooterAnim,
          }]}>
            {plans.map((_, i) => (
              <View key={i} style={[styles.planDot, visiblePlanIndex === i && styles.planDotActive]} />
            ))}
          </Animated.View>

          <Animated.View style={{ opacity: planFooterAnim, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={restorePurchases}
              disabled={isRestoring}
              style={{ paddingVertical: 12 }}
            >
              <Text style={{ color: AppColors.primary, fontSize: 13, fontWeight: '600' }}>
                {isRestoring ? 'Ripristino in corso...' : 'Ripristina Acquisti'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.legalNotice}>
              Il pagamento verrà addebitato sul tuo account Apple ID alla conferma dell'acquisto. L'abbonamento si rinnova automaticamente a meno che non venga disattivato almeno 24 ore prima della scadenza del periodo corrente. Puoi gestire e cancellare i tuoi abbonamenti nelle Impostazioni del tuo account Apple ID.
            </Text>
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => setShowLegal('privacy')}>
                <Text style={styles.legalLinkText}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={styles.legalLinkSeparator}>  ·  </Text>
              <TouchableOpacity onPress={() => setShowLegal('terms')}>
                <Text style={styles.legalLinkText}>Termini di Servizio</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </Animated.View>
    );
  };

  const renderResourceUsage = () => {
    const activeColor = AppColors.primary;

    // Budget data
    const spentEur = budgetStatus?.usage.spentEur || 0;
    const budgetEur = budgetStatus?.plan.monthlyBudgetEur || 2.50;
    const remainingEur = budgetStatus?.usage.remainingEur || budgetEur;
    const percentUsed = budgetStatus?.usage.percentUsed || 0;
    const planName = budgetStatus?.plan.name || 'Free';

    // Show more decimals for small amounts so users can see spending
    const formatEur = (amount: number) => {
      if (amount > 0 && amount < 0.01) return `€${amount.toFixed(4)}`;
      return `€${amount.toFixed(2)}`;
    };
    // Get color based on usage
    const getBudgetColor = () => {
      if (percentUsed >= 90) return '#F87171'; // Red
      if (percentUsed >= 70) return '#FBBF24'; // Yellow
      return '#6366F1'; // Indigo/blue like Claude
    };

    const daysLeft = Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()));

    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0A0A0C', '#0A0A0C']} style={StyleSheet.absoluteFill} />

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
          <Text style={styles.headerTitleSmall}>Utilizzo</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* Budget Card - Claude style: clean bar + percentage */}
          <BlurView intensity={30} tint="dark" style={styles.mainMonitorCard}>
            <Text style={styles.monitorTitle}>Budget AI</Text>
            <Text style={[styles.monitorSub, { marginBottom: 20 }]}>Piano {planName} · si resetta tra {daysLeft}g</Text>

            {/* Clean Progress Bar */}
            <View style={styles.budgetProgressContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.budgetProgressBg, { flex: 1 }]}>
                  <View
                    style={[styles.budgetProgressFill, {
                      width: `${Math.min(percentUsed, 100)}%`,
                      backgroundColor: getBudgetColor(),
                    }]}
                  />
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500', minWidth: 65 }}>
                  {percentUsed}% usato
                </Text>
              </View>
            </View>
          </BlurView>

          {/* System Resources */}
          <Text style={styles.detailSectionTitle}>Risorse Sistema</Text>

          <View style={styles.hudGridRefined}>
            <View style={styles.usageGridRow}>
              <BlurView intensity={20} tint="dark" style={styles.usageCardRefinedHalf}>
                <Ionicons name="eye-outline" size={18} color="#34D399" style={{ marginBottom: 16 }} />
                <View style={styles.usageTextRow}>
                  <Text style={styles.usageNameMini}>Anteprime</Text>
                  <Text style={styles.usagePercent}>{systemStatus?.previews.percent || 0}%</Text>
                </View>
                <View style={styles.miniBarBg}>
                  <View style={[styles.miniBarFill, { width: `${systemStatus?.previews.percent || 0}%`, backgroundColor: '#34D399' }]} />
                </View>
                <Text style={styles.usageSubtext}>{systemStatus?.previews.active || 0} / {systemStatus?.previews.limit || 10} attive</Text>
              </BlurView>

              <BlurView intensity={20} tint="dark" style={styles.usageCardRefinedHalf}>
                <Ionicons name="folder-outline" size={18} color="#60A5FA" style={{ marginBottom: 16 }} />
                <View style={styles.usageTextRow}>
                  <Text style={styles.usageNameMini}>Progetti</Text>
                  <Text style={styles.usagePercent}>{systemStatus?.projects.percent || 0}%</Text>
                </View>
                <View style={styles.miniBarBg}>
                  <View style={[styles.miniBarFill, { width: `${systemStatus?.projects.percent || 0}%`, backgroundColor: '#60A5FA' }]} />
                </View>
                <Text style={styles.usageSubtext}>{systemStatus?.projects.active || 0} / {systemStatus?.projects.limit || 5} attivi</Text>
              </BlurView>
            </View>
          </View>

          <TouchableOpacity
            style={styles.premiumBanner}
            onPress={() => {
              setShowResourceUsage(false);
              setShowPlanSelection(true);
            }}
          >
            <LinearGradient
              colors={['#1e1e20', '#121214']}
              style={styles.premiumBannerGradient}
            >
              <View style={styles.premiumIconBox}>
                <Ionicons name="diamond" size={20} color={AppColors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.premiumTitle}>Passa a Go</Text>
                <Text style={styles.premiumSub}>5 progetti, 20 preview/mese e budget AI raddoppiato.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.2)" />
            </LinearGradient>
          </TouchableOpacity>
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
      <LinearGradient
        colors={['#0A0A0C', '#0A0A0C']}
        style={StyleSheet.absoluteFill}
      />

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
          onEditPress={() => setShowEditName(true)}
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
          onPlanPress={() => setShowPlanSelection(true)}
          onBudgetPress={() => setShowResourceUsage(true)}
          t={t}
        />

        {/* Appearance Section */}
        <AppearanceSection
          language={language}
          loading={loading}
          onLanguageChange={setAppLanguage}
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
          onOperationsChange={(v) => { setNotifOperations(v); updateNotifPreference('operations', v); }}
          onGithubChange={(v) => { setNotifGithub(v); updateNotifPreference('github', v); }}
          onReengagementChange={(v) => { setNotifReengagement(v); updateNotifPreference('reengagement', v); }}
          t={t}
        />

        {/* Info Section */}
        <InfoSection
          loading={loading}
          t={t}
          onOpenTerms={() => setShowLegal('terms')}
          onOpenPrivacy={() => setShowLegal('privacy')}
        />

        {/* Device Section */}
        <DeviceSection
          deviceModelName={deviceModelName}
          currentDeviceId={currentDeviceId}
          loading={loading}
          t={t}
        />

        {/* Account Actions (Logout) */}
        <AccountActionsSection
          userEmail={user?.email}
          loading={loading}
          onLogout={() => Alert.alert(t('logout.title'), t('logout.confirm'), [
            { text: t('common:cancel'), style: 'cancel' },
            {
              text: t('logout.button'), style: 'destructive', onPress: async () => {
                try {
                  await logout();
                  onClose();
                } catch (error) {
                  Alert.alert(t('common:error'), t('logout.error'));
                }
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
        onClose={() => setShowEditName(false)}
        onSave={(newName) => useAuthStore.getState().updateDisplayName(newName)}
        t={t}
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
    backgroundColor: '#0A0A0C',
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
  // Plans Refactor
  planBgGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 400,
    backgroundColor: `${AppColors.primary}08`,
    opacity: 0.5,
  },
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
    marginTop: 10,
    marginBottom: 24,
  },
  plansMainTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  plansSubtitleSmall: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
    lineHeight: 18,
  },
  pricingToggleContainer: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 3,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  pricingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 11,
    gap: 6,
  },
  pricingOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pricingOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
  },
  pricingOptionTextActive: {
    color: '#fff',
  },
  yearlySavings: {
    backgroundColor: `${AppColors.primary}20`,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  yearlySavingsText: {
    fontSize: 9,
    fontWeight: '900',
    color: AppColors.primary,
  },
  plansScrollContent: {
    paddingLeft: SIDE_INSET,
    paddingRight: SIDE_INSET - GAP,
  },
  planCardNew: {
    width: CARD_WIDTH,
    marginRight: GAP,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  featuredBadge: {
    position: 'absolute',
    top: 0,
    right: 30,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  featuredBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  planHeaderNew: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  planNameSmall: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  planDescriptionSmall: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    maxWidth: '85%',
  },
  activeIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 4,
  },
  priceTextLarge: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  pricePeriod: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.25)',
    fontWeight: '600',
  },
  planDividerNew: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 20,
  },
  featuresList: {
    gap: 12,
    marginBottom: 24,
  },
  featureItemNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureMark: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  featureLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  planActionBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    marginBottom: 10,
  },
  planDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  planDotActive: {
    backgroundColor: AppColors.primary,
    width: 12,
  },
  legalNotice: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 30,
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
    marginTop: 1,
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
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  premiumBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  premiumIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  premiumSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  // Budget styles
  budgetProgressContainer: {
    marginVertical: 20,
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
