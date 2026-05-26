import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useAuthStore } from '../../../core/auth/authStore';
import {
  tracciaLogout,
  tracciaEliminaAccount,
  tracciaErrore,
  tracciaPaginaPianiVista,
  tracciaDocumentoLegaleVisto,
  tracciaNotificheToggle,
  tracciaSchermata,
  tracciaImpostazioniAperte,
  tracciaImpostazioniChiuse,
  tracciaLinguaCambiata,
} from '../../../core/services/analyticsService';
import { AddGitAccountModal } from './AddGitAccountModal';
import { ProfileSection } from './ProfileSection';
import { GitAccountsSection } from './GitAccountsSection';
import { AppearanceSection } from './AppearanceSection';
import { NotificationSection } from './NotificationSection';
import { InfoSection } from './InfoSection';
import { DeviceSection } from './DeviceSection';
import { AccountActionsSection } from './AccountActionsSection';
import { EditNameModal } from './EditNameModal';
import { ChangePasswordModal } from './ChangePasswordModal';
import { SecuritySection } from './SecuritySection';
import { DataExportSection } from './DataExportSection';
import { ChangeEmailModal } from './ChangeEmailModal';
import { LegalPage } from './LegalPage';
import { PurchaseCelebrationModal } from '../../../shared/components/modals/PurchaseCelebrationModal';

export const SettingsMainContent = ({
  styles,
  user,
  currentPlan,
  loading,
  t,
  onClose,
  logout,
  deleteAccount,
  accounts,
  shimmerAnim,
  showAddModal,
  setShowAddModal,
  handleDeleteAccount,
  budgetStatus,
  showEditName,
  setShowEditName,
  showChangePassword,
  setShowChangePassword,
  showChangeEmail,
  setShowChangeEmail,
  showLegal,
  setShowLegal,
  loadAccounts,
  notifications,
  notifOperations,
  notifGithub,
  notifReengagement,
  setNotifications,
  setNotifOperations,
  setNotifGithub,
  setNotifReengagement,
  updateNotifPreference,
  language,
  setAppLanguage,
  setShowPlanSelection,
  setShowResourceUsage,
  currentDeviceId,
  deviceModelName,
  isEmailUser,
  showCelebration,
  celebrationPlan,
  closeCelebration,
}: any) => (
  <>
    <ScrollView
      style={styles.content}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
    >
      <ProfileSection
        user={user}
        currentPlan={currentPlan}
        onEditPress={() => { tracciaImpostazioniAperte('edit_name'); setShowEditName(true); }}
        loading={loading}
      />

      <GitAccountsSection
        accounts={accounts}
        loading={loading}
        shimmerAnim={shimmerAnim}
        onAddAccount={() => setShowAddModal(true)}
        onDeleteAccount={handleDeleteAccount}
        t={t}
      />


      <AppearanceSection
        language={language}
        loading={loading}
        onLanguageChange={(lang) => { tracciaLinguaCambiata(lang); setAppLanguage(lang); }}
        t={t}
      />

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

      <InfoSection
        loading={loading}
        t={t}
        onOpenTerms={() => { tracciaDocumentoLegaleVisto('terms'); setShowLegal('terms'); }}
        onOpenPrivacy={() => { tracciaDocumentoLegaleVisto('privacy'); setShowLegal('privacy'); }}
      />

      <DeviceSection
        deviceModelName={deviceModelName}
        currentDeviceId={currentDeviceId}
        loading={loading}
        t={t}
      />

      {isEmailUser && (
        <SecuritySection
          onChangePassword={() => { tracciaImpostazioniAperte('change_password'); setShowChangePassword(true); }}
          onChangeEmail={() => { tracciaImpostazioniAperte('change_email'); setShowChangeEmail(true); }}
          loading={loading}
          t={t}
        />
      )}

      <DataExportSection loading={loading} t={t} />

      <AccountActionsSection
        userEmail={user?.email}
        loading={loading}
        onLogout={() => Alert.alert(t('logout.title'), t('logout.confirm'), [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('logout.button'),
            style: 'destructive',
            onPress: async () => {
              try {
                tracciaLogout();
                await logout();
                onClose();
              } catch (error: any) {
                tracciaErrore(error?.message || 'Logout error', 'logout');
                Alert.alert(t('common:error'), t('logout.error'));
              }
            },
          },
        ])}
        onDeleteAccount={() => Alert.alert(t('deleteAccount.title'), t('deleteAccount.confirm'), [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('deleteAccount.button'),
            style: 'destructive',
            onPress: async () => {
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
                      'secure-text',
                    );
                  } else if (error.message === 'wrong-password') {
                    Alert.alert(t('common:error'), t('deleteAccount.wrongPassword'));
                  } else if (error.message === 'google-reauth-required') {
                    Alert.alert(t('common:error'), t('deleteAccount.reauth'));
                  } else if (error.message !== 'cancelled') {
                    tracciaErrore(error?.message || 'Delete account error', 'delete_account');
                    Alert.alert(t('common:error'), t('deleteAccount.error') + (error?.message ? `\n\n${error.message}` : ''));
                  }
                }
              };
              await doDelete();
            },
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

    <PurchaseCelebrationModal visible={showCelebration} planName={celebrationPlan} onClose={closeCelebration} />

    {showLegal && (
      <LegalPage type={showLegal} onClose={() => setShowLegal(null)} />
    )}
  </>
);
