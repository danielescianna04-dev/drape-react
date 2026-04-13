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
import { useAuthStore } from '../../core/auth/authStore';
import { tracciaLogout, tracciaEliminaAccount, tracciaErrore, tracciaPaginaPianiVista, tracciaDocumentoLegaleVisto, tracciaNotificheToggle, tracciaSchermata, tracciaImpostazioniAperte, tracciaImpostazioniChiuse, tracciaLinguaCambiata } from '../../core/services/analyticsService';
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
import { ChangeEmailModal } from './components/ChangeEmailModal';
import { LegalPage } from './components/LegalPage';
import { PurchaseCelebrationModal } from '../../shared/components/modals/PurchaseCelebrationModal';
import { SettingsPlanSelectionView, SettingsResourceUsageView } from './components/SettingsHeavyViews';
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
          onEditPress={() => { tracciaImpostazioniAperte('edit_name'); setShowEditName(true); }}
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
          onPlanPress={() => { tracciaPaginaPianiVista('settings'); setShowPlanSelection(true); }}
          onBudgetPress={() => { tracciaSchermata('Utilizzo Risorse'); setShowResourceUsage(true); }}
          t={t}
        />

        {/* Appearance Section */}
        <AppearanceSection
          language={language}
          loading={loading}
          onLanguageChange={(lang) => { tracciaLinguaCambiata(lang); setAppLanguage(lang); }}
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
          onOperationsChange={(v) => { tracciaNotificheToggle('operations', String(v)); setNotifOperations(v); updateNotifPreference('operations', v); }}
          onGithubChange={(v) => { tracciaNotificheToggle('github', String(v)); setNotifGithub(v); updateNotifPreference('github', v); }}
          onReengagementChange={(v) => { tracciaNotificheToggle('reengagement', String(v)); setNotifReengagement(v); updateNotifPreference('reengagement', v); }}
          t={t}
        />

        {/* Info Section */}
        <InfoSection
          loading={loading}
          t={t}
          onOpenTerms={() => { tracciaDocumentoLegaleVisto('terms'); setShowLegal('terms'); }}
          onOpenPrivacy={() => { tracciaDocumentoLegaleVisto('privacy'); setShowLegal('privacy'); }}
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
            onChangePassword={() => { tracciaImpostazioniAperte('change_password'); setShowChangePassword(true); }}
            onChangeEmail={() => { tracciaImpostazioniAperte('change_email'); setShowChangeEmail(true); }}
            loading={loading}
            t={t}
          />
        )}

        {/* Data Export (GDPR Right to Portability) */}
        <DataExportSection
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
                  tracciaLogout();
                  await logout();
                  onClose();
                } catch (error: any) {
                  tracciaErrore(error?.message || 'Logout error', 'logout');
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
                    await tracciaEliminaAccount();
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
                      tracciaErrore(error?.message || 'Delete account error', 'delete_account');
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
        onClose={() => { tracciaImpostazioniChiuse('edit_name'); setShowEditName(false); }}
        onSave={(newName) => useAuthStore.getState().updateDisplayName(newName)}
        t={t}
      />

      <ChangePasswordModal
        visible={showChangePassword}
        onClose={() => { tracciaImpostazioniChiuse('change_password'); setShowChangePassword(false); }}
        t={t}
      />

      <ChangeEmailModal
        visible={showChangeEmail}
        currentEmail={user?.email || ''}
        onClose={() => { tracciaImpostazioniChiuse('change_email'); setShowChangeEmail(false); }}
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
