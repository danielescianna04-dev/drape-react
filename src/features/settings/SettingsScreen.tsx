import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Image,
  Animated,
  Linking,
  Alert,
  Dimensions,
  PanResponder,
  Modal,
  TextInput,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle, Rect, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../core/git/gitAccountService';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { useAuthStore } from '../../core/auth/authStore';
import { useTranslation } from 'react-i18next';
import { useLanguageStore } from '../../i18n/languageStore';
import { LANGUAGES, LanguageCode } from '../../i18n';
import { pushNotificationService } from '../../core/services/pushNotificationService';
import { deviceService } from '../../core/services/deviceService';
import { AppColors } from '../../shared/theme/colors';
import { getSystemConfig } from '../../core/config/systemConfig';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { AddGitAccountModal } from './components/AddGitAccountModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

interface SettingItemProps {
  icon: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
  isLast?: boolean;
}

const SettingItem = ({ icon, iconColor, title, subtitle, onPress, rightElement, showChevron = true, isLast }: SettingItemProps) => (
  <TouchableOpacity
    style={[styles.settingItem, isLast && { borderBottomWidth: 0 }]}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress}
  >
    <View style={styles.settingIconWrapper}>
      <Ionicons name={icon as any} size={22} color={iconColor || AppColors.primary} />
    </View>
    <View style={styles.settingContent}>
      <Text style={styles.settingTitle}>{title}</Text>
      {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
    </View>
    {rightElement || (showChevron && onPress && (
      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.15)" />
    ))}
  </TouchableOpacity>
);

