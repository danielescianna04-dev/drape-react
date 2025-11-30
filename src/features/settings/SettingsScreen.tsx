import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Image,
  Animated,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gitAccountService, GitAccount, GIT_PROVIDERS } from '../../core/git/gitAccountService';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { AppColors } from '../../shared/theme/colors';
import { AddGitAccountModal } from './components/AddGitAccountModal';

interface Props {
  onClose: () => void;
}

interface SettingItemProps {
  icon: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
}

const SettingItem = ({ icon, iconColor, title, subtitle, onPress, rightElement, showChevron = true }: SettingItemProps) => (
  <TouchableOpacity
    style={styles.settingItem}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress}
  >
    <View style={[styles.settingIconContainer, { backgroundColor: `${iconColor || AppColors.primary}15` }]}>
      <Ionicons name={icon as any} size={20} color={iconColor || AppColors.primary} />
    </View>
    <View style={styles.settingContent}>
      <Text style={styles.settingTitle}>{title}</Text>
      {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
    </View>
    {rightElement || (showChevron && onPress && (
      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
    ))}
  </TouchableOpacity>
);

export const SettingsScreen = ({ onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState<GitAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
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

  const renderAccountCard = (account: GitAccount) => {
    const providerConfig = GIT_PROVIDERS.find(p => p.id === account.provider);
    const iconName = providerConfig?.icon || 'git-branch';
    const providerColor = providerConfig?.color || '#888';

    return (
      <View key={account.id} style={styles.accountCard}>
        {account.avatarUrl ? (
          <Image source={{ uri: account.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: providerColor }]}>
            <Ionicons name={iconName as any} size={18} color="#fff" />
          </View>
        )}
        <View style={styles.accountInfo}>
          <View style={styles.accountNameRow}>
            <Text style={styles.accountName}>{account.username}</Text>
            <View style={[styles.providerBadge, { backgroundColor: `${providerColor}20` }]}>
              <Text style={[styles.providerBadgeText, { color: providerColor }]}>
                {providerConfig?.name || account.provider}
              </Text>
            </View>
          </View>
          {account.email && <Text style={styles.accountEmail}>{account.email}</Text>}
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDeleteAccount(account)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={16} color="#ff4d4d" />
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={onClose}
        >
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Impostazioni</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Account Git Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Account Git</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={18} color={AppColors.primary} />
              <Text style={styles.addButtonText}>Aggiungi</Text>
            </TouchableOpacity>
          </View>

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
                <Text style={styles.emptyText}>Nessun account collegato</Text>
                <Text style={styles.emptySubtext}>
                  Collega GitHub, GitLab, Bitbucket o altri
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Aspetto Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aspetto</Text>
          <View style={styles.sectionCard}>
            <SettingItem
              icon="moon"
              iconColor="#9b87f5"
              title="Tema Scuro"
              subtitle="Usa il tema scuro dell'app"
              showChevron={false}
              rightElement={
                <Switch
                  value={darkMode}
                  onValueChange={setDarkMode}
                  trackColor={{ false: '#333', true: AppColors.primary }}
                  thumbColor="#fff"
                />
              }
            />
            <SettingItem
              icon="text"
              iconColor="#3b82f6"
              title="Dimensione Font"
              subtitle="Media"
              onPress={() => Alert.alert('Coming Soon', 'Questa funzione sarà disponibile presto')}
            />
          </View>
        </View>

        {/* Notifiche Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifiche</Text>
          <View style={styles.sectionCard}>
            <SettingItem
              icon="notifications"
              iconColor="#f59e0b"
              title="Notifiche Push"
              subtitle="Ricevi notifiche sui progetti"
              showChevron={false}
              rightElement={
                <Switch
                  value={notifications}
                  onValueChange={setNotifications}
                  trackColor={{ false: '#333', true: AppColors.primary }}
                  thumbColor="#fff"
                />
              }
            />
          </View>
        </View>

        {/* Editor Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Editor</Text>
          <View style={styles.sectionCard}>
            <SettingItem
              icon="code-slash"
              iconColor="#10b981"
              title="Evidenziazione Sintassi"
              subtitle="Attiva la colorazione del codice"
              onPress={() => Alert.alert('Coming Soon', 'Questa funzione sarà disponibile presto')}
            />
            <SettingItem
              icon="git-branch"
              iconColor="#f97316"
              title="Auto-completamento"
              subtitle="Suggerimenti intelligenti"
              onPress={() => Alert.alert('Coming Soon', 'Questa funzione sarà disponibile presto')}
            />
          </View>
        </View>

        {/* Supporto Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Supporto</Text>
          <View style={styles.sectionCard}>
            <SettingItem
              icon="help-circle"
              iconColor="#06b6d4"
              title="Centro Assistenza"
              onPress={() => Linking.openURL('https://drape.app/help')}
            />
            <SettingItem
              icon="chatbubble"
              iconColor="#8b5cf6"
              title="Contattaci"
              onPress={() => Linking.openURL('mailto:support@drape.app')}
            />
            <SettingItem
              icon="star"
              iconColor="#eab308"
              title="Valuta l'App"
              onPress={() => Alert.alert('Grazie!', 'Appreziamo il tuo supporto!')}
            />
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informazioni</Text>
          <View style={styles.sectionCard}>
            <SettingItem
              icon="information-circle"
              iconColor="#64748b"
              title="Versione"
              subtitle="1.0.0"
              showChevron={false}
            />
            <SettingItem
              icon="document-text"
              iconColor="#64748b"
              title="Termini di Servizio"
              onPress={() => Linking.openURL('https://drape.app/terms')}
            />
            <SettingItem
              icon="shield-checkmark"
              iconColor="#64748b"
              title="Privacy Policy"
              onPress={() => Linking.openURL('https://drape.app/privacy')}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <SettingItem
              icon="log-out"
              iconColor="#ef4444"
              title="Esci"
              onPress={() => Alert.alert('Esci', 'Sei sicuro di voler uscire?', [
                { text: 'Annulla', style: 'cancel' },
                { text: 'Esci', style: 'destructive', onPress: () => {} },
              ])}
              showChevron={false}
            />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <AddGitAccountModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAccountAdded={() => {
          setShowAddModal(false);
          loadAccounts();
        }}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.primary,
  },
  // Account cards
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
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
    gap: 8,
  },
  accountName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  providerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  providerBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  accountEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,77,77,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAccounts: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
  },
  // Skeleton
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 12,
  },
  skeletonTitle: {
    width: '50%',
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
  },
  skeletonSubtitle: {
    width: '30%',
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Setting items
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  settingIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  settingSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
});
