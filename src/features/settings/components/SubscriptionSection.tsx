import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassCard } from './GlassCard';
import { SettingItem } from './SettingItem';

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

interface SubscriptionSectionProps {
  currentPlan: 'free' | 'go' | 'pro' | 'max';
  budgetStatus: BudgetStatus | null;
  loading: boolean;
  onPlanPress: () => void;
  onBudgetPress: () => void;
  t: (key: string) => string;
}

export const SubscriptionSection: React.FC<SubscriptionSectionProps> = ({
  currentPlan,
  budgetStatus,
  loading,
  onPlanPress,
  onBudgetPress,
  t,
}) => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('subscription.title')}</Text>
      <GlassCard key={loading ? 'loading-sub' : 'loaded-sub'}>
        <View style={styles.sectionCard}>
          <SettingItem
            icon="card-outline"
            iconColor="#60A5FA"
            title={t('subscription.currentPlan')}
            subtitle={currentPlan === 'free' ? 'Starter' : currentPlan === 'go' ? 'Go' : currentPlan === 'pro' ? 'Pro' : currentPlan.toUpperCase()}
            onPress={onPlanPress}
          />
          <SettingItem
            icon="wallet-outline"
            iconColor="#34D399"
            title={t('subscription.aiBudget')}
            subtitle={budgetStatus ? `${budgetStatus.usage.percentUsed}% ${t('subscription.usage')}` : t('subscription.loading')}
            onPress={onBudgetPress}
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
