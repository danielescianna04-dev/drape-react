import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
} from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { GitHubConnect } from './GitHubConnect';
import { ProjectItem } from './ProjectItem';
import { workstationService } from '../../../core/workstation/workstationService';
import { NewFolderModal } from './NewFolderModal';
import { NewProjectModal } from './NewProjectModal';
import { ImportGitHubModal } from './ImportGitHubModal';

interface Props {
  onClose: () => void;
}

export const Sidebar = ({ onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'projects'>('projects');
  const [searchQuery, setSearchQuery] = useState('');
  const slideAnim = useRef(new Animated.Value(-300)).current;

  const {
    chatHistory,
    isGitHubConnected,
    gitHubRepositories,
    gitHubUser,
    selectedRepository,
    setSelectedRepository,
    addTerminalItem,
    loadWorkstations,
  } = useTerminalStore();

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();

    // Carica workstations da Firestore
    const loadData = async () => {
      const workstations = await workstationService.getWorkstations();
      loadWorkstations(workstations);
    };
    loadData();
  }, []);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: -300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
      <LinearGradient
        colors={['rgba(28, 28, 30, 0.98)', 'rgba(15, 15, 20, 0.96)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Drape</Text>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <View style={styles.closeButtonBg}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={18} color="rgba(255, 255, 255, 0.5)" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search..."
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
          />
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setActiveTab('projects')}
          style={[
            styles.tab,
            activeTab === 'projects' && styles.tabActive,
          ]}
        >
          <Ionicons
            name="folder"
            size={20}
            color={activeTab === 'projects' ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'projects' && styles.tabTextActive,
            ]}
          >
            Progetti
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('chat')}
          style={[
            styles.tab,
            activeTab === 'chat' && styles.tabActive,
          ]}
        >
          <Ionicons
            name="chatbubbles"
            size={20}
            color={activeTab === 'chat' ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'chat' && styles.tabTextActive,
            ]}
          >
            Chats
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'projects' ? (
          <ProjectsList onClose={handleClose} addTerminalItem={addTerminalItem} />
        ) : (
          <ChatList chats={chatHistory} />
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerButton}>
          <Ionicons name="add-circle-outline" size={24} color={AppColors.primary} />
          <Text style={styles.footerButtonText}>New Chat</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const ChatList = ({ chats }: any) => {
  if (chats.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="chatbubbles-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
        <Text style={styles.emptyText}>No chats yet</Text>
      </View>
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
          <Ionicons name="chevron-forward" size={20} color="rgba(255, 255, 255, 0.4)" />
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
            <Text style={styles.userRepos}>{repositories.length} repositories</Text>
          </View>
        </View>
      )}

      {repositories.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Nessuna repository trovata</Text>
        </View>
      ) : (
        repositories.map((repo: any) => (
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
                <Ionicons name="star-outline" size={14} color="rgba(255, 255, 255, 0.5)" />
                <Text style={styles.repoMetaText}>{repo.stargazers_count}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
};

const ProjectsList = ({ onClose, addTerminalItem }: { onClose: () => void; addTerminalItem: any }) => {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ projectId: string } | null>(null);
  
  const { 
    workstations, 
    addWorkstation, 
    setWorkstation, 
    removeWorkstation,
    projectFolders, 
    addProjectFolder,
    toggleFolderExpanded,
    removeProjectFolder,
    moveProjectToFolder
  } = useTerminalStore();

  const handleCreateProject = (name: string, language: string) => {
    const newWorkstation = {
      id: 'ws-' + Date.now(),
      name,
      language,
      status: 'idle' as const,
      createdAt: new Date(),
      files: [],
      folderId: null,
    };
    addWorkstation(newWorkstation);
  };

  const handleImportFromGitHub = (repoUrl: string) => {
    const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'Imported';
    const newWorkstation = {
      id: 'ws-' + Date.now(),
      name: repoName,
      language: 'Unknown',
      status: 'idle' as const,
      createdAt: new Date(),
      files: [],
      githubUrl: repoUrl,
      folderId: null,
    };
    addWorkstation(newWorkstation);
  };

  const handleCreateFolder = (name: string) => {
    const folder = {
      id: 'folder-' + Date.now(),
      name,
      parentId: null,
      isExpanded: true,
      createdAt: new Date(),
    };
    addProjectFolder(folder);
  };

  const handleOpenWorkstation = (ws: any) => {
    setWorkstation(ws);
    addTerminalItem({
      id: Date.now().toString(),
      type: 'output',
      content: `Opened workstation: ${ws.name}`,
      timestamp: new Date(),
    });
    onClose();
  };

  const handleDeleteWorkstation = (id: string, e: any) => {
    e.stopPropagation();
    if (confirm('Eliminare questo progetto?')) {
      removeWorkstation(id);
    }
  };

  const handleMoveToFolder = (projectId: string, folderId: string | null) => {
    moveProjectToFolder(projectId, folderId);
    setContextMenu(null);
  };

  return (
    <View style={styles.list}>
      <NewProjectModal
        visible={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onConfirm={handleCreateProject}
      />

      <ImportGitHubModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onConfirm={handleImportFromGitHub}
      />

      <NewFolderModal
        visible={showNewFolderModal}
        onClose={() => setShowNewFolderModal(false)}
        onConfirm={handleCreateFolder}
      />

      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity 
          style={styles.compactButton}
          onPress={() => setShowNewProjectModal(true)}
        >
          <Ionicons name="add-circle-outline" size={20} color={AppColors.primary} />
          <Text style={styles.compactButtonText}>Nuovo</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.compactButton}
          onPress={() => setShowImportModal(true)}
        >
          <Ionicons name="logo-github" size={20} color={AppColors.primary} />
          <Text style={styles.compactButtonText}>Importa</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.compactButton}
          onPress={() => setShowNewFolderModal(true)}
        >
          <Ionicons name="folder-open-outline" size={20} color="#FFA500" />
          <Text style={styles.compactButtonText}>Cartella</Text>
        </TouchableOpacity>
      </View>

      {projectFolders.length === 0 && workstations.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="folder-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
          <Text style={styles.emptyText}>Nessun progetto</Text>
        </View>
      ) : (
        <>
          {projectFolders.map((folder) => (
            <View key={folder.id}>
              <TouchableOpacity 
                style={styles.folderItem}
                onPress={() => toggleFolderExpanded(folder.id)}
              >
                <Ionicons 
                  name={folder.isExpanded ? "chevron-down" : "chevron-forward"} 
                  size={16} 
                  color="rgba(255, 255, 255, 0.5)" 
                />
                <Ionicons name="folder" size={18} color="#FFA500" />
                <Text style={styles.folderName}>{folder.name}</Text>
                <TouchableOpacity 
                  onPress={(e) => {
                    e.stopPropagation();
                    if (confirm('Eliminare questa cartella?')) {
                      removeProjectFolder(folder.id);
                    }
                  }}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={14} color="#FF4444" />
                </TouchableOpacity>
              </TouchableOpacity>

              {folder.isExpanded && workstations
                .filter((w) => w.folderId === folder.id)
                .map((ws) => (
                  <TouchableOpacity 
                    key={ws.id} 
                    style={styles.projectItemInFolder}
                    onPress={() => handleOpenWorkstation(ws)}
                  >
                    <View style={styles.projectHeader}>
                      <Ionicons name="document" size={14} color={AppColors.primary} />
                      <Text style={styles.projectName} numberOfLines={1}>{ws.name}</Text>
                      <TouchableOpacity onPress={(e) => handleDeleteWorkstation(ws.id, e)} style={styles.deleteButton}>
                        <Ionicons name="trash-outline" size={14} color="#FF4444" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
            </View>
          ))}

          {workstations
            .filter((w) => !w.folderId)
            .map((ws) => (
              <TouchableOpacity 
                key={ws.id} 
                style={styles.projectItem}
                onPress={() => handleOpenWorkstation(ws)}
              >
                <View style={styles.projectHeader}>
                  <Ionicons name="folder" size={16} color={AppColors.primary} />
                  <Text style={styles.projectName} numberOfLines={1}>{ws.name}</Text>
                  <TouchableOpacity 
                    onPress={(e) => {
                      e.stopPropagation();
                      setContextMenu({ projectId: ws.id });
                    }} 
                    style={styles.menuButton}
                  >
                    <Ionicons name="ellipsis-vertical" size={16} color="rgba(255, 255, 255, 0.5)" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={(e) => handleDeleteWorkstation(ws.id, e)} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={16} color="#FF4444" />
                  </TouchableOpacity>
                </View>
                <View style={styles.projectMeta}>
                  {ws.language && (
                    <View style={styles.languageTag}>
                      <Text style={styles.languageText}>{ws.language}</Text>
                    </View>
                  )}
                  <View style={styles.projectStatus}>
                    <View style={[styles.statusDot, { backgroundColor: ws.status === 'running' ? '#00FF88' : '#FFA500' }]} />
                    <Text style={styles.statusText}>{ws.status}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
        </>
      )}

      {contextMenu && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setContextMenu(null)}
        >
          <TouchableOpacity 
            style={styles.contextMenuOverlay}
            activeOpacity={1}
            onPress={() => setContextMenu(null)}
          >
            <View style={styles.contextMenu}>
              <Text style={styles.contextMenuTitle}>Sposta in:</Text>
              
              <TouchableOpacity 
                style={styles.contextMenuItem}
                onPress={() => handleMoveToFolder(contextMenu.projectId, null)}
              >
                <Ionicons name="home-outline" size={18} color={AppColors.primary} />
                <Text style={styles.contextMenuText}>Root</Text>
              </TouchableOpacity>

              {projectFolders.map((folder) => (
                <TouchableOpacity 
                  key={folder.id}
                  style={styles.contextMenuItem}
                  onPress={() => handleMoveToFolder(contextMenu.projectId, folder.id)}
                >
                  <Ionicons name="folder" size={18} color="#FFA500" />
                  <Text style={styles.contextMenuText}>{folder.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
};
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
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '80%',
    maxWidth: 320,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: AppColors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  tabTextActive: {
    color: AppColors.primary,
  },
  content: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    color: 'rgba(255, 255, 255, 0.5)',
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
    color: '#fff',
    fontSize: 14,
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
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    color: '#FFFFFF',
  },
  listItemSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  userRepos: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  repoItem: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  repoItemSelected: {
    backgroundColor: 'rgba(111, 92, 255, 0.2)',
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
    color: '#FFFFFF',
  },
  repoDescription: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.6)',
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
    color: 'rgba(255, 255, 255, 0.5)',
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
    color: '#FFFFFF',
    marginBottom: 8,
  },
  cloneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cloneInput: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
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
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  projectName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  projectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  languageTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    borderRadius: 6,
  },
  languageText: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.primary,
  },
  projectUrl: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
  },
  projectStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.primary,
  },

  deleteButton: {
    padding: 4,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.3)',
    marginBottom: 12,
  },
  importButtonText: {
    color: AppColors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  newProjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.3)',
    marginBottom: 12,
  },
  newProjectText: {
    color: AppColors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  compactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.2)',
  },
  compactButtonText: {
    color: AppColors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.2)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 6,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0, 255, 136, 0.3)',
  },
  menuButton: {
    padding: 4,
    marginRight: 4,
  },
  contextMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    minWidth: 250,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.2)',
  },
  contextMenuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 12,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginBottom: 8,
  },
  contextMenuText: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
});