// Glass Card wrapper - uses LiquidGlass on iOS 26+, dark View on older versions
const GlassCard = ({ children, style }: { children: React.ReactNode; style?: any }) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={[styles.glassCardLiquid, style]} interactive={true} effect="regular" colorScheme="dark">
        {children}
      </LiquidGlassView>
    );
  }
  // Fallback: simple dark card without blur for cleaner look
  return (
    <View style={[styles.sectionCardWrap, styles.sectionCardDark, style]}>
      {children}
    </View>
  );
};

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
  const [currentPlan, setCurrentPlan] = useState<'free' | 'go' | 'pro' | 'max'>(user?.plan || 'free');
  const [visiblePlanIndex, setVisiblePlanIndex] = useState(initialPlanIndex);
  const planScrollRef = useRef<ScrollView>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [showEditName, setShowEditName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
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

  const renderAccountCard = (account: GitAccount) => {
    const providerConfig = GIT_PROVIDERS.find(p => p.id === account.provider);
    const iconName = providerConfig?.icon || 'git-branch';
    const providerColor = providerConfig?.color || '#888';

    return (
      <View key={account.id} style={[styles.accountCard, accounts.indexOf(account) === accounts.length - 1 && { borderBottomWidth: 0 }]}>
        {account.avatarUrl ? (
          <Image source={{ uri: account.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: providerColor }]}>
            <Ionicons name={iconName as any} size={18} color="#fff" />
          </View>
        )}
        <View style={styles.accountInfo}>
          <View style={styles.accountNameRow}>
            <Text style={styles.accountName} numberOfLines={1} ellipsizeMode="tail">
              {account.username}
            </Text>
            <View style={styles.providerBadge}>
              <Text style={styles.providerBadgeText}>
                {providerConfig?.name || account.provider}
              </Text>
            </View>
          </View>
          {account.email && (
            <Text style={styles.accountEmail} numberOfLines={1}>
              {account.email}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDeleteAccount(account)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={18} color="rgba(255, 77, 77, 0.8)" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderSkeletonCard = (index: number) => {
    const shimmerOpacity = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.7],
    });

    return (
      <View key={`skeleton-${index}`} style={styles.accountCard}>
        <Animated.View style={[styles.skeletonAvatar, { opacity: shimmerOpacity }]} />
        <View style={styles.accountInfo}>
          <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
          <Animated.View style={[styles.skeletonSubtitle, { opacity: shimmerOpacity }]} />
        </View>
      </View>
    );
  };

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
    const plans = [
      {
        id: 'free',
        name: 'Starter',
        price: '€0',
        description: 'Per chi vuole esplorare le basi.',
        features: ['2 progetti + 1 clonato', '5 preview al mese', 'Budget AI base', '500MB Storage Cloud'],
        color: '#94A3B8'
      },
      {
        id: 'go',
        name: 'Go',
        price: billingCycle === 'monthly' ? '€23.99' : '€19.99',
        description: 'Per chi vuole creare sul serio.',
        features: ['5 progetti + 5 clonati', '20 preview al mese', 'Budget AI potenziato', '2GB Storage Cloud', 'Supporto email'],
        color: AppColors.primary,
        isPopular: true
      },
      {
        id: 'pro',
        name: 'Pro',
        price: billingCycle === 'monthly' ? '€49.99' : '€39.99',
        description: 'Potenza massima per sviluppatori.',
        features: ['Progetti illimitati', 'Preview illimitate', 'Budget AI illimitato', '10GB Storage Cloud', 'Supporto prioritario'],
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
            {plans.map((plan, idx) => (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCardNew,
                  visiblePlanIndex === idx && { borderColor: `${plan.color}40`, backgroundColor: 'rgba(255,255,255,0.04)' }
                ]}
                activeOpacity={0.9}
                onPress={() => {
                  if (currentPlan !== plan.id) {
                    Alert.alert(
                      'Cambio Piano',
                      `Vuoi passare al piano ${plan.name}?`,
                      [
                        { text: 'Annulla', style: 'cancel' },
                        { text: 'Conferma', onPress: () => setCurrentPlan(plan.id as any) }
                      ]
                    );
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
                  {currentPlan === plan.id && (
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

                <View style={[
                  styles.planActionBtn,
                  currentPlan === plan.id ? { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' } : { backgroundColor: plan.color }
                ]}>
                  <Text style={[styles.planActionText, currentPlan === plan.id && { color: 'rgba(255,255,255,0.4)' }]}>
                    {currentPlan === plan.id ? 'Piano Attuale' : `Attiva ${plan.name}`}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
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

          <Animated.Text style={[styles.legalNotice, {
            opacity: planFooterAnim,
          }]}>
            Transazioni sicure via Stripe. Gestione abbonamento semplice e veloce dalle impostazioni.
          </Animated.Text>
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
        {user && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setEditNameValue(user.displayName || '');
              setShowEditName(true);
            }}
          >
            <GlassCard style={styles.profileBlur} key={loading ? 'loading-profile' : 'loaded-profile'}>
              <View style={styles.profileSection}>
                <View style={styles.profileAvatarContainer}>
                  <LinearGradient
                    colors={[AppColors.primary, AppColors.primaryShade]}
                    style={styles.profileAvatar}
                  >
                    <Text style={styles.profileAvatarText}>
                      {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  </LinearGradient>
                </View>
                <View style={styles.profileInfo}>
                  <View style={styles.profileNameRow}>
                    <Text style={styles.profileName}>{user.displayName || t('profile.defaultName')}</Text>
                    <View style={[styles.planBadge, { backgroundColor: currentPlan === 'free' ? 'rgba(148,163,184,0.2)' : currentPlan === 'pro' ? `${AppColors.primary}20` : '#F472B620' }]}>
                      <Text style={[styles.planBadgeText, { color: currentPlan === 'free' ? '#94A3B8' : currentPlan === 'pro' ? AppColors.primary : '#F472B6' }]}>
                        {currentPlan.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.profileEmail}>{user.email}</Text>
                </View>
                <View style={styles.editProfileBtn}>
                  <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.6)" />
                </View>
              </View>
            </GlassCard>
          </TouchableOpacity>
        )}

        {/* Account Git Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('gitAccounts.title')}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.6}
            >
              <Ionicons name="add" size={20} color={AppColors.primary} />
              <Text style={styles.addButtonText}>{t('gitAccounts.addAccount')}</Text>
            </TouchableOpacity>
          </View>

          <GlassCard>
            <View style={styles.sectionCard}>
              {loading ? (
                <>
                  {[0, 1].map(renderSkeletonCard)}
                </>
              ) : accounts.length > 0 ? (
                accounts.map(renderAccountCard)
              ) : (
                <View style={styles.emptyAccounts}>
                  <Ionicons name="git-network-outline" size={32} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyText}>{t('gitAccounts.noAccounts')}</Text>
                  <Text style={styles.emptySubtext}>
                    {t('gitAccounts.connectDescription')}
                  </Text>
                </View>
              )}
            </View>
          </GlassCard>
        </View>

        {/* Abbonamento & Utilizzo Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('subscription.title')}</Text>
          <GlassCard key={loading ? 'loading-sub' : 'loaded-sub'}>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="card-outline"
                iconColor="#60A5FA"
                title={t('subscription.currentPlan')}
                subtitle={currentPlan === 'free' ? 'Starter' : currentPlan === 'go' ? 'Go' : currentPlan === 'pro' ? 'Pro' : currentPlan.toUpperCase()}
                onPress={() => setShowPlanSelection(true)}
              />
              <SettingItem
                icon="wallet-outline"
                iconColor="#34D399"
                title={t('subscription.aiBudget')}
                subtitle={budgetStatus ? `${budgetStatus.usage.percentUsed}% ${t('subscription.usage')}` : t('subscription.loading')}
                onPress={() => setShowResourceUsage(true)}
                isLast
              />
            </View>
          </GlassCard>
        </View>

        {/* Aspetto Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('appearance.title')}</Text>
          <GlassCard key={loading ? 'loading-app' : 'loaded-app'}>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="language-outline"
                iconColor="#60A5FA"
                title={t('language.title')}
                subtitle={LANGUAGES[language].nativeName}
                showChevron={false}
                rightElement={
                  <View style={styles.languageSwitcher}>
                    {(Object.keys(LANGUAGES) as LanguageCode[]).map((langCode) => (
                      <TouchableOpacity
                        key={langCode}
                        style={[
                          styles.languageOption,
                          language === langCode && styles.languageOptionActive
                        ]}
                        onPress={() => setAppLanguage(langCode)}
                      >
                        <Text style={[
                          styles.languageOptionText,
                          language === langCode && styles.languageOptionTextActive
                        ]}>
                          {LANGUAGES[langCode].flag}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                }
                isLast
              />
            </View>
          </GlassCard>
        </View>

        {/* Notifiche Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications.title')}</Text>
          <GlassCard key={loading ? 'loading-notif' : 'loaded-notif'}>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="notifications-outline"
                iconColor="#FBBF24"
                title={t('notifications.pushNotifications')}
                subtitle={t('notifications.pushDesc')}
                showChevron={false}
                rightElement={
                  <Switch
                    value={notifications}
                    onValueChange={setNotifications}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: AppColors.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor="rgba(255,255,255,0.05)"
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                }
              />
              <SettingItem
                icon="build-outline"
                iconColor="#34D399"
                title={t('notifications.operations')}
                subtitle={t('notifications.operationsDesc')}
                showChevron={false}
                rightElement={
                  <Switch
                    value={notifOperations}
                    onValueChange={(v) => { setNotifOperations(v); updateNotifPreference('operations', v); }}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: AppColors.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor="rgba(255,255,255,0.05)"
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                }
              />
              <SettingItem
                icon="logo-github"
                iconColor="#A78BFA"
                title={t('notifications.github')}
                subtitle={t('notifications.githubDesc')}
                showChevron={false}
                rightElement={
                  <Switch
                    value={notifGithub}
                    onValueChange={(v) => { setNotifGithub(v); updateNotifPreference('github', v); }}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: AppColors.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor="rgba(255,255,255,0.05)"
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                }
              />
              <SettingItem
                icon="time-outline"
                iconColor="#60A5FA"
                title={t('notifications.reminders')}
                subtitle={t('notifications.remindersDesc')}
                showChevron={false}
                rightElement={
                  <Switch
                    value={notifReengagement}
                    onValueChange={(v) => { setNotifReengagement(v); updateNotifPreference('reengagement', v); }}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: AppColors.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor="rgba(255,255,255,0.05)"
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                }
                isLast
              />
            </View>
          </GlassCard>
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('info.title')}</Text>
          <GlassCard key={loading ? 'loading-info' : 'loaded-info'}>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="information-circle-outline"
                iconColor="#94A3B8"
                title={t('info.version')}
                subtitle={Constants.expoConfig?.version || '1.0.0'}
                showChevron={false}
              />
              <SettingItem
                icon="document-text-outline"
                iconColor="#94A3B8"
                title={t('info.termsOfService')}
                onPress={() => Linking.openURL('https://drape.app/terms')}
              />
              <SettingItem
                icon="shield-checkmark-outline"
                iconColor="#94A3B8"
                title={t('info.privacyPolicy')}
                onPress={() => Linking.openURL('https://drape.app/privacy')}
                isLast
              />
            </View>
          </GlassCard>
        </View>

        {/* Device Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('device.title')}</Text>
          <GlassCard key={loading ? 'loading-device' : 'loaded-device'}>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="phone-portrait-outline"
                iconColor="#60A5FA"
                title={deviceModelName || t('device.thisDevice')}
                subtitle={currentDeviceId ? `${currentDeviceId.substring(0, 20)}...` : t('subscription.loading')}
                showChevron={false}
              />
              <SettingItem
                icon="shield-checkmark-outline"
                iconColor="#34D399"
                title={t('device.activeDevice')}
                subtitle={t('device.onlyThisDevice')}
                showChevron={false}
                isLast
              />
            </View>
          </GlassCard>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <GlassCard key={loading ? 'loading-danger' : 'loaded-danger'}>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="log-out-outline"
                iconColor="#F87171"
                title={t('logout.title')}
                subtitle={user?.email || undefined}
                onPress={() => Alert.alert(t('logout.title'), t('logout.confirm'), [
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
                showChevron={false}
                isLast
              />
            </View>
          </GlassCard>
        </View>

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

      {/* Edit Name Modal */}
      <Modal
        visible={showEditName}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditName(false)}
      >
        <View style={styles.editNameOverlay}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={styles.editNameCard}
              interactive={true}
              effect="regular"
              colorScheme="dark"
            >
              <View style={styles.editNameInner}>
                <Ionicons name="person-circle-outline" size={36} color={AppColors.primary} style={{ marginBottom: 8 }} />
                <Text style={styles.editNameTitle}>{t('profile.editName')}</Text>
                <Text style={styles.editNameSubtitle}>{t('profile.enterName')}</Text>
                <View style={styles.editNameInputWrap}>
                  <TextInput
                    style={styles.editNameInput}
                    value={editNameValue}
                    onChangeText={setEditNameValue}
                    placeholder={t('profile.defaultName')}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    autoFocus
                    selectionColor={AppColors.primary}
                  />
                </View>
                <View style={styles.editNameButtons}>
                  <TouchableOpacity
                    style={styles.editNameBtn}
                    onPress={() => setShowEditName(false)}
                  >
                    <Text style={styles.editNameBtnTextCancel}>{t('common:cancel')}</Text>
                  </TouchableOpacity>
                  <LinearGradient
                    colors={[AppColors.primary, AppColors.primaryShade]}
                    style={styles.editNameBtnConfirm}
                  >
                    <TouchableOpacity
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => {
                        if (editNameValue.trim()) {
                          useAuthStore.getState().updateDisplayName(editNameValue.trim());
                        }
                        setShowEditName(false);
                      }}
                    >
                      <Text style={styles.editNameBtnTextConfirm}>{t('common:save')}</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              </View>
            </LiquidGlassView>
          ) : (
            <View style={[styles.editNameCard, { backgroundColor: '#1C1C1E' }]}>
              <View style={styles.editNameInner}>
                <Ionicons name="person-circle-outline" size={36} color={AppColors.primary} style={{ marginBottom: 8 }} />
                <Text style={styles.editNameTitle}>{t('profile.editName')}</Text>
                <Text style={styles.editNameSubtitle}>{t('profile.enterName')}</Text>
                <View style={styles.editNameInputWrap}>
                  <TextInput
                    style={styles.editNameInput}
                    value={editNameValue}
                    onChangeText={setEditNameValue}
                    placeholder={t('profile.defaultName')}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    autoFocus
                    selectionColor={AppColors.primary}
                  />
                </View>
                <View style={styles.editNameButtons}>
                  <TouchableOpacity
                    style={styles.editNameBtn}
                    onPress={() => setShowEditName(false)}
                  >
                    <Text style={styles.editNameBtnTextCancel}>{t('common:cancel')}</Text>
                  </TouchableOpacity>
                  <LinearGradient
                    colors={[AppColors.primary, AppColors.primaryShade]}
                    style={styles.editNameBtnConfirm}
                  >
                    <TouchableOpacity
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => {
                        if (editNameValue.trim()) {
                          useAuthStore.getState().updateDisplayName(editNameValue.trim());
                        }
                        setShowEditName(false);
                      }}
                    >
                      <Text style={styles.editNameBtnTextConfirm}>{t('common:save')}</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>
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
  section: {
    marginBottom: 24,
  },
  // User Profile
  profileBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 16,
  },
  profileAvatarContainer: {
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  profileAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  profileEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  editProfileBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: -0.3,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCardWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  sectionCardDark: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  glassCardLiquid: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sectionCard: {
    padding: 4,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
  },
  // Account cards
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  providerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  providerBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.7)',
  },
  accountEmail: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 1,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  emptyAccounts: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 10,
  },
  emptySubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  // Skeleton
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 14,
  },
  skeletonTitle: {
    width: '60%',
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  skeletonSubtitle: {
    width: '40%',
    height: 11,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Setting items
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  settingIconWrapper: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
  },
  settingSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    lineHeight: 16,
  },
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
    paddingHorizontal: 50,
    lineHeight: 16,
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
  editNameOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editNameCard: {
    width: 310,
    borderRadius: 20,
    overflow: 'hidden',
  },
  editNameInner: {
    padding: 24,
    alignItems: 'center',
  },
  editNameTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  editNameSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    marginBottom: 20,
  },
  editNameInputWrap: {
    width: '100%',
    marginBottom: 20,
  },
  editNameInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  editNameButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  editNameBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editNameBtnConfirm: {
    flex: 1,
    borderRadius: 12,
    height: 46,
  },
  editNameBtnTextCancel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
  },
  editNameBtnTextConfirm: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Language Switcher
  languageSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 2,
  },
  languageOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  languageOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  languageOptionText: {
    fontSize: 16,
    opacity: 0.5,
  },
  languageOptionTextActive: {
    opacity: 1,
  },
});
