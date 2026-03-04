import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { isLiquidGlassSupported } from '@callstack/liquid-glass';
import { GlassCard } from './GlassCard';
import { SettingItem } from './SettingItem';

interface SecuritySectionProps {
  onChangePassword: () => void;
  onChangeEmail?: () => void;
  t: (key: string) => string;
}

export const SecuritySection: React.FC<SecuritySectionProps> = ({
  onChangePassword,
  onChangeEmail,
  t,
}) => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('security.title')}</Text>
      <GlassCard>
        <View style={[styles.sectionCard, isLiquidGlassSupported && styles.sectionCardGlass]}>
          <SettingItem
            icon="lock-closed-outline"
            iconColor="#6366F1"
            title={t('security.changePassword')}
            subtitle={t('security.changePasswordDesc')}
            onPress={onChangePassword}
            isLast={!onChangeEmail}
          />
          {onChangeEmail && (
            <SettingItem
              icon="mail-outline"
              iconColor="#F59E0B"
              title={t('security.changeEmail')}
              subtitle={t('security.changeEmailDesc')}
              onPress={onChangeEmail}
              isLast
            />
          )}
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
  sectionCardGlass: {
    backgroundColor: 'transparent',
  },
});
