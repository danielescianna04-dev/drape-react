import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GlassCard } from './GlassCard';
import { SettingItem } from './SettingItem';

interface AccountActionsSectionProps {
  userEmail?: string | null;
  loading: boolean;
  onLogout: () => void;
  t: (key: string) => string;
}

export const AccountActionsSection: React.FC<AccountActionsSectionProps> = ({
  userEmail,
  loading,
  onLogout,
  t,
}) => {
  return (
    <View style={styles.section}>
      <GlassCard key={loading ? 'loading-danger' : 'loaded-danger'}>
        <View style={styles.sectionCard}>
          <SettingItem
            icon="log-out-outline"
            iconColor="#F87171"
            title={t('logout.title')}
            subtitle={userEmail || undefined}
            onPress={onLogout}
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
  sectionCard: {
    padding: 4,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 16,
  },
});
