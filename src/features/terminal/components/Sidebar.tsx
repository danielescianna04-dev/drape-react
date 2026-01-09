import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  Modal,
  PanResponder,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeText } from '../../../shared/components/SafeText';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { GitHubConnect } from './GitHubConnect';
import { ProjectItem } from './ProjectItem';
import { workstationService } from '../../../core/workstation/workstationService-firebase';
import { NewFolderModal } from './NewFolderModal';
import { NewProjectModal } from './NewProjectModal';
import { ImportGitHubModal } from './ImportGitHubModal';
import { DraggableProject } from './DraggableProject';
import { DropZoneFolder } from './DropZoneFolder';
import { FileExplorer } from './FileExplorer';
import { GitHubAuthModal } from './GitHubAuthModal';
import { FileViewer } from './FileViewer';
import { githubTokenService } from '../../../core/github/githubTokenService';
import { gitAccountService } from '../../../core/git/gitAccountService';
import { useTabStore } from '../../../core/tabs/tabStore';
import { EmptyState } from '../../../shared/components/organisms';
import { IconButton } from '../../../shared/components/atoms';
import { useNetworkConfig } from '../../../providers/NetworkConfigProvider';
import { useFileCacheStore } from '../../../core/cache/fileCacheStore';

// 🚀 HOLY GRAIL MODE - Uses Fly.io MicroVMs instead of Coder
const USE_HOLY_GRAIL = true;

interface Props {
  onClose: () => void;
  onOpenAllProjects?: () => void;
}

