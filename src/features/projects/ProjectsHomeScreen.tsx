import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Animated, Dimensions, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { AppColors } from '../../shared/theme/colors';
import { workstationService } from '../../core/workstation/workstationService-firebase';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { GitCommitsScreen } from '../settings/GitCommitsScreen';
import axios from 'axios';

interface Props {
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
  onOpenProject: (workstation: any) => void;
  onSettings?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ProjectsHomeScreen = ({ onCreateProject, onImportProject, onMyProjects, onOpenProject, onSettings }: Props) => {
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [repoVisibility, setRepoVisibility] = useState<'loading' | 'public' | 'private' | 'unknown'>('unknown');
  const [showCommits, setShowCommits] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    loadRecentProjects();

    Animated.loop(
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
    ).start();
  }, []);

  const loadRecentProjects = async () => {
    try {
      const workstations = await workstationService.getWorkstations();
      const recent = workstations
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);
      setRecentProjects(recent);
    } catch (error) {
      console.error('Error loading recent projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}g fa`;
    if (hours > 0) return `${hours}h fa`;
    return 'ora';
  };

  const handleBrowseFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        Alert.alert('File Selezionato', `${file.name}\nDimensione: ${((file.size || 0) / 1024).toFixed(1)} KB`);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Errore', 'Impossibile aprire il file picker');
    }
  };

  const checkRepoVisibility = async (repoUrl: string) => {
    try {
      setRepoVisibility('loading');
      // Extract owner/repo from GitHub URL
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        setRepoVisibility('unknown');
        return;
      }
      const owner = match[1];
      const repo = match[2].replace('.git', '');

      // Try to access the repo without authentication
      // If successful, it's public. If 404, it's private (or doesn't exist)
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
        timeout: 5000,
        validateStatus: (status) => status < 500, // Don't throw on 4xx
      });

      if (response.status === 200) {
        setRepoVisibility(response.data.private ? 'private' : 'public');
      } else if (response.status === 404) {
        // Private repo or doesn't exist - assume private
        setRepoVisibility('private');
      } else {
        setRepoVisibility('unknown');
      }
    } catch (error) {
      console.log('Error checking repo visibility:', error);
      setRepoVisibility('unknown');
    }
  };

  const handleOpenMenu = (project: any) => {
    setSelectedProject(project);
    setRepoVisibility('unknown');
    setMenuVisible(true);

    // Check repo visibility if it's a GitHub project
    const repoUrl = project.repositoryUrl || project.githubUrl;
    if (repoUrl && repoUrl.includes('github.com')) {
      checkRepoVisibility(repoUrl);
    }

    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const handleCloseMenu = () => {
    Animated.timing(sheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
      setSelectedProject(null);
    });
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;

    Alert.alert(
      'Elimina Progetto',
      `Sei sicuro di voler eliminare "${selectedProject.name}"?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ [Home] Deleting project:', selectedProject.id);
              // Delete from backend AND Firebase
              await workstationService.deleteProject(selectedProject.id);
              // Remove from local store
              await useTerminalStore.getState().removeWorkstation(selectedProject.id);
              handleCloseMenu();
              loadRecentProjects();
              console.log('✅ [Home] Project deleted:', selectedProject.id);
            } catch (error) {
              console.error('❌ [Home] Error deleting project:', error);
              Alert.alert('Errore', 'Impossibile eliminare il progetto');
            }
          },
        },
      ]
    );
  };

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  const SkeletonItem = () => (
    <View style={styles.skeletonItem}>
      <Animated.View style={[styles.skeletonIcon, { opacity: shimmerOpacity }]} />
      <View style={styles.skeletonContent}>
        <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
        <Animated.View style={[styles.skeletonSubtitle, { opacity: shimmerOpacity }]} />
      </View>
    </View>
  );

  const getLanguageIcon = (language: string) => {
    const lang = language?.toLowerCase() || '';
    if (lang.includes('react') || lang.includes('javascript')) return 'logo-react';
    if (lang.includes('python')) return 'logo-python';
    if (lang.includes('node')) return 'logo-nodejs';
    if (lang.includes('swift') || lang.includes('ios')) return 'logo-apple';
    if (lang.includes('android') || lang.includes('kotlin')) return 'logo-android';
    if (lang.includes('html') || lang.includes('css')) return 'logo-html5';
    return 'folder';
  };

  const getLanguageColor = (language: string) => {
    const lang = language?.toLowerCase() || '';
    if (lang.includes('react')) return '#61DAFB';
    if (lang.includes('javascript')) return '#F7DF1E';
    if (lang.includes('typescript')) return '#3178C6';
    if (lang.includes('python')) return '#3776AB';
    if (lang.includes('node')) return '#68A063';
    if (lang.includes('swift')) return '#FA7343';
    if (lang.includes('kotlin')) return '#7F52FF';
    return AppColors.primary;
  };

  const getRepoInfo = (url?: string) => {
    if (!url) return null;
    try {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace('.git', ''),
          full: `${match[1]}/${match[2].replace('.git', '')}`
        };
      }
    } catch {
      return null;
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoContainer}>
            <Ionicons name="code-slash" size={20} color={AppColors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Drape</Text>
            <Text style={styles.headerSubtitle}>Mobile IDE</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onSettings}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={24} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionLabel}>Inizia</Text>

          <View style={styles.quickActionsRow}>
            {/* New Project */}
            <TouchableOpacity
              style={styles.actionCard}
              activeOpacity={0.8}
              onPress={onCreateProject}
            >
              <LinearGradient
                colors={[AppColors.primary, '#7B6BFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.actionCardGradient}
              >
                <Ionicons name="add" size={26} color="#fff" />
                <Text style={styles.actionCardTitle}>Nuovo</Text>
                <Text style={styles.actionCardSubtitle}>Crea progetto</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Import from GitHub */}
            <TouchableOpacity
              style={[styles.actionCard, styles.actionCardDark]}
              activeOpacity={0.8}
              onPress={onImportProject}
            >
              <View style={styles.actionCardInner}>
                <Ionicons name="logo-github" size={24} color="#fff" />
                <Text style={styles.actionCardTitle}>GitHub</Text>
                <Text style={styles.actionCardSubtitle}>Clona repo</Text>
              </View>
            </TouchableOpacity>

            {/* Open File */}
            <TouchableOpacity
              style={[styles.actionCard, styles.actionCardDark]}
              activeOpacity={0.8}
              onPress={handleBrowseFiles}
            >
              <View style={styles.actionCardInner}>
                <Ionicons name="folder-open" size={24} color="rgba(255,255,255,0.85)" />
                <Text style={styles.actionCardTitle}>File</Text>
                <Text style={styles.actionCardSubtitle}>Apri locale</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Projects */}
        <View style={styles.projectsSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.4)" />
              <Text style={styles.sectionLabel}>Recenti</Text>
            </View>
            {recentProjects.length > 0 && (
              <TouchableOpacity onPress={onMyProjects} activeOpacity={0.7} style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>Tutti</Text>
                <Ionicons name="chevron-forward" size={14} color={AppColors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <>
              <SkeletonItem />
              <SkeletonItem />
              <SkeletonItem />
            </>
          ) : recentProjects.length > 0 ? (
            <>
              {recentProjects.map((project) => {
                const langColor = getLanguageColor(project.language);
                const repoInfo = getRepoInfo(project.repositoryUrl || project.githubUrl);
                return (
                  <TouchableOpacity
                    key={project.id}
                    style={styles.projectCard}
                    activeOpacity={0.7}
                    onPress={() => onOpenProject(project)}
                    onLongPress={() => handleOpenMenu(project)}
                    delayLongPress={400}
                  >
                    <View style={[styles.projectIcon, { backgroundColor: repoInfo ? 'rgba(255,255,255,0.08)' : `${langColor}15` }]}>
                      {repoInfo ? (
                        <Ionicons name="logo-github" size={20} color="#fff" />
                      ) : (
                        <Ionicons name={getLanguageIcon(project.language) as any} size={20} color={langColor} />
                      )}
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                      <View style={styles.projectMetaRow}>
                        {repoInfo ? (
                          <Text style={styles.projectRepoText} numberOfLines={1}>{repoInfo.full}</Text>
                        ) : (
                          <Text style={styles.projectLang}>{project.language || 'Progetto'}</Text>
                        )}
                        <View style={styles.metaDot} />
                        <Text style={styles.projectTime}>{getTimeAgo(project.createdAt)}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                  </TouchableOpacity>
                );
              })}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyTitle}>Nessun progetto</Text>
              <Text style={styles.emptySubtitle}>Crea il tuo primo progetto usando i pulsanti sopra</Text>
            </View>
          )}
        </View>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Project Menu Bottom Sheet */}
      {menuVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            style={[StyleSheet.absoluteFill, styles.sheetBackdrop]}
            onPress={handleCloseMenu}
          />
          <Animated.View
            style={[
              styles.sheetContainer,
              { transform: [{ translateY: sheetAnim }] }
            ]}
          >
            <View style={styles.sheetHandle}>
              <View style={styles.sheetHandleBar} />
            </View>

            {selectedProject && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetProjectIcon, { backgroundColor: `${getLanguageColor(selectedProject.language)}15` }]}>
                    <Ionicons
                      name={getLanguageIcon(selectedProject.language) as any}
                      size={20}
                      color={getLanguageColor(selectedProject.language)}
                    />
                  </View>
                  <View style={styles.sheetProjectInfo}>
                    <Text style={styles.sheetProjectName} numberOfLines={1}>{selectedProject.name}</Text>
                    <Text style={styles.sheetProjectMeta}>{selectedProject.language || 'Progetto'}</Text>
                  </View>
                </View>

                {/* Repository Info Section */}
                {(selectedProject.repositoryUrl || selectedProject.githubUrl) && (
                  <View style={styles.repoInfoSection}>
                    <View style={styles.repoInfoRow}>
                      <Ionicons name="logo-github" size={16} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.repoUrlText} numberOfLines={1}>
                        {getRepoInfo(selectedProject.repositoryUrl || selectedProject.githubUrl)?.full || 'Repository'}
                      </Text>
                      <TouchableOpacity
                        onPress={async () => {
                          const url = selectedProject.repositoryUrl || selectedProject.githubUrl;
                          await Clipboard.setStringAsync(url);
                          Alert.alert('Copiato', 'Link repository copiato negli appunti');
                        }}
                        style={styles.copyButton}
                      >
                        <Ionicons name="copy-outline" size={14} color="rgba(255,255,255,0.4)" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.repoVisibilityRow}>
                      {repoVisibility === 'loading' ? (
                        <ActivityIndicator size="small" color={AppColors.primary} />
                      ) : repoVisibility === 'public' ? (
                        <View style={styles.visibilityBadge}>
                          <Ionicons name="globe-outline" size={12} color="#4ade80" />
                          <Text style={[styles.visibilityText, { color: '#4ade80' }]}>Pubblica</Text>
                        </View>
                      ) : repoVisibility === 'private' ? (
                        <View style={styles.visibilityBadge}>
                          <Ionicons name="lock-closed-outline" size={12} color="#f59e0b" />
                          <Text style={[styles.visibilityText, { color: '#f59e0b' }]}>Privata</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                )}

                <View style={styles.sheetActions}>
                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={() => {
                    handleCloseMenu();
                    setTimeout(() => onOpenProject(selectedProject), 300);
                  }}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="open-outline" size={20} color="#fff" />
                    </View>
                    <Text style={styles.sheetActionText}>Apri</Text>
                  </TouchableOpacity>

                  {(selectedProject.repositoryUrl || selectedProject.githubUrl) && (
                    <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7} onPress={() => {
                      handleCloseMenu();
                      setTimeout(() => setShowCommits(true), 300);
                    }}>
                      <View style={[styles.sheetActionIcon, { backgroundColor: `${AppColors.primary}15` }]}>
                        <Ionicons name="git-commit-outline" size={20} color={AppColors.primary} />
                      </View>
                      <Text style={styles.sheetActionText}>Commit</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="copy-outline" size={20} color="#fff" />
                    </View>
                    <Text style={styles.sheetActionText}>Duplica</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="share-outline" size={20} color="#fff" />
                    </View>
                    <Text style={styles.sheetActionText}>Condividi</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.sheetActionItem} activeOpacity={0.7}>
                    <View style={styles.sheetActionIcon}>
                      <Ionicons name="create-outline" size={20} color="#fff" />
                    </View>
                    <Text style={styles.sheetActionText}>Rinomina</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.sheetDeleteButton}
                  activeOpacity={0.7}
                  onPress={handleDeleteProject}
                >
                  <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  <Text style={styles.sheetDeleteText}>Elimina progetto</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.sheetCancelButton} activeOpacity={0.7} onPress={handleCloseMenu}>
              <Text style={styles.sheetCancelText}>Annulla</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Git Commits Screen */}
      {showCommits && selectedProject && (selectedProject.repositoryUrl || selectedProject.githubUrl) && (
        <View style={StyleSheet.absoluteFill}>
          <GitCommitsScreen
            repositoryUrl={selectedProject.repositoryUrl || selectedProject.githubUrl}
            onClose={() => {
              setShowCommits(false);
              setSelectedProject(null);
            }}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${AppColors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${AppColors.primary}30`,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
  },
  // Quick Actions Section
  quickActionsSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  // Quick Actions Row - compact cards
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionCardGradient: {
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  actionCardDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionCardInner: {
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  actionCardSubtitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  // Projects Section
  projectsSection: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.primary,
  },
  // Project Card
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  projectIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  projectMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectRepoText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'monospace',
    maxWidth: '55%',
  },
  projectLang: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 8,
  },
  projectTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  // Skeleton
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
  },
  skeletonIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skeletonContent: {
    flex: 1,
    marginLeft: 12,
    gap: 8,
  },
  skeletonTitle: {
    width: '50%',
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skeletonSubtitle: {
    width: '30%',
    height: 12,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  // Bottom Sheet
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#141416',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetProjectIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetProjectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sheetProjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sheetProjectMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  repoInfoSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  repoInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  repoUrlText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace',
  },
  copyButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  repoVisibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  visibilityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetActionItem: {
    alignItems: 'center',
    gap: 8,
  },
  sheetActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  sheetDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
    borderRadius: 14,
  },
  sheetDeleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  sheetCancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
});
