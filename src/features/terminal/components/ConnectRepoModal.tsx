import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../../shared/theme/colors';
import { Button } from '../../../shared/components/atoms/Button';
import { Input } from '../../../shared/components/atoms/Input';
import { githubService, GitHubRepository } from '../../../core/github/githubService';
import { gitAccountService, GitAccount } from '../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { config } from '../../../config/config';
import { db, auth } from '../../../config/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConnected: (repoUrl: string) => void;
  projectName?: string;
}

type Tab = 'create' | 'existing';

export const ConnectRepoModal = ({ visible, onClose, onConnected, projectName }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [loading, setLoading] = useState(false);
  const [reposLoading, setReposLoading] = useState(false);

  // Create new repo state
  const [repoName, setRepoName] = useState(projectName?.toLowerCase().replace(/\s+/g, '-') || '');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  // Existing repos state
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Account state
  const [gitAccounts, setGitAccounts] = useState<GitAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<GitAccount | null>(null);

  const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);
  const userId = useTerminalStore.getState().userId || 'anonymous';

  useEffect(() => {
    if (visible) {
      loadAccounts();
      setRepoName(projectName?.toLowerCase().replace(/\s+/g, '-') || '');
    }
  }, [visible, projectName]);

  useEffect(() => {
    if (selectedAccount && activeTab === 'existing') {
      loadRepositories();
    }
  }, [selectedAccount, activeTab]);

  const loadAccounts = async () => {
    try {
      const accounts = await gitAccountService.getAllAccounts(userId);
      const githubAccounts = accounts.filter(a => a.provider === 'github');
      setGitAccounts(githubAccounts);
      if (githubAccounts.length > 0) {
        setSelectedAccount(githubAccounts[0]);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const loadRepositories = async () => {
    if (!selectedAccount) return;

    setReposLoading(true);
    try {
      const token = await gitAccountService.getToken(selectedAccount, userId);
      if (token) {
        const repos = await githubService.fetchUserRepositories(token);
        setRepositories(repos);
      }
    } catch (error) {
      console.error('Error loading repos:', error);
    } finally {
      setReposLoading(false);
    }
  };

  const handleCreateRepo = async () => {
    if (!selectedAccount || !repoName.trim()) {
      Alert.alert(t('common:error'), t('terminal:connectRepo.enterRepoName'));
      return;
    }

    setLoading(true);
    try {
      const token = await gitAccountService.getToken(selectedAccount, userId);
      if (!token) {
        Alert.alert(t('common:error'), t('terminal:connectRepo.tokenNotFound'));
        return;
      }

      // Create repository on GitHub
      const result = await githubService.createRepository(repoName.trim(), token, {
        description,
        isPrivate,
        autoInit: true,
      });

      if (!result.success) {
        Alert.alert(t('common:error'), result.error || t('terminal:connectRepo.unableToCreate'));
        return;
      }

      // Update workstation with repo URL
      if (currentWorkstation?.id && result.repoUrl) {
        await updateWorkstationRepo(result.repoUrl);

        // Initialize git on the VM
        await initGitOnVM(result.repoUrl, token);

        Alert.alert(t('common:success'), t('terminal:connectRepo.repoCreated', { name: repoName }));
        onConnected(result.repoUrl);
        onClose();
      }
    } catch (error: any) {
      Alert.alert(t('common:error'), error.message || t('terminal:connectRepo.errorCreating'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRepo = async (repo: GitHubRepository) => {
    if (!selectedAccount || !currentWorkstation?.id) return;

    setLoading(true);
    try {
      const repoUrl = `https://github.com/${repo.fullName}`;
      const token = await gitAccountService.getToken(selectedAccount, userId);

      // Update workstation with repo URL
      await updateWorkstationRepo(repoUrl);

      // Initialize git on the VM
      if (token) {
        await initGitOnVM(repoUrl, token);
      }

      Alert.alert(t('common:success'), t('terminal:connectRepo.repoConnected', { name: repo.name }));
      onConnected(repoUrl);
      onClose();
    } catch (error: any) {
      Alert.alert(t('common:error'), error.message || t('terminal:connectRepo.errorConnecting'));
    } finally {
      setLoading(false);
    }
  };

  const updateWorkstationRepo = async (repoUrl: string) => {
    if (!currentWorkstation?.id) return;

    const cleanId = currentWorkstation.id.startsWith('ws-')
      ? currentWorkstation.id.substring(3)
      : currentWorkstation.id;

    // Use setDoc with merge to handle both existing and non-existing documents
    const docRef = doc(db, 'user_projects', cleanId);
    await setDoc(docRef, {
      repositoryUrl: repoUrl,
      githubUrl: repoUrl,
      githubAccountUsername: selectedAccount?.username,
      name: currentWorkstation.name || projectName,
      type: 'git',
      userId: auth.currentUser?.uid || userId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(), // Will only be set on creation, not updates
      status: 'running',
      lastAccessed: serverTimestamp(),
    }, { merge: true });

    console.log('✅ Workstation updated/created in Firebase:', cleanId);

    // Update local state
    useTerminalStore.getState().setWorkstation({
      ...currentWorkstation,
      repositoryUrl: repoUrl,
      githubUrl: repoUrl,
      githubAccountUsername: selectedAccount?.username,
    });
  };

  const initGitOnVM = async (repoUrl: string, token: string) => {
    if (!currentWorkstation?.id) return;

    try {
      await fetch(`${config.apiUrl}/git/init/${currentWorkstation.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ repoUrl }),
      });
    } catch (error) {
      console.warn('Git init warning:', error);
      // Non-fatal, continue anyway
    }
  };

  const filteredRepos = repositories.filter(repo =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!visible) return null;

  const renderModalContent = () => (
    <View style={styles.modalInner}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="logo-github" size={22} color="#fff" />
        </View>
        <Text style={styles.headerTitle}>{t('terminal:connectRepo.connectToGitHub')}</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {/* Account selector */}
      {gitAccounts.length === 0 ? (
        <View style={styles.noAccountContainer}>
          <Ionicons name="person-outline" size={32} color="rgba(255,255,255,0.3)" />
          <Text style={styles.noAccountText}>{t('terminal:connectRepo.noGitHubAccount')}</Text>
          <Text style={styles.noAccountSubtext}>
            {t('terminal:connectRepo.goToSettings')}
          </Text>
        </View>
      ) : (
        <>
          {/* Account badge */}
          <View style={styles.accountBadge}>
            <Ionicons name="person-circle-outline" size={16} color={AppColors.primary} />
            <Text style={styles.accountBadgeText}>{selectedAccount?.username}</Text>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'create' && styles.tabActive]}
              onPress={() => setActiveTab('create')}
            >
              <Ionicons
                name="add-circle-outline"
                size={16}
                color={activeTab === 'create' ? '#fff' : 'rgba(255,255,255,0.5)'}
              />
              <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>
                {t('terminal:connectRepo.createNew')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'existing' && styles.tabActive]}
              onPress={() => setActiveTab('existing')}
            >
              <Ionicons
                name="folder-outline"
                size={16}
                color={activeTab === 'existing' ? '#fff' : 'rgba(255,255,255,0.5)'}
              />
              <Text style={[styles.tabText, activeTab === 'existing' && styles.tabTextActive]}>
                {t('terminal:connectRepo.existing')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={{ paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'create' ? (
              <View style={styles.createForm}>
                <Text style={styles.label}>{t('terminal:connectRepo.repoName')}</Text>
                <Input
                  value={repoName}
                  onChangeText={setRepoName}
                  placeholder="my-awesome-project"
                  noGlass
                  style={{ marginBottom: 4 }}
                  inputStyle={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)' }}
                />

                <Text style={styles.label}>{t('terminal:connectRepo.descriptionOptional')}</Text>
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('terminal:connectRepo.descriptionPlaceholder')}
                  multiline
                  numberOfLines={2}
                  noGlass
                  style={{ marginBottom: 4 }}
                  inputStyle={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)' }}
                />

                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Ionicons
                      name={isPrivate ? 'lock-closed' : 'globe-outline'}
                      size={18}
                      color={isPrivate ? '#f59e0b' : '#22c55e'}
                    />
                    <View>
                      <Text style={styles.switchLabel}>
                        {isPrivate ? t('terminal:connectRepo.privateRepo') : t('terminal:connectRepo.publicRepo')}
                      </Text>
                      <Text style={styles.switchHint}>
                        {isPrivate
                          ? t('terminal:connectRepo.privateHint')
                          : t('terminal:connectRepo.publicHint')}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={isPrivate}
                    onValueChange={setIsPrivate}
                    trackColor={{ false: 'rgba(255,255,255,0.2)', true: `${AppColors.primary}50` }}
                    thumbColor={isPrivate ? AppColors.primary : '#f4f3f4'}
                  />
                </View>

                <Button
                  label={loading ? "" : t('terminal:connectRepo.createAndConnect')}
                  onPress={handleCreateRepo}
                  disabled={loading || !repoName.trim()}
                  variant="primary"
                  noGlass
                  style={{ marginTop: 16, borderRadius: 14 }}
                />
              </View>
            ) : (
              <View style={styles.existingList}>
                <Input
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t('terminal:connectRepo.searchRepos')}
                  style={{ marginBottom: 8 }}
                />

                {reposLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={AppColors.primary} />
                  </View>
                ) : filteredRepos.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="folder-open-outline" size={40} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyText}>
                      {searchQuery ? t('terminal:connectRepo.noReposFound') : t('terminal:connectRepo.noReposAvailable')}
                    </Text>
                  </View>
                ) : (
                  filteredRepos.map((repo) => (
                    <TouchableOpacity
                      key={repo.id}
                      style={styles.repoItem}
                      onPress={() => handleSelectRepo(repo)}
                      disabled={loading}
                    >
                      <View style={styles.repoIcon}>
                        <Ionicons
                          name={repo.isPrivate ? 'lock-closed' : 'globe-outline'}
                          size={16}
                          color={repo.isPrivate ? '#f59e0b' : '#22c55e'}
                        />
                      </View>
                      <View style={styles.repoInfo}>
                        <Text style={styles.repoName}>{repo.name}</Text>
                        {repo.description && (
                          <Text style={styles.repoDescription} numberOfLines={1}>
                            {repo.description}
                          </Text>
                        )}
                        <View style={styles.repoMeta}>
                          {repo.language && (
                            <Text style={styles.repoLanguage}>{repo.language}</Text>
                          )}
                          <Text style={styles.repoStars}>
                            <Ionicons name="star" size={10} color="rgba(255,255,255,0.4)" /> {repo.stars}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <Animated.View
        style={styles.backdrop}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[styles.container, { backgroundColor: '#121216' }]}
          entering={SlideInDown.duration(300)}
          exiting={SlideOutDown.duration(200)}
        >
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={{
                flex: 1,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                overflow: 'hidden',
                borderWidth: 1.5,
                borderBottomWidth: 0,
                borderColor: 'rgba(255,255,255,0.2)',
                backgroundColor: 'rgba(18, 18, 22, 0.65)',
              }}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              {renderModalContent()}
            </LiquidGlassView>
          ) : (
            <View style={[styles.container, {
              backgroundColor: 'rgba(18, 18, 22, 0.92)',
              borderWidth: 1.5,
              borderBottomWidth: 0,
              borderColor: 'rgba(255,255,255,0.2)',
            }]}>
              {renderModalContent()}
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    width: '100%',
    maxHeight: '85%',
    minHeight: 400,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalInner: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#24292e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: `${AppColors.primary}15`,
    borderRadius: 8,
  },
  accountBadgeText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.primary,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tabActive: {
    backgroundColor: AppColors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  createForm: {
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },
  switchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  switchHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  existingList: {
    gap: 8,
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    marginBottom: 6,
  },
  repoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  repoInfo: {
    flex: 1,
  },
  repoName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  repoDescription: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  repoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  repoLanguage: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  repoStars: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  noAccountContainer: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  noAccountText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  noAccountSubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
});
