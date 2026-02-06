import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { GlassCard } from './GlassCard';
import { SettingItem } from './SettingItem';
import { AppColors } from '../../../shared/theme/colors';

interface NotificationSectionProps {
  notifications: boolean;
  notifOperations: boolean;
  notifGithub: boolean;
  notifReengagement: boolean;
  loading: boolean;
  onNotificationsChange: (value: boolean) => void;
  onOperationsChange: (value: boolean) => void;
  onGithubChange: (value: boolean) => void;
  onReengagementChange: (value: boolean) => void;
  t: (key: string) => string;
}

export const NotificationSection: React.FC<NotificationSectionProps> = ({
  notifications,
  notifOperations,
  notifGithub,
  notifReengagement,
  loading,
  onNotificationsChange,
  onOperationsChange,
  onGithubChange,
  onReengagementChange,
  t,
}) => {
  return (
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
                onValueChange={onNotificationsChange}
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
                onValueChange={onOperationsChange}
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
                onValueChange={onGithubChange}
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
                onValueChange={onReengagementChange}
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
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: -0.3,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    padding: 4,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 16,
  },
});
