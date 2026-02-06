import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassCard } from './GlassCard';
import { SettingItem } from './SettingItem';

interface DeviceSectionProps {
  deviceModelName: string;
  currentDeviceId: string | null;
  loading: boolean;
  t: (key: string) => string;
}

export const DeviceSection: React.FC<DeviceSectionProps> = ({
  deviceModelName,
  currentDeviceId,
  loading,
  t,
}) => {
  return (
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
