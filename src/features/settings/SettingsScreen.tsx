import React, { useState, useEffect, useRef } from 'react';
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
import { AppColors } from '../../shared/theme/colors';
import { getSystemConfig } from '../../core/config/systemConfig';
import { AddGitAccountModal } from './components/AddGitAccountModal';

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
}

const SettingItem = ({ icon, iconColor, title, subtitle, onPress, rightElement, showChevron = true }: SettingItemProps) => (
  <TouchableOpacity
    style={styles.settingItem}
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
      <LiquidGlassView style={[styles.glassCardLiquid, style]} interactive={true} effect="clear" colorScheme="dark">
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

export const SettingsScreen = ({ onClose, initialShowPlans = false }: Props) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);

  const [accounts, setAccounts] = useState<GitAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPlanSelection, setShowPlanSelection] = useState(initialShowPlans);
  const [showResourceUsage, setShowResourceUsage] = useState(false);
  const [tokenTimeframe, setTokenTimeframe] = useState<'24h' | '7d' | '30d'>('24h');
  const [currentPlan, setCurrentPlan] = useState<'free' | 'pro' | 'max'>('free');
  const [visiblePlanIndex, setVisiblePlanIndex] = useState(0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const userId = user?.uid || useTerminalStore.getState().userId || 'anonymous';

  useEffect(() => {
    loadAccounts();
    fetchSystemStatus();

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

      // Fetch system status
      const response = await fetch(`${apiUrl}/stats/system-status`);
      const data = await response.json();
      setSystemStatus(data);

      // Fetch budget status
      const budgetResponse = await fetch(`${apiUrl}/ai/budget/${userId}?planId=${currentPlan}`);
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

  const handleDeleteAccount = (account: GitAccount) => {
    const providerConfig = GIT_PROVIDERS.find(p => p.id === account.provider);
    const providerName = providerConfig?.name || account.provider;

    Alert.alert(
      'Rimuovi Account',
      `Sei sicuro di voler rimuovere l'account ${account.username} (${providerName})?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: async () => {
            try {
              await gitAccountService.deleteAccount(account, userId);
              loadAccounts();
            } catch (error) {
              Alert.alert('Errore', 'Impossibile rimuovere l\'account');
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
      <View key={account.id} style={styles.accountCard}>
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
        features: ['AI Standard Models', '1 Progetto attivo', '500MB Storage Cloud', 'Community Support'],
        color: '#94A3B8'
      },
      {
        id: 'pro',
        name: 'Professional',
        price: billingCycle === 'monthly' ? '€19' : '€15',
        description: 'La scelta per sviluppatori seri.',
        features: ['AI Avanzata (Claude 3.5/GPT-4o)', 'Progetti Illimitati', '10GB Storage Cloud', 'Deep Research & Git Sync', 'Supporto Prioritario'],
        color: AppColors.primary,
        isPopular: true
      },
      {
        id: 'max',
        name: 'Enterprise',
        price: billingCycle === 'monthly' ? '€49' : '€39',
        description: 'Potenza massima per core-dev.',
        features: ['AI Senza Limiti di Token', 'VM ad Alte Performance', '100GB Storage Cloud', 'Custom Domains & API Access', 'Account Manager Dedicato'],
        color: '#F472B6'
      }
    ];

    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0A0A0C', '#0A0A0C']} style={StyleSheet.absoluteFill} />

        {/* Decorative Background Elements */}
        <View style={styles.planBgGlow} />

        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.backButtonCompact}
            onPress={() => {
              if (initialShowPlans) {
                onClose();
              } else {
                setShowPlanSelection(false);
              }
            }}
          >
            <BlurView intensity={20} tint="dark" style={styles.backButtonBlurCompact}>
              <Ionicons name="close" size={20} color="#fff" />
            </BlurView>
          </TouchableOpacity>
          <Text style={styles.headerTitleSmall}>Upgrade Plan</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          <View style={styles.planSelectionHero}>
            <Text style={styles.plansMainTitle}>Eleva il tuo Sviluppo</Text>
            <Text style={styles.plansSubtitleSmall}>Scatena la potenza dell'AI nei tuoi progetti con i piani Drape.</Text>
          </View>

          {/* Billing Switcher */}
          <View style={styles.pricingToggleContainer}>
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
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP_INTERVAL}
            snapToAlignment="start"
            decelerationRate="fast"
            contentContainerStyle={styles.plansScrollContent}
            scrollEventThrottle={16}
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

          {/* Dots */}
          <View style={styles.dotsRow}>
            {plans.map((_, i) => (
              <View key={i} style={[styles.planDot, visiblePlanIndex === i && styles.planDotActive]} />
            ))}
          </View>

          <Text style={styles.legalNotice}>
            Transazioni sicure via Stripe. Gestione abbonamento semplice e veloce dalle impostazioni.
          </Text>
        </ScrollView>
      </View>
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

    const budgetDisplay = `€${spentEur.toFixed(2)} / €${budgetEur.toFixed(2)}`;

    // Get color based on usage
    const getBudgetColor = () => {
      if (percentUsed >= 90) return '#F87171'; // Red
      if (percentUsed >= 70) return '#FBBF24'; // Yellow
      return '#34D399'; // Green
    };

    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0A0A0C', '#0A0A0C']} style={StyleSheet.absoluteFill} />

        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.backButtonCompact}
            onPress={() => setShowResourceUsage(false)}
          >
            <BlurView intensity={20} tint="dark" style={styles.backButtonBlurCompact}>
              <Ionicons name="close" size={20} color="#fff" />
            </BlurView>
          </TouchableOpacity>
          <Text style={styles.headerTitleSmall}>Budget AI</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* Budget Card - Main */}
          <BlurView intensity={30} tint="dark" style={styles.mainMonitorCard}>
            <View style={styles.monitorHeader}>
              <View>
                <Text style={styles.monitorTitle}>Budget Mensile</Text>
                <Text style={styles.monitorSub}>Piano {planName}</Text>
              </View>
              <View style={[styles.monitorValueBadge, { backgroundColor: `${getBudgetColor()}20` }]}>
                <Text style={[styles.monitorValueText, { color: getBudgetColor() }]}>{budgetDisplay}</Text>
              </View>
            </View>

            {/* Big Progress Bar */}
            <View style={styles.budgetProgressContainer}>
              <View style={styles.budgetProgressBg}>
                <LinearGradient
                  colors={[getBudgetColor(), `${getBudgetColor()}80`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.budgetProgressFill, { width: `${Math.min(percentUsed, 100)}%` }]}
                />
              </View>
              <View style={styles.budgetProgressLabels}>
                <Text style={styles.budgetProgressText}>€0</Text>
                <Text style={styles.budgetProgressText}>€{(budgetEur / 2).toFixed(2)}</Text>
                <Text style={styles.budgetProgressText}>€{budgetEur.toFixed(2)}</Text>
              </View>
            </View>

            {/* Budget Stats */}
            <View style={styles.budgetStatsRow}>
              <View style={styles.budgetStatItem}>
                <Text style={styles.budgetStatValue}>€{remainingEur.toFixed(2)}</Text>
                <Text style={styles.budgetStatLabel}>Rimanente</Text>
              </View>
              <View style={styles.budgetStatDivider} />
              <View style={styles.budgetStatItem}>
                <Text style={styles.budgetStatValue}>{percentUsed}%</Text>
                <Text style={styles.budgetStatLabel}>Utilizzato</Text>
              </View>
              <View style={styles.budgetStatDivider} />
              <View style={styles.budgetStatItem}>
                <Text style={styles.budgetStatValue}>{Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()))}g</Text>
                <Text style={styles.budgetStatLabel}>Al reset</Text>
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
                <Text style={styles.premiumTitle}>Passa a Professional</Text>
                <Text style={styles.premiumSub}>Sblocca progetti illimitati e accesso prioritario alla GPU.</Text>
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
    <View style={styles.container}>
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
            <LiquidGlassView style={styles.backButtonGlass} interactive={true} effect="clear" colorScheme="dark">
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </LiquidGlassView>
          ) : (
            <View style={styles.backButton}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Impostazioni</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* User Profile Section */}
        {user && (
          <GlassCard style={styles.profileBlur}>
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
                  <Text style={styles.profileName}>{user.displayName || 'Utente'}</Text>
                  <View style={[styles.planBadge, { backgroundColor: currentPlan === 'free' ? 'rgba(148,163,184,0.2)' : currentPlan === 'pro' ? `${AppColors.primary}20` : '#F472B620' }]}>
                    <Text style={[styles.planBadgeText, { color: currentPlan === 'free' ? '#94A3B8' : currentPlan === 'pro' ? AppColors.primary : '#F472B6' }]}>
                      {currentPlan.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.profileEmail}>{user.email}</Text>
              </View>
              <TouchableOpacity style={styles.editProfileBtn}>
                <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
          </GlassCard>
        )}

        {/* Account Git Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Account Git</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.6}
            >
              <Ionicons name="add" size={20} color={AppColors.primary} />
              <Text style={styles.addButtonText}>Aggiungi</Text>
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
                  <Text style={styles.emptyText}>Nessun account collegato</Text>
                  <Text style={styles.emptySubtext}>
                    Collega GitHub, GitLab, Bitbucket o altri
                  </Text>
                </View>
              )}
            </View>
          </GlassCard>
        </View>

        {/* Abbonamento & Utilizzo Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Abbonamento & Utilizzo</Text>
          <GlassCard>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="card-outline"
                iconColor="#60A5FA"
                title="Piano Attuale"
                subtitle={currentPlan.toUpperCase()}
                onPress={() => setShowPlanSelection(true)}
              />
              <SettingItem
                icon="wallet-outline"
                iconColor="#34D399"
                title="Budget AI"
                subtitle={budgetStatus ? `€${budgetStatus.usage.spentEur.toFixed(2)} / €${budgetStatus.plan.monthlyBudgetEur.toFixed(2)} (${budgetStatus.usage.percentUsed}% usato)` : 'Caricamento...'}
                onPress={() => setShowResourceUsage(true)}
              />
            </View>
          </GlassCard>
        </View>

        {/* Aspetto Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aspetto</Text>
          <GlassCard>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="moon-outline"
                iconColor="#A78BFA"
                title="Tema Scuro"
                subtitle="Usa il tema scuro dell'app"
                showChevron={false}
                rightElement={
                  <Switch
                    value={darkMode}
                    onValueChange={setDarkMode}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: AppColors.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor="rgba(255,255,255,0.05)"
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                }
              />
            </View>
          </GlassCard>
        </View>

        {/* Notifiche Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifiche</Text>
          <GlassCard>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="notifications-outline"
                iconColor="#FBBF24"
                title="Notifiche Push"
                subtitle="Ricevi notifiche sui progetti"
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
            </View>
          </GlassCard>
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informazioni</Text>
          <GlassCard>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="information-circle-outline"
                iconColor="#94A3B8"
                title="Versione"
                subtitle="1.0.0"
                showChevron={false}
              />
              <SettingItem
                icon="document-text-outline"
                iconColor="#94A3B8"
                title="Termini di Servizio"
                onPress={() => Linking.openURL('https://drape.app/terms')}
              />
              <SettingItem
                icon="shield-checkmark-outline"
                iconColor="#94A3B8"
                title="Privacy Policy"
                onPress={() => Linking.openURL('https://drape.app/privacy')}
              />
            </View>
          </GlassCard>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <GlassCard>
            <View style={styles.sectionCard}>
              <SettingItem
                icon="log-out-outline"
                iconColor="#F87171"
                title="Esci dall'account"
                subtitle={user?.email || undefined}
                onPress={() => Alert.alert('Esci', 'Sei sicuro di voler uscire dal tuo account?', [
                  { text: 'Annulla', style: 'cancel' },
                  {
                    text: 'Esci', style: 'destructive', onPress: async () => {
                      try {
                        await logout();
                        onClose();
                      } catch (error) {
                        Alert.alert('Errore', 'Impossibile effettuare il logout');
                      }
                    }
                  },
                ])}
                showChevron={false}
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
    </View>
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
    backgroundColor: 'rgba(20,20,22,0.9)',
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
    backgroundColor: 'rgba(20,20,22,0.9)',
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
    marginTop: 4,
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
});
