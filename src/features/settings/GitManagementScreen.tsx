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
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { githubTokenService, GitHubAccount } from '../../core/github/githubTokenService';
import { gitAccountService, GitAccount } from '../../core/git/gitAccountService';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { AppColors } from '../../shared/theme/colors';
import { GitHubAuthModal } from '../terminal/components/GitHubAuthModal';

interface Props {
  onClose: () => void;
}

export const GitManagementScreen = ({ onClose }: Props) => {
  const [accounts, setAccounts] = useState<GitAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

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
      // Load all accounts (local + shared from Firebase)
      const accs = await gitAccountService.getAllAccounts(userId);
      setAccounts(accs);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = (account: GitAccount) => {
    const isShared = account.id.startsWith('shared-');

    if (isShared) {
      Alert.alert(
        'Account condiviso',
        'Questo account è stato aggiunto da un altro utente. Non puoi rimuoverlo, ma puoi aggiungere il tuo.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Rimuovi Account',
      `Sei sicuro di voler rimuovere l'account ${account.username}?`,
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
    setShowAuthModal(true);
  };

  const handleAuthenticated = async (token: string) => {
    setShowAuthModal(false);
    try {
      // Save account using gitAccountService (saves to local + Firebase)
      await gitAccountService.saveAccount('github', token, userId);
      loadAccounts();
    } catch (error) {
      Alert.alert('Errore', 'Impossibile salvare l\'account');
    }
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
    const isShared = account.id.startsWith('shared-');
    const providerIcon = account.provider === 'github' ? 'logo-github' : 'git-branch';

    const cardContent = (
      <View style={styles.cardInner}>
        {account.avatarUrl ? (
          <Image source={{ uri: account.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={24} color="rgba(255,255,255,0.5)" />
          </View>
        )}
        <View style={styles.accountInfo}>
          <Text style={styles.accountName}>{account.username}</Text>
          <View style={styles.accountMetaRow}>
            <Ionicons name={providerIcon as any} size={12} color="rgba(255,255,255,0.35)" />
            <Text style={styles.accountMeta}>
              {isShared ? 'Condiviso • ' : ''}Aggiunto {getTimeAgo(account.addedAt)}
            </Text>
          </View>
        </View>
        {isShared ? (
          <View style={styles.sharedBadge}>
            <Ionicons name="people" size={16} color={AppColors.primary} />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDeleteAccount(account)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={18} color="#ff4d4d" />
          </TouchableOpacity>
        )}
      </View>
    );

    return (
      <View key={account.id} style={styles.accountCard}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={{ backgroundColor: 'transparent', borderRadius: 16, overflow: 'hidden' }}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            {cardContent}
          </LiquidGlassView>
        ) : (
          cardContent
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
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
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={{ backgroundColor: 'transparent', borderRadius: 12, overflow: 'hidden' }}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            <View style={styles.infoBannerInner}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="information-circle" size={20} color={AppColors.primary} />
              </View>
              <Text style={styles.infoText}>
                Collega i tuoi account GitHub per accedere a repository privati e gestire i tuoi progetti.
              </Text>
            </View>
          </LiquidGlassView>
        ) : (
          <View style={styles.infoBannerInner}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="information-circle" size={20} color={AppColors.primary} />
            </View>
            <Text style={styles.infoText}>
              Collega i tuoi account GitHub per accedere a repository privati e gestire i tuoi progetti.
            </Text>
          </View>
        )}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}
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
              <Ionicons name="logo-github" size={48} color="rgba(255,255,255,0.2)" />
            </View>
            <Text style={styles.emptyText}>Nessun account collegato</Text>
            <Text style={styles.emptySubtext}>
              Aggiungi un account GitHub per accedere ai repository privati
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
      </ScrollView>

      <GitHubAuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthenticated={handleAuthenticated}
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
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
  },
  infoBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
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
    marginBottom: 10,
    borderRadius: 16,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
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
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
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
  sharedBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${AppColors.primary}15`,
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
