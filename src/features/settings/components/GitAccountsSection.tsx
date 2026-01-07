import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import {
  GitAccount,
  GIT_PROVIDERS,
  gitAccountService,
} from '../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { AddGitAccountModal } from './AddGitAccountModal';

export const GitAccountsSection = () => {
  const [accounts, setAccounts] = useState<GitAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const { userId } = useTerminalStore();

  useEffect(() => {
    loadAccounts();
  }, [userId]);

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      // Use getAllAccounts to get both local and Firebase accounts (cross-device sync)
      const list = await gitAccountService.getAllAccounts(userId || 'anonymous');
      setAccounts(list);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = (account: GitAccount) => {
    Alert.alert(
      'Rimuovi Account',
      `Sei sicuro di voler rimuovere l'account ${account.username}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: async () => {
            await gitAccountService.deleteAccount(account, userId || 'anonymous');
            loadAccounts();
          },
        },
      ]
    );
  };

  const getProviderConfig = (provider: string) => {
    return GIT_PROVIDERS.find(p => p.id === provider);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name="git-network-outline" size={20} color={AppColors.primary} />
        <Text style={styles.sectionTitle}>Account Git</Text>
      </View>

      <View style={styles.accountsList}>
        {isLoading ? (
          // Skeleton loading
          <>
            {[1, 2].map((i) => (
              <View key={i} style={styles.accountItem}>
                <View style={styles.accountLeft}>
                  <View style={[styles.avatarPlaceholder, styles.skeleton]} />
                  <View style={styles.accountInfo}>
                    <View style={[styles.skeletonText, { width: 120 }]} />
                    <View style={[styles.skeletonText, { width: 80, marginTop: 6 }]} />
                  </View>
                </View>
              </View>
            ))}
          </>
        ) : accounts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="person-add-outline" size={40} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyText}>Nessun account collegato</Text>
            <Text style={styles.emptySubtext}>
              Collega un account per accedere alle tue repository private
            </Text>
          </View>
        ) : (
          accounts.map((account) => {
            const providerConfig = getProviderConfig(account.provider);
            return (
              <View key={account.id} style={styles.accountItem}>
                <View style={styles.accountLeft}>
                  {account.avatarUrl ? (
                    <Image source={{ uri: account.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: providerConfig?.color || '#333' }]}>
                      <Ionicons
                        name={providerConfig?.icon as any || 'person'}
                        size={18}
                        color="#fff"
                      />
                    </View>
                  )}
                  <View style={styles.accountInfo}>
                    <View style={styles.accountNameRow}>
                      <Text style={styles.accountUsername}>{account.username}</Text>
                      <View style={[styles.providerBadge, { backgroundColor: `${providerConfig?.color}20` }]}>
                        <Ionicons
                          name={providerConfig?.icon as any || 'git-branch'}
                          size={10}
                          color={providerConfig?.color || '#fff'}
                        />
                        <Text style={[styles.providerBadgeText, { color: providerConfig?.color }]}>
                          {providerConfig?.name || account.provider}
                        </Text>
                      </View>
                    </View>
                    {account.email && (
                      <Text style={styles.accountEmail}>{account.email}</Text>
                    )}
                    <Text style={styles.accountDate}>
                      Aggiunto il {formatDate(account.addedAt)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteAccount(account)}
                >
                  <Ionicons name="trash-outline" size={18} color="#FF4444" />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* Add Account Button */}
        <TouchableOpacity
          style={styles.addAccountBtn}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={20} color={AppColors.primary} />
          <Text style={styles.addAccountText}>Aggiungi Account</Text>
        </TouchableOpacity>
      </View>

      <AddGitAccountModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAccountAdded={loadAccounts}
      />
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
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  accountsList: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  accountUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  providerBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  accountEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },
  accountDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,68,68,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  addAccountText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.primary,
  },
  skeleton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skeletonText: {
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
