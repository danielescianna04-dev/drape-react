import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../core/git/gitAccountService';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { AppColors } from '../../shared/theme/colors';
import { AddGitAccountModal } from '../settings/components/AddGitAccountModal';

interface Props {
  onClose: () => void;
}

export const GitManagementScreen = ({ onClose }: Props) => {
  const [accounts, setAccounts] = useState<GitAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const userId = useTerminalStore.getState().userId || 'anonymous';

  useEffect(() => {
    loadAccounts();

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();

    return () => shimmerLoop.stop();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const accs = await gitAccountService.getAccounts(userId);
      setAccounts(accs);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = (account: GitAccount) => {
    const providerConfig = GIT_PROVIDERS.find(p => p.id === account.provider);
    const providerName = providerConfig?.name || account.provider;

    Alert.alert(
      'Rimuovi Account',
      `Sei sicuro di voler rimuovere l'account ${account.username} (${providerName})?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: async () => {
            try {
              await gitAccountService.deleteAccount(account, userId);
              loadAccounts();
            } catch (error) {
              Alert.alert('Errore', 'Impossibile rimuovere l\'account');
            }
          },
        },
      ]
    );
  };

  const handleAddAccount = () => {
    setShowAddModal(true);
  };

  const handleAccountAdded = () => {
    setShowAddModal(false);
    loadAccounts();
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const months = Math.floor(days / 30);

    if (months > 0) return `${months} mesi fa`;
    if (days > 0) return `${days}g fa`;
    return 'oggi';
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

  const renderAccountCard = (account: GitAccount) => {
    const providerConfig = GIT_PROVIDERS.find(p => p.id === account.provider);
    const iconName = providerConfig?.icon || 'git-branch';
    const providerColor = providerConfig?.color || '#888';

    return (
      <View key={account.id} style={styles.accountCard}>
        {account.avatarUrl ? (
          <Image source={{ uri: account.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={24} color="rgba(255,255,255,0.5)" />
          </View>
        )}
        <View style={styles.accountInfo}>
          <View style={styles.accountNameRow}>
            <Text style={styles.accountName}>{account.username}</Text>
            <View style={[styles.providerBadge, { backgroundColor: `${providerColor}20` }]}>
              <Ionicons name={iconName as any} size={10} color={providerColor} />
              <Text style={[styles.providerBadgeText, { color: providerColor }]}>
                {providerConfig?.name || account.provider}
              </Text>
            </View>
          </View>
          <View style={styles.accountMetaRow}>
            <Ionicons name={iconName as any} size={12} color="rgba(255,255,255,0.35)" />
            <Text style={styles.accountMeta}>Aggiunto {getTimeAgo(account.addedAt)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDeleteAccount(account)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={18} color="#ff4d4d" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account Git</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.7}
          onPress={handleAddAccount}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <View style={styles.infoIconContainer}>
          <Ionicons name="information-circle" size={20} color={AppColors.primary} />
        </View>
        <Text style={styles.infoText}>
          Collega i tuoi account Git (GitHub, GitLab, Bitbucket, Gitea) per accedere a repository privati e gestire i tuoi progetti.
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {loading ? (
          <>
            {[0, 1, 2].map(renderSkeletonCard)}
          </>
        ) : accounts.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Account collegati</Text>
            {accounts.map(renderAccountCard)}
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="git-branch" size={48} color="rgba(255,255,255,0.2)" />
            </View>
            <Text style={styles.emptyText}>Nessun account collegato</Text>
            <Text style={styles.emptySubtext}>
              Aggiungi un account Git per accedere ai repository privati
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              activeOpacity={0.7}
              onPress={handleAddAccount}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.emptyButtonText}>Aggiungi Account</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <AddGitAccountModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAccountAdded={handleAccountAdded}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0C0E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 14,
    backgroundColor: `${AppColors.primary}15`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${AppColors.primary}30`,
  },
  infoIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${AppColors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 14,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  providerBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  accountMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,77,77,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  // Skeleton
  skeletonAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 14,
  },
  skeletonTitle: {
    width: '60%',
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  skeletonSubtitle: {
    width: '40%',
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: AppColors.primary,
    borderRadius: 12,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
