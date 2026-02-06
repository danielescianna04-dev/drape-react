import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { GitAccount, GIT_PROVIDERS } from '../../../core/git/gitAccountService';
import { AppColors } from '../../../shared/theme/colors';

interface GitAccountsSectionProps {
  accounts: GitAccount[];
  loading: boolean;
  shimmerAnim: Animated.Value;
  onAddAccount: () => void;
  onDeleteAccount: (account: GitAccount) => void;
  t: (key: string) => string;
}

const GlassCard = ({ children }: { children: React.ReactNode }) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={styles.glassCardLiquid} interactive={true} effect="regular" colorScheme="dark">
        {children}
      </LiquidGlassView>
    );
  }
  return (
    <View style={[styles.sectionCardWrap, styles.sectionCardDark]}>
      {children}
    </View>
  );
};

export const GitAccountsSection: React.FC<GitAccountsSectionProps> = ({
  accounts,
  loading,
  shimmerAnim,
  onAddAccount,
  onDeleteAccount,
  t,
}) => {
  const renderAccountCard = (account: GitAccount) => {
    const providerConfig = GIT_PROVIDERS.find(p => p.id === account.provider);
    const iconName = providerConfig?.icon || 'git-branch';
    const providerColor = providerConfig?.color || '#888';

    return (
      <View key={account.id} style={[styles.accountCard, accounts.indexOf(account) === accounts.length - 1 && { borderBottomWidth: 0 }]}>
        {account.avatarUrl ? (
          <Image source={{ uri: account.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: providerColor }]}>
            <Ionicons name={iconName as any} size={18} color="#fff" />
          </View>
        )}
        <View style={styles.accountInfo}>
          <View style={styles.accountNameRow}>
            <Text style={styles.accountName} numberOfLines={1} ellipsizeMode="tail">
              {account.username}
            </Text>
            <View style={styles.providerBadge}>
              <Text style={styles.providerBadgeText}>
                {providerConfig?.name || account.provider}
              </Text>
            </View>
          </View>
          {account.email && (
            <Text style={styles.accountEmail} numberOfLines={1}>
              {account.email}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDeleteAccount(account)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={18} color="rgba(255, 77, 77, 0.8)" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderSkeletonCard = (index: number) => {
    const shimmerOpacity = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.7],
    });

    return (
      <View key={`skeleton-${index}`} style={styles.accountCard}>
        <Animated.View style={[styles.skeletonAvatar, { opacity: shimmerOpacity }]} />
        <View style={styles.accountInfo}>
          <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
          <Animated.View style={[styles.skeletonSubtitle, { opacity: shimmerOpacity }]} />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('gitAccounts.title')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddAccount}
          activeOpacity={0.6}
        >
          <Ionicons name="add" size={20} color={AppColors.primary} />
          <Text style={styles.addButtonText}>{t('gitAccounts.addAccount')}</Text>
        </TouchableOpacity>
      </View>

      <GlassCard>
        <View style={styles.sectionCard}>
          {loading ? (
            <>
              {[0, 1].map(renderSkeletonCard)}
            </>
          ) : accounts.length > 0 ? (
            accounts.map(renderAccountCard)
          ) : (
            <View style={styles.emptyAccounts}>
              <Ionicons name="git-network-outline" size={32} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>{t('gitAccounts.noAccounts')}</Text>
              <Text style={styles.emptySubtext}>
                {t('gitAccounts.connectDescription')}
              </Text>
            </View>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: -0.3,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
  },
  glassCardLiquid: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sectionCardWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  sectionCardDark: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  sectionCard: {
    padding: 4,
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 16,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  providerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  providerBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.7)',
  },
  accountEmail: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 1,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  emptyAccounts: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 10,
  },
  emptySubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 14,
  },
  skeletonTitle: {
    width: '60%',
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  skeletonSubtitle: {
    width: '40%',
    height: 11,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
