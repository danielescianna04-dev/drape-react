import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import Constants from 'expo-constants';
import { GlassCard } from './GlassCard';
import { SettingItem } from './SettingItem';

interface InfoSectionProps {
  loading: boolean;
  t: (key: string) => string;
}

export const InfoSection: React.FC<InfoSectionProps> = ({ loading, t }) => {
  return (
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
