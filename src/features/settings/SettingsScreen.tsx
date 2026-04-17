import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tracciaPaginaPianiVista } from '../../core/services/analyticsService';
import { SettingsMainContent } from './components/SettingsMainContent';
import { SettingsPlanSelectionView, SettingsResourceUsageView } from './components/SettingsHeavyViews';
import { getSettingsScreenMode } from './settingsScreenModes';
import { useSettingsData } from './useSettingsData';
import { styles } from './settingsScreenStyles';

interface Props {
  onClose: () => void;
  initialShowPlans?: boolean;
  initialPlanIndex?: number;
}

export const SettingsScreen = ({ onClose, initialShowPlans = false, initialPlanIndex = 0 }: Props) => {
  const insets = useSafeAreaInsets();
  const {
    t,
    user,
    logout,
    deleteAccount,
    language,
    setAppLanguage,
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
    currentPlan,
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
  } = useSettingsData(onClose, initialShowPlans, initialPlanIndex);

  const currentMode = getSettingsScreenMode({ showPlanSelection, showResourceUsage });

  const renderPlanSelection = () => (
    <SettingsPlanSelectionView
      styles={styles}
      insets={insets}
      t={t}
      planExitAnim={planExitAnim}
      planHeaderAnim={planHeaderAnim}
      planToggleAnim={planToggleAnim}
      planCardsAnim={planCardsAnim}
      planFooterAnim={planFooterAnim}
      billingCycle={billingCycle}
      setBillingCycle={setBillingCycle}
      iapProducts={iapProducts}
      currentPlan={currentPlan}
      currentProductId={currentProductId}
      isPurchasing={isPurchasing}
      iapPurchase={iapPurchase}
      isRestoring={isRestoring}
      restorePurchases={restorePurchases}
      handleClosePlans={handleClosePlans}
      setShowLegal={setShowLegal}
    />
  );

  const renderResourceUsage = () => (
    <SettingsResourceUsageView
      styles={styles}
      insets={insets}
      t={t}
      budgetStatus={budgetStatus}
      systemStatus={systemStatus}
      projectAiAnalytics={projectAiAnalytics}
      currentPlan={currentPlan}
      setShowResourceUsage={setShowResourceUsage}
      fetchSystemStatus={fetchSystemStatus}
      onOpenPlans={() => {
        setShowResourceUsage(false);
        tracciaPaginaPianiVista('premium_banner');
        setShowPlanSelection(true);
      }}
    />
  );

  if (currentMode === 'plans') return renderPlanSelection();
  if (currentMode === 'resource_usage') return renderResourceUsage();

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

      <SettingsMainContent
        styles={styles}
        user={user}
        currentPlan={currentPlan}
        loading={loading}
        t={t}
        onClose={onClose}
        logout={logout}
        deleteAccount={deleteAccount}
        accounts={accounts}
        shimmerAnim={shimmerAnim}
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        handleDeleteAccount={handleDeleteAccount}
        budgetStatus={budgetStatus}
        showEditName={showEditName}
        setShowEditName={setShowEditName}
        showChangePassword={showChangePassword}
        setShowChangePassword={setShowChangePassword}
        showChangeEmail={showChangeEmail}
        setShowChangeEmail={setShowChangeEmail}
        showLegal={showLegal}
        setShowLegal={setShowLegal}
        loadAccounts={loadAccounts}
        notifications={notifications}
        notifOperations={notifOperations}
        notifGithub={notifGithub}
        notifReengagement={notifReengagement}
        setNotifications={setNotifications}
        setNotifOperations={setNotifOperations}
        setNotifGithub={setNotifGithub}
        setNotifReengagement={setNotifReengagement}
        updateNotifPreference={updateNotifPreference}
        language={language}
        setAppLanguage={setAppLanguage}
        setShowPlanSelection={setShowPlanSelection}
        setShowResourceUsage={setShowResourceUsage}
        currentDeviceId={currentDeviceId}
        deviceModelName={deviceModelName}
        isEmailUser={isEmailUser}
        showCelebration={showCelebration}
        celebrationPlan={celebrationPlan}
        closeCelebration={closeCelebration}
      />
    </Animated.View>
  );
};