export const Sidebar = ({ onClose, onOpenAllProjects }: Props) => {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Get currentWorkstation from store to initialize state
  const currentWorkstationFromStore = useTerminalStore(state => state.currentWorkstation);

  // Initialize selectedProjectId and selectedRepoUrl from currentWorkstation if available
  // This ensures they're set correctly even on initial mount (not just on change)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    if (currentWorkstationFromStore) {
      return currentWorkstationFromStore.projectId || currentWorkstationFromStore.id || null;
    }
    return null;
  });
  const [selectedRepoUrl, setSelectedRepoUrl] = useState(() => {
    if (currentWorkstationFromStore) {
      return currentWorkstationFromStore.repositoryUrl || currentWorkstationFromStore.githubUrl || '';
    }
    return '';
  });

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<{ hasChanges: boolean; message: string } | null>(null);
  const [isCheckingGit, setIsCheckingGit] = useState(false);

  const { addTab, addTerminalItem: addTerminalItemToStore, removeTabsByWorkstation } = useTabStore();
  const { apiUrl } = useNetworkConfig();

  const {
    chatHistory,
    isGitHubConnected,
    gitHubRepositories,
    gitHubUser,
    selectedRepository,
    setSelectedRepository,
    addTerminalItem,
    loadWorkstations,
    addWorkstation,
    workstations,
    projectFolders,
    toggleFolderExpanded,
    removeProjectFolder,
    setWorkstation,
    removeWorkstation,
    userId,
    currentWorkstation,
  } = useTerminalStore();


  useEffect(() => {
    // Carica workstations da Firestore
    const loadData = async () => {
      const workstations = await workstationService.getWorkstations();
      loadWorkstations(workstations);
    };
    loadData();
  }, []);

  // Auto-open current project if exists - always sync with currentWorkstation
  useEffect(() => {
    console.log('📂 Sidebar: useEffect triggered, currentWorkstation:', currentWorkstation ? currentWorkstation.id : 'null');

    if (currentWorkstation) {
      const projectId = currentWorkstation.projectId || currentWorkstation.id;
      // Check both repositoryUrl and githubUrl as the URL can be stored in either
      const repoUrl = currentWorkstation.repositoryUrl || currentWorkstation.githubUrl || '';

      // Always update the selected project and repo URL when currentWorkstation changes
      setSelectedProjectId(projectId);
      setSelectedRepoUrl(repoUrl);

      console.log('📂 Sidebar: synced with currentWorkstation', { projectId, repoUrl });
    } else {
      // Clear selection when no workstation is set
      console.log('📂 Sidebar: no currentWorkstation, clearing selection');
      setSelectedProjectId(null);
      setSelectedRepoUrl('');
    }
  }, [currentWorkstation]);

  const handleClose = () => {
    onClose();
  };

  const handleOpenWorkstation = async (ws: any) => {
    const repoUrl = ws.repositoryUrl || ws.githubUrl || '';

    // If it's a git project, check auth BEFORE opening
    if (repoUrl) {
      console.log('🔍 Checking auth before opening project...');

      // Try to get saved token for this repo
      const userId = useTerminalStore.getState().userId || 'anonymous';
      let savedToken: string | null = null;
      try {
        const tokenData = await gitAccountService.getTokenForRepo(userId, repoUrl);
        savedToken = tokenData?.token || null;
      } catch (e) {
        console.log('No saved token found');
      }

      // Check visibility with the saved token (if any)
      try {
        const response = await fetch(`${apiUrl}/repo/check-visibility`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repositoryUrl: repoUrl, githubToken: savedToken }),
        });

        const data = await response.json();

        if (!response.ok || data.requiresAuth) {
          console.log('🔐 Auth required before opening project');
          setPendingRepoUrl(repoUrl);
          setShowAuthModal(true);
          return; // Don't open project - wait for auth
        }
      } catch (error) {
        console.error('Error checking visibility:', error);
        // Continue anyway - let FileExplorer handle the error
      }

      // VM warmup is now handled in ProjectsHomeScreen.handleProjectOpen
    }

    // Auth OK or not a git project - open it
    console.log('✅ Opening project');
    setWorkstation(ws);
    setSelectedProjectId(ws.projectId || ws.id);
    setSelectedRepoUrl(repoUrl);
  };

  const handleDeleteWorkstation = async (id: string, e: any, name?: string) => {
    e.stopPropagation();

    // Store the target for deletion
    setDeleteTarget({ id, name: name || 'Progetto' });
    setIsCheckingGit(true);
    setShowDeleteModal(true);
    setDeleteWarning(null);

    // Check git status for unsaved changes
    try {
      const response = await fetch(`${apiUrl}/workstation/${id}/git-status`);
      const data = await response.json();

      if (data.hasUncommittedChanges || data.hasUnpushedCommits) {
        let warningMsg = '⚠️ Attenzione! ';
        if (data.hasUncommittedChanges) {
          warningMsg += `Ci sono ${data.uncommittedFiles?.length || 'alcune'} modifiche non committate. `;
        }
        if (data.hasUnpushedCommits) {
          warningMsg += `Ci sono ${data.unpushedCount || 'alcuni'} commit non pushati su Git.`;
        }
        setDeleteWarning({ hasChanges: true, message: warningMsg });
      } else {
        setDeleteWarning({ hasChanges: false, message: 'Tutto sincronizzato con Git.' });
      }
    } catch (error) {
      console.log('Could not check git status:', error);
      setDeleteWarning({ hasChanges: false, message: 'Impossibile verificare lo stato Git.' });
    } finally {
      setIsCheckingGit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      console.log('🗑️ [Sidebar] Starting delete for:', deleteTarget.id);

      // 1. Remove all tabs associated with this project (including chats)
      removeTabsByWorkstation(deleteTarget.id);

      // 2. Delete from backend AND Firebase using workstationService
      // This handles both: cloned files on backend + document in Firebase
      await workstationService.deleteProject(deleteTarget.id);

      // 3. Remove from local store
      await removeWorkstation(deleteTarget.id);

      console.log('✅ [Sidebar] Project completely deleted:', deleteTarget.id);
    } catch (error) {
      console.error('❌ [Sidebar] Error deleting workstation:', error);
    } finally {
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setDeleteWarning(null);
    }
  };

  const handleCreateFolder = (name: string) => {
    console.log("Create folder:", name);
  };

  const handleImportRepo = async (url: string, token?: string) => {
    try {
      const userId = useTerminalStore.getState().userId || 'anonymous';

      // STEP 1: Check if repo requires authentication BEFORE importing
      console.log('🔍 Checking repo visibility before import...');
      const visibilityResponse = await fetch(`${apiUrl}/repo/check-visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryUrl: url, githubToken: token }),
      });

      const visibilityData = await visibilityResponse.json();

      // If auth required, show modal and STOP - don't proceed with import
      if (!visibilityResponse.ok || visibilityData.requiresAuth) {
        console.log('🔐 Repository requires authentication - showing auth modal');
        setPendingRepoUrl(url);
        setShowAuthModal(true);
        setShowImportModal(false);
        return; // Stop here - don't create workstation
      }

      console.log('✅ Repository is accessible, proceeding with import...');

      // Save token if provided
      if (token) {
        const match = url.match(/github\.com\/([^\/]+)\//);
        if (match) {
          await githubTokenService.saveToken(match[1], token, userId);
        }
      }

      // STEP 2: Now safe to create the project and workstation
      const project = await workstationService.saveGitProject(url, userId);
      const wsResult = await workstationService.createWorkstationForProject(project, token);

      const workstation = {
        id: wsResult.workstationId || project.id,
        projectId: project.id,
        name: project.name,
        language: 'Unknown',
        status: wsResult.status as any,
        createdAt: project.createdAt,
        files: wsResult.files || [],
        repositoryUrl: project.repositoryUrl,
        folderId: null,
      };

      // SEED CACHE: If files returned, cache them immediately
      if (wsResult.files && wsResult.files.length > 0) {
        console.log(`🚀 [Sidebar] Seeding cache for imported project: ${wsResult.files.length} files`);
        // For file explorer, we store simpler paths - ensure they are strings
        const filePaths = wsResult.files.map((f: any) => typeof f === 'string' ? f : f.path);
        useFileCacheStore.getState().setFiles(project.id, filePaths);
      }

      addWorkstation(workstation);
      setShowImportModal(false);
    } catch (error: any) {
      console.log('🔴 Import error:', error.message);
      console.error('Import failed:', error.response?.data?.message || error.message);
    }
  };

  // Debug: log render state
  console.log('📂 Sidebar RENDER - selectedProjectId:', selectedProjectId, 'currentWorkstation:', currentWorkstation?.id);

  return (
    <>
      <View
        style={[
          styles.container
        ]}
      >
        <View style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, backgroundColor: AppColors.dark.backgroundAlt }} />
        </View>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Files</Text>
          <IconButton
            iconName="close"
            size={20}
            color={AppColors.white.w40}
            onPress={handleClose}
            accessibilityLabel="Chiudi sidebar"
          />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={true}
          scrollEventThrottle={16}
          contentContainerStyle={{ flexGrow: 1 }}
          nestedScrollEnabled={true}
        >
          {selectedProjectId ? (
            <View style={styles.fileExplorerContainer}>
              <FileExplorer
                projectId={selectedProjectId}
                repositoryUrl={selectedRepoUrl}
                onFileSelect={(path) => {
                  addTab({
                    id: `file-${selectedProjectId}-${path}`,
                    type: 'file',
                    title: path.split('/').pop() || 'File',
                    data: {
                      projectId: selectedProjectId,
                      filePath: path,
                      repositoryUrl: selectedRepoUrl,
                    }
                  });
                  onClose();
                }}
                onAuthRequired={(repoUrl) => {
                  console.log('🔐 FileExplorer requires auth for:', repoUrl);
                  setPendingRepoUrl(repoUrl);
                  setShowAuthModal(true);
                }}
              />
            </View>
          ) : (
            <EmptyState
              icon="folder-open-outline"
              title="Nessun progetto aperto"
              subtitle="Apri un progetto dalla Home per vedere i file"
            />
          )}
        </ScrollView>
      </View>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <View style={styles.deleteModalHeader}>
              <Ionicons
                name={deleteWarning?.hasChanges ? "warning" : "trash"}
                size={32}
                color={deleteWarning?.hasChanges ? "#FF6B6B" : AppColors.primary}
              />
              <Text style={styles.deleteModalTitle}>
                Elimina "{deleteTarget?.name}"?
              </Text>
            </View>

            {isCheckingGit ? (
              <View style={styles.deleteModalLoading}>
                <ActivityIndicator size="small" color={AppColors.primary} />
                <Text style={styles.deleteModalLoadingText}>Controllo modifiche Git...</Text>
              </View>
            ) : (
              <Text style={[
                styles.deleteModalMessage,
                deleteWarning?.hasChanges && styles.deleteModalWarning
              ]}>
                {deleteWarning?.message || 'Questa azione eliminerà il progetto e tutti i file locali.'}
              </Text>
            )}

            {deleteWarning?.hasChanges && !isCheckingGit && (
              <Text style={styles.deleteModalSubWarning}>
                Queste modifiche andranno perse se non le salvi prima su Git.
              </Text>
            )}

            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={styles.deleteModalCancelBtn}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                  setDeleteWarning(null);
                }}
              >
                <Text style={styles.deleteModalCancelText}>Annulla</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.deleteModalDeleteBtn,
                  deleteWarning?.hasChanges && styles.deleteModalDeleteBtnDanger
                ]}
                onPress={confirmDelete}
                disabled={isCheckingGit}
              >
                <Text style={styles.deleteModalDeleteText}>
                  {deleteWarning?.hasChanges ? 'Elimina comunque' : 'Elimina'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <GitHubAuthModal
        visible={showAuthModal}
        repositoryUrl={pendingRepoUrl}
        onAuthenticated={async (token) => {
          setShowAuthModal(false);
          await handleImportRepo(pendingRepoUrl, token);
          setPendingRepoUrl('');
        }}
        onClose={() => {
          setShowAuthModal(false);
          setPendingRepoUrl('');
        }}
      />
    </>);
};

const ChatList = ({ chats }: any) => {
  if (chats.length === 0) {
    return (
      <EmptyState
        icon="chatbubbles-outline"
        title="No chats yet"
      />
    );
  }

  return (
    <View style={styles.list}>
      {chats.map((chat: any) => (
        <TouchableOpacity key={chat.id} style={styles.listItem}>
          <View style={styles.listItemContent}>
            <Text style={styles.listItemTitle}>{chat.title}</Text>
            <Text style={styles.listItemSubtitle}>{chat.messages.length} messages</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={AppColors.white.w40} />
        </TouchableOpacity>
      ))}
    </View>
  );
};

const GitHubList = ({ repositories, isConnected, user, selectedRepo, onSelectRepo }: any) => {
  if (!isConnected) {
    return <GitHubConnect />;
  }

  return (
    <View style={styles.list}>
      {user && (
        <View style={styles.userInfo}>
          <Ionicons name="person-circle" size={40} color={AppColors.primary} />
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{user.name || user.login}</Text>
            <SafeText style={styles.userRepos}>{(repositories || []).length} repositories</SafeText>
          </View>
        </View>
      )}

      {(repositories || []).length === 0 ? (
        <EmptyState
          icon="logo-github"
          title="Nessuna repository trovata"
        />
      ) : (
        (repositories || []).map((repo: any) => (
          <TouchableOpacity
            key={repo.id}
            style={[
              styles.repoItem,
              selectedRepo?.id === repo.id && styles.repoItemSelected,
            ]}
            onPress={() => onSelectRepo(repo)}
          >
            <View style={styles.repoHeader}>
              <Ionicons
                name={repo.private ? 'lock-closed' : 'logo-github'}
                size={16}
                color={AppColors.primary}
              />
              <Text style={styles.repoName} numberOfLines={1}>{repo.name}</Text>
            </View>

            {repo.description && (
              <Text style={styles.repoDescription} numberOfLines={2}>
                {repo.description}
              </Text>
            )}

            <View style={styles.repoMeta}>
              {repo.language && (
                <View style={styles.repoMetaItem}>
                  <View style={[styles.languageDot, { backgroundColor: getLanguageColor(repo.language) }]} />
                  <Text style={styles.repoMetaText}>{repo.language}</Text>
                </View>
              )}
              <View style={styles.repoMetaItem}>
                <Ionicons name="star-outline" size={14} color={AppColors.white.w50} />
                <Text style={styles.repoMetaText}>{String(repo.stargazers_count || 0)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
};



// Modal component separato per evitare problemi di sintassi
const ImportModal = ({ visible, onClose, onImport }: { visible: boolean; onClose: () => void; onImport: (url: string) => void }) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <View style={{ width: '100%', maxWidth: 400, backgroundColor: AppColors.dark.surfaceAlt, borderRadius: 16, padding: 24 }}>
        <SafeText style={{ fontSize: 20, fontWeight: '600', color: AppColors.white.full, marginBottom: 20 }}>Import GitHub Repo</SafeText>
        <TextInput
          style={{ backgroundColor: AppColors.white.w06, borderRadius: 8, padding: 12, color: AppColors.white.full, marginBottom: 20 }}
          placeholder="https://github.com/user/repo.git"
          placeholderTextColor={AppColors.white.w40}
          onSubmitEditing={(e) => {
            const url = String(e.nativeEvent.text || '').trim();
            if (url) {
              onImport(url);
              onClose();
            }
          }}
        />
        <TouchableOpacity
          style={{ backgroundColor: AppColors.white.w10, padding: 12, borderRadius: 8, alignItems: 'center' }}
          onPress={onClose}
        >
          <SafeText style={{ color: AppColors.white.full }}>Cancel</SafeText>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);
const getLanguageColor = (language: string): string => {
  const colors: Record<string, string> = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572A5',
    Java: '#b07219',
    Go: '#00ADD8',
    Rust: '#dea584',
    Ruby: '#701516',
    PHP: '#4F5D95',
    Swift: '#ffac45',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
  };
  return colors[language] || '#8b949e';
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: AppColors.dark.overlay,
    zIndex: 999,
  },
  container: {
    position: 'absolute',
    left: 44,
    top: 0,
    bottom: 0,
    width: '55%',
    maxWidth: 220,
    zIndex: 1000,
    shadowColor: AppColors.black.full,
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.white.w60,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  searchContainer: {
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: AppColors.white.w10,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
    gap: 8,
  },
  searchIconContainer: {
    padding: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: AppColors.white.full,
    fontWeight: '500',
  },
  clearSearchButton: {
    padding: 2,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 8,
    backgroundColor: AppColors.white.w04,
    borderRadius: 16,
    marginHorizontal: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: AppColors.white.w06,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  tabActive: {
    backgroundColor: AppColors.primaryAlpha.a15,
    borderColor: AppColors.primary,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tabIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: AppColors.white.w06,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconContainerActive: {
    backgroundColor: AppColors.primaryAlpha.a20,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.white.w60,
  },
  tabTextActive: {
    color: AppColors.primary,
  },
  content: {
    flex: 1,
  },
  connectButton: {
    marginTop: 24,
  },
  connectGradient: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  connectButtonText: {
    color: AppColors.white.full,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    padding: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w06,
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    color: AppColors.white.full,
  },
  listItemSubtitle: {
    fontSize: 12,
    color: AppColors.white.w50,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w10,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.white.full,
  },
  userRepos: {
    fontSize: 12,
    color: AppColors.white.w50,
    marginTop: 2,
  },
  repoItem: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: AppColors.white.w04,
  },
  repoItemSelected: {
    backgroundColor: AppColors.primaryAlpha.a20,
    borderWidth: 1,
    borderColor: AppColors.primary,
  },
  repoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  repoName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.white.full,
  },
  repoDescription: {
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.white.w60,
    marginBottom: 8,
  },
  repoMeta: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  repoMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  repoMetaText: {
    fontSize: 12,
    color: AppColors.white.w50,
  },
  languageDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cloneContainer: {
    marginBottom: 20,
  },
  cloneLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.white.full,
    marginBottom: 8,
  },
  cloneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white.w06,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  cloneInput: {
    flex: 1,
    fontSize: 13,
    color: AppColors.white.full,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cloneButton: {
    padding: 10,
    backgroundColor: AppColors.primary,
    borderRadius: 10,
    margin: 4,
  },
  cloneButtonDisabled: {
    opacity: 0.5,
  },
  projectItem: {
    marginBottom: 2,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w06,
  },
  projectItemContent: {
    padding: 8,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
  },
  projectIconContainer: {
    width: 16,
    height: 16,
    borderRadius: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 12,
    fontWeight: '500',
    color: AppColors.white.full,
    marginBottom: 0,
  },
  projectLanguage: {
    fontSize: 9,
    color: AppColors.white.w60,
    fontWeight: '500',
  },
  projectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  languageTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'transparent',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a40,
  },
  languageText: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
  },
  projectUrl: {
    fontSize: 11,
    color: AppColors.white.w60,
    marginBottom: 4,
  },
  projectStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    color: AppColors.white.w60,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: AppColors.white.w10,
    padding: 8,
  },
  footerButton: {
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AppColors.white.w10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  footerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
  },
  footerButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.primary,
  },

  deleteButton: {
    width: 20,
    height: 20,
    borderRadius: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a40,
    marginBottom: 8,
  },
  importButtonText: {
    color: AppColors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  newProjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: AppColors.primaryAlpha.a10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a40,
    marginBottom: 12,
  },
  newProjectText: {
    color: AppColors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AppColors.white.w15,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
  },
  actionButtonIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: AppColors.white.w60,
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: AppColors.white.w06,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  folderName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFA500',
  },
  projectItemInFolder: {
    padding: 10,
    marginLeft: 24,
    marginBottom: 6,
    backgroundColor: AppColors.white.w04,
    borderRadius: 6,
    borderLeftWidth: 2,
    borderLeftColor: AppColors.primaryAlpha.a40,
  },
  menuButton: {
    padding: 4,
    marginRight: 4,
  },
  contextMenuOverlay: {
    flex: 1,
    backgroundColor: AppColors.dark.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    backgroundColor: AppColors.dark.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    minWidth: 250,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a20,
  },
  contextMenuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.white.w60,
    marginBottom: 12,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: AppColors.white.w04,
    marginBottom: 8,
  },
  contextMenuText: {
    fontSize: 14,
    color: AppColors.white.full,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: AppColors.dark.surface,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: AppColors.white.full,
  },
  modalInput: {
    backgroundColor: AppColors.white.w06,
    borderRadius: 12,
    padding: 14,
    color: AppColors.white.full,
    fontSize: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: AppColors.white.w10,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: AppColors.white.w60,
    fontSize: 15,
    fontWeight: '500',
  },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: AppColors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: AppColors.white.full,
    fontSize: 15,
    fontWeight: '600',
  },
  fileExplorerContainer: {
    flex: 1,
  },
  fileViewerContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  fileExplorerHeader: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.white.w10,
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: AppColors.white.w06,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
  },
  compactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: AppColors.white.w06,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  compactButtonText: {
    color: AppColors.white.w60,
    fontSize: 14,
    fontWeight: '600',
  },
  // Delete Modal Styles
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deleteModalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(28, 28, 30, 0.98)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  deleteModalHeader: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  deleteModalLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  deleteModalLoadingText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  deleteModalMessage: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  deleteModalWarning: {
    color: '#FF6B6B',
  },
  deleteModalSubWarning: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginBottom: 16,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  deleteModalCancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteModalCancelText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 15,
    fontWeight: '500',
  },
  deleteModalDeleteBtn: {
    flex: 1,
    backgroundColor: AppColors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteModalDeleteBtnDanger: {
    backgroundColor: '#FF6B6B',
  },
  deleteModalDeleteText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
