import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../../shared/theme/colors';
import { IAP_PRODUCT_IDS, getProductId } from '../../../core/iap/iapConstants';
import { useToastStore } from '../../../core/toast/toastStore';
import { tracciaAcquistiRipristinati, tracciaCicloFatturazioneCambiato, tracciaDocumentoLegaleVisto, tracciaPianoVisualizzato } from '../../../core/services/analyticsService';

export const SettingsPlanSelectionView = ({
  styles,
  insets,
  t,
  planExitAnim,
  planHeaderAnim,
  planToggleAnim,
  planCardsAnim,
  planFooterAnim,
  billingCycle,
  setBillingCycle,
  iapProducts,
  currentPlan,
  currentProductId,
  isPurchasing,
  iapPurchase,
  isRestoring,
  restorePurchases,
  handleClosePlans,
  setShowLegal,
}: any) => {
  const getCurrencySymbol = (currency?: string): string => {
    if (currency === 'EUR') return '€';
    if (currency === 'USD') return '$';
    if (currency === 'GBP') return '£';
    if (currency === 'JPY') return '¥';
    return currency || '€';
  };

  const getPrice = (productId: string, fallback: string): string => {
    const product = iapProducts.find((p: any) => p.productId === productId);
    return product?.localizedPrice || fallback;
  };

  const getIntroPrice = (productId: string): string | undefined => {
    const product = iapProducts.find((p: any) => p.productId === productId);
    if (!product?.introductoryPrice) return undefined;
    return `${getCurrencySymbol(product.currency)}${product.introductoryPrice}`;
  };

  const getTrialUnit = (period?: string): string | null => {
    if (!period) return null;
    const upper = period.toUpperCase();
    if (upper.includes('DAY') || upper.includes('P1D') || upper.includes('D')) return 'day';
    if (upper.includes('WEEK') || upper.includes('W')) return 'week';
    if (upper.includes('MONTH') || upper.includes('M')) return 'month';
    if (upper.includes('YEAR') || upper.includes('Y')) return 'year';
    return null;
  };

  const getTrialText = (productId: string): string | undefined => {
    const product = iapProducts.find((p: any) => p.productId === productId);
    if (!product?.introductoryPrice) return undefined;
    const introValue = Number(String(product.introductoryPrice).replace(',', '.'));
    if (!Number.isFinite(introValue) || introValue !== 0) return undefined;
    const count = product.introductoryPriceNumberOfPeriods;
    const unit = getTrialUnit(product.introductoryPriceSubscriptionPeriod);
    if (!count || !unit) return t('plans.freeTrialGeneric');
    if (unit === 'day') return t('plans.freeTrialDays', { count });
    if (unit === 'week') return t('plans.freeTrialWeeks', { count });
    if (unit === 'month') return t('plans.freeTrialMonths', { count });
    if (unit === 'year') return t('plans.freeTrialYears', { count });
    return t('plans.freeTrialGeneric');
  };

  const currentCyclePaidProduct = iapProducts.find((p: any) =>
    billingCycle === 'monthly'
      ? p.productId === IAP_PRODUCT_IDS.GO_MONTHLY || p.productId === IAP_PRODUCT_IDS.PRO_MONTHLY
      : p.productId === IAP_PRODUCT_IDS.GO_YEARLY || p.productId === IAP_PRODUCT_IDS.PRO_YEARLY,
  );

  const freePlanPrice = `${getCurrencySymbol(currentCyclePaidProduct?.currency)}0`;

  // Build plan feature list with the cycle-dependent "created projects" line on top.
  const cycleKey = billingCycle === 'yearly' ? 'projectsYearly' : 'projectsMonthly';
  const planFeatures = (planId: 'free' | 'go' | 'pro'): string[] => {
    const projectsLine = t(`plans.${planId}.${cycleKey}`);
    const rest = t(`plans.${planId}.features`, { returnObjects: true }) as string[];
    return [projectsLine, ...(Array.isArray(rest) ? rest : [])];
  };

  const plans = [
    {
      id: 'free',
      name: t('plans.free.name'),
      price: freePlanPrice,
      introPrice: undefined as string | undefined,
      description: t('plans.free.description'),
      features: planFeatures('free'),
      color: '#94A3B8',
    },
    {
      id: 'go',
      name: t('plans.go.name'),
      price: billingCycle === 'monthly' ? getPrice(IAP_PRODUCT_IDS.GO_MONTHLY, '€22.99') : getPrice(IAP_PRODUCT_IDS.GO_YEARLY, '€229.99'),
      introPrice: billingCycle === 'monthly' ? getIntroPrice(IAP_PRODUCT_IDS.GO_MONTHLY) : undefined,
      trialText: billingCycle === 'monthly' ? getTrialText(IAP_PRODUCT_IDS.GO_MONTHLY) : undefined,
      description: t('plans.go.description'),
      features: planFeatures('go'),
      color: AppColors.primary,
      isPopular: true,
    },
    {
      id: 'pro',
      name: t('plans.pro.name'),
      price: billingCycle === 'monthly' ? getPrice(IAP_PRODUCT_IDS.PRO_MONTHLY, '€39.99') : getPrice(IAP_PRODUCT_IDS.PRO_YEARLY, '€449.99'),
      introPrice: billingCycle === 'monthly' ? getIntroPrice(IAP_PRODUCT_IDS.PRO_MONTHLY) : undefined,
      trialText: billingCycle === 'monthly' ? getTrialText(IAP_PRODUCT_IDS.PRO_MONTHLY) : undefined,
      description: t('plans.pro.description'),
      features: planFeatures('pro'),
      color: '#F472B6',
    },
  ];

  return (
    <Animated.View style={[styles.container, { opacity: planExitAnim, transform: [{ scale: planExitAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} />
        <LinearGradient colors={['#0C0816', '#1E1040', '#0C0816']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.3 }]} />
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButtonCompact} onPress={handleClosePlans}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView key="plans-close-btn" style={styles.backButtonGlass} interactive={true} effect="regular" colorScheme="dark">
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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.plansContentContainer}>
        <Animated.View style={[styles.planSelectionHero, { opacity: planHeaderAnim, transform: [{ translateY: planHeaderAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
          <Text style={styles.plansMainTitle}>{t('plans.elevateTitle')}</Text>
          <Text style={styles.plansSubtitleSmall}>{t('plans.elevateDesc')}</Text>
        </Animated.View>

        <Animated.View style={[styles.pricingToggleContainer, { opacity: planToggleAnim, transform: [{ translateY: planToggleAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <TouchableOpacity style={[styles.pricingOption, billingCycle === 'monthly' && styles.pricingOptionActive]} onPress={() => { tracciaCicloFatturazioneCambiato('monthly'); setBillingCycle('monthly'); }}>
            <Text style={[styles.pricingOptionText, billingCycle === 'monthly' && styles.pricingOptionTextActive]}>{t('plans.monthly')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pricingOption, billingCycle === 'yearly' && styles.pricingOptionActive]} onPress={() => { tracciaCicloFatturazioneCambiato('yearly'); setBillingCycle('yearly'); }}>
            <Text style={[styles.pricingOptionText, billingCycle === 'yearly' && styles.pricingOptionTextActive]}>{t('plans.yearly')}</Text>
            <View style={styles.yearlySavings}>
              <Text style={styles.yearlySavingsText}>-20%</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[styles.plansVerticalList, { opacity: planCardsAnim, transform: [{ translateY: planCardsAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
          {plans.map((plan) => {
            const isExactCurrent = plan.id === 'free' ? currentPlan === 'free' : currentProductId ? currentProductId === getProductId(plan.id as 'go' | 'pro', billingCycle) : currentPlan === plan.id;
            const isPopular = !!plan.isPopular;
            const isFree = plan.id === 'free';

            return (
              <View key={plan.id} style={[styles.pvCardOuter, isPopular && styles.pvCardOuterPopular]}>
                {isPopular && (
                  <LinearGradient colors={[`${plan.color}50`, `${plan.color}15`, `${plan.color}30`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pvGlowBorder} />
                )}
                <View style={[styles.pvCard, isPopular && styles.pvCardPopular, isExactCurrent && !isPopular && { borderColor: `${plan.color}30` }]}>
                  <LinearGradient colors={[`${plan.color}${isPopular ? '18' : '0A'}`, 'transparent']} style={styles.pvCardGlow} />
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
                      {plan.trialText ? (
                        <View style={styles.pvTrialBlock}>
                          <Text style={[styles.pvTrialText, isPopular && { color: '#fff' }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                            {plan.trialText}
                          </Text>
                          <Text style={styles.pvTrialSubtext}>
                            {t('plans.thenPrice', { price: plan.price, period: billingCycle === 'monthly' ? t('plans.perMonth') : t('plans.perYear') })}
                          </Text>
                        </View>
                      ) : plan.introPrice ? (
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
                  <View style={styles.pvDivider} />
                  <View style={styles.pvFeatures}>
                    {plan.features.map((feature, i) => (
                      <View key={i} style={styles.pvFeatureRow}>
                        <Ionicons name="checkmark-circle" size={16} color={isPopular ? plan.color : 'rgba(255,255,255,0.25)'} />
                        <Text style={[styles.pvFeatureText, isPopular && { color: 'rgba(255,255,255,0.85)' }]}>{feature}</Text>
                      </View>
                    ))}
                  </View>
                  {!isFree && (
                    <TouchableOpacity
                      style={[
                        styles.pvCta,
                        isExactCurrent ? styles.pvCtaCurrent : isPopular ? [styles.pvCtaPopular, { backgroundColor: plan.color, shadowColor: plan.color }] : { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
                        isPurchasing && !isExactCurrent && { opacity: 0.6 },
                      ]}
                      disabled={isExactCurrent || isPurchasing}
                      onPress={() => {
                        if (!isPurchasing) {
                          tracciaPianoVisualizzato(`${plan.id}_${billingCycle}`);
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

        <Animated.View style={[styles.pvFooter, { opacity: planFooterAnim }]}>
          <Text style={styles.restoreCaption}>{t('plans.secureTransactions')}</Text>
          <TouchableOpacity
            onPress={async () => {
              tracciaAcquistiRipristinati();
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
          <Text style={styles.legalNotice}>{t('plans.legalNotice')}</Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => { tracciaDocumentoLegaleVisto('privacy'); setShowLegal('privacy'); }}>
              <Text style={styles.legalLinkText}>{t('plans.privacyPolicy')}</Text>
            </TouchableOpacity>
            <Text style={styles.legalLinkSeparator}>  ·  </Text>
            <TouchableOpacity onPress={() => { tracciaDocumentoLegaleVisto('terms'); setShowLegal('terms'); }}>
              <Text style={styles.legalLinkText}>{t('plans.termsOfService')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
};

export const SettingsResourceUsageView = ({
  styles,
  insets,
  t,
  budgetStatus,
  systemStatus,
  projectAiAnalytics,
  currentPlan,
  setShowResourceUsage,
  fetchSystemStatus,
  onOpenPlans,
}: any) => {
  const percentUsed = budgetStatus?.usage.percentUsed || 0;
  const planName = budgetStatus?.plan.name || 'Free';
  const getBudgetColor = () => {
    if (percentUsed >= 90) return '#F87171';
    if (percentUsed >= 70) return '#FBBF24';
    return '#6366F1';
  };
  const daysLeft = Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()));
  const tokensUsed = systemStatus?.tokens.used || 0;
  const tokensLimit = systemStatus?.tokens.limit || 50000;
  const tokensPercent = systemStatus?.tokens.percent || 0;
  const projectsUsed = systemStatus?.projects.used ?? systemStatus?.projects.active ?? 0;
  const projectsLimit = systemStatus?.projects.limit || 0;
  const projectsPercent = systemStatus?.projects.percent || 0;
  const previewProjects = systemStatus?.previews.byProject || [];
  const previewsLive = systemStatus?.previews.activeSessions ?? previewProjects.filter((project) => project.isActive).length;
  const previewsMostUsed = systemStatus?.previews.maxUsedOnProject ?? previewProjects.reduce((max, project) => Math.max(max, project.used || 0), 0);
  const previewsLimitRaw = systemStatus?.previews.limitPerProject ?? systemStatus?.previews.limit;
  const previewsUnlimited = typeof previewsLimitRaw === 'number' && previewsLimitRaw < 0;
  const previewsLimit = previewsUnlimited ? 0 : previewsLimitRaw || 0;
  const previewsPercent = previewsUnlimited || previewsLimit <= 0 ? 0 : Math.min((previewsMostUsed / previewsLimit) * 100, 100);
  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${n}`;
  };

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} />
        <LinearGradient colors={['#0C0816', '#1E1040', '#0C0816']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.3 }]} />
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButtonCompact} onPress={() => setShowResourceUsage(false)}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView key="usage-close-btn" style={styles.backButtonGlass} interactive={true} effect="regular" colorScheme="dark">
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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <BlurView intensity={30} tint="dark" style={styles.mainMonitorCard}>
          <Text style={styles.monitorTitle}>{t('subscription.aiBudget')}</Text>
          <Text style={styles.monitorSub}>{t('subscription.currentPlan')} {planName} · {t('subscription.resetsIn')} {daysLeft}{t('subscription.days').charAt(0)}</Text>
          <View style={styles.budgetProgressContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.budgetProgressBg, { flex: 1 }]}>
                <View style={[styles.budgetProgressFill, { width: `${Math.max(Math.min(percentUsed, 100), percentUsed > 0 ? 2 : 0)}%`, backgroundColor: getBudgetColor() }]} />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500', minWidth: 65 }}>
                {Math.min(percentUsed, 100)}%
              </Text>
            </View>
          </View>
        </BlurView>

        <View style={styles.usageCards}>
          <BlurView intensity={25} tint="dark" style={styles.usageCard}>
            <Text style={styles.usageCardTitle}>{t('resources.tokens')}</Text>
            <Text style={styles.usageCardValue}>{formatTokens(tokensUsed)} / {formatTokens(tokensLimit)}</Text>
            <View style={styles.usageMiniBar}>
              <View style={[styles.usageMiniFill, { width: `${Math.min(tokensPercent, 100)}%`, backgroundColor: '#8B5CF6' }]} />
            </View>
          </BlurView>
          <View style={styles.usageGridRow}>
            <BlurView intensity={25} tint="dark" style={styles.usageCardRefinedHalf}>
              <View style={styles.usageTextRow}>
                <Text style={styles.usageNameMini}>{t('resources.projects')}</Text>
                <Text style={styles.usagePercent}>{Math.min(projectsPercent, 100)}%</Text>
              </View>
              <View style={styles.miniBarBg}>
                <View style={[styles.miniBarFill, { width: `${Math.min(projectsPercent, 100)}%`, backgroundColor: '#60A5FA' }]} />
              </View>
              <Text style={styles.usageSubtext}>
                {projectsUsed} / {projectsLimit} {t('resources.used')}
              </Text>
            </BlurView>

            <BlurView intensity={25} tint="dark" style={styles.usageCardRefinedHalf}>
              <View style={styles.usageTextRow}>
                <Text style={styles.usageNameMini}>{t('resources.previews')}</Text>
                <Text style={styles.usagePercent}>{previewsUnlimited ? t('resources.unlimited') : `${Math.round(previewsPercent)}%`}</Text>
              </View>
              <View style={styles.miniBarBg}>
                <View style={[styles.miniBarFill, { width: `${previewsUnlimited ? 100 : previewsPercent}%`, backgroundColor: '#A78BFA' }]} />
              </View>
              <Text style={styles.usageSubtext}>
                {previewsUnlimited
                  ? `${previewsLive} ${t('resources.live')}`
                  : `${previewsLive} ${t('resources.live')} · ${previewsMostUsed} / ${previewsLimit} ${t('resources.perProject')}`}
              </Text>
            </BlurView>
          </View>
        </View>

        {currentPlan === 'free' && (
          <TouchableOpacity style={styles.upgradeCtaCard} onPress={onOpenPlans}>
            <LinearGradient colors={['rgba(99,102,241,0.24)', 'rgba(124,58,237,0.18)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.upgradeCtaGradient}>
              <Ionicons name="sparkles" size={18} color="#C4B5FD" />
              <Text style={styles.upgradeCtaText}>{t('plans.upgradeTitle')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};
