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
import { githubTokenService, GitHubAccount } from '../../../core/github/githubTokenService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { AppColors } from '../../../shared/theme/colors';
import { GitHubAuthModal } from './GitHubAuthModal';

interface Props {
  onClose: () => void;
}

export const GitPanel = ({ onClose }: Props) => {
  const [accounts, setAccounts] = useState<GitHubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
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
      const accs = await githubTokenService.getAccounts(userId);
      setAccounts(accs);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = (account: GitHubAccount) => {
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
              await githubTokenService.deleteToken(account.owner, userId);
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
      const validation = await githubTokenService.validateToken(token);
      if (validation.valid && validation.username) {
        await githubTokenService.saveToken(validation.username, token, userId);
        loadAccounts();
      } else {
        Alert.alert('Errore', 'Token non valido');
      }
    } catch (error) {
      Alert.alert('Errore', 'Impossibile salvare l\'account');
    }
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const months = Math.floor(days / 30);

    if (months > 0) return `${months}m fa`;
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

  const renderAccountCard = (account: GitHubAccount) => (
    <View key={account.id} style={styles.accountCard}>
      {account.avatarUrl ? (
        <Image source={{ uri: account.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Ionicons name="person" size={18} color="rgba(255,255,255,0.5)" />
        </View>
      )}
      <View style={styles.accountInfo}>
        <Text style={styles.accountName} numberOfLines={1}>{account.username}</Text>
        <Text style={styles.accountMeta}>{getTimeAgo(account.addedAt)}</Text>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDeleteAccount(account)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={16} color="#ff4d4d" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Ionicons name="logo-github" size={18} color={AppColors.primary} />
          <Text style={styles.headerTitle}>Git</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.7}
          onPress={handleAddAccount}
        >
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {loading ? (
          <>
            {[0, 1].map(renderSkeletonCard)}
          </>
        ) : accounts.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Account collegati</Text>
            {accounts.map(renderAccountCard)}
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="logo-github" size={32} color="rgba(255,255,255,0.15)" />
            </View>
            <Text style={styles.emptyText}>Nessun account</Text>
            <Text style={styles.emptySubtext}>
              Aggiungi un account GitHub per i repository privati
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              activeOpacity={0.7}
              onPress={handleAddAccount}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.emptyButtonText}>Aggiungi</Text>
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
    position: 'absolute',
    left: 44,
    top: 0,
    bottom: 0,
    width: 260,
    backgroundColor: '#121214',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.06)',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
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
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 2,
  },
  accountMeta: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(255,77,77,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Skeleton
  skeletonAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 10,
  },
  skeletonTitle: {
    width: '70%',
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
  },
  skeletonSubtitle: {
    width: '40%',
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 16,
    marginBottom: 16,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: AppColors.primary,
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
