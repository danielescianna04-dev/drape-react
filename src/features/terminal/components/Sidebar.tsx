import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  Modal,} from 'react-native';
import { SafeText } from '../../../shared/components/SafeText';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

interface Props {
  onClose: () => void;
  onOpenAllProjects?: () => void;
}

export const Sidebar = ({ onClose, onOpenAllProjects }: Props) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'projects'>('projects');
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedRepoUrl, setSelectedRepoUrl] = useState('');
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
    addWorkstation,
    workstations,
    projectFolders,
    toggleFolderExpanded,
    removeProjectFolder,
    setWorkstation,
    removeWorkstation,
    userId,
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

  const handleOpenWorkstation = (ws: any) => {
    setSelectedProjectId(ws.projectId || ws.id);
    setSelectedRepoUrl(ws.githubUrl || '');
  };

  const handleDeleteWorkstation = async (id: string, e: any) => {
    e.stopPropagation();
    await removeWorkstation(id);
  };

  const handleCreateFolder = (name: string) => {
    console.log("Create folder:", name);
  };

  const handleImportRepo = async (url: string, token?: string) => {
    try {
      const userId = useTerminalStore.getState().userId || 'anonymous';
      
      // Save token if provided
      if (token) {
        const match = url.match(/github\.com\/([^\/]+)\//);
        if (match) {
          await githubTokenService.saveToken(match[1], token, userId);
        }
      }
      
      const project = await workstationService.saveGitProject(url, userId);
      const wsResult = await workstationService.createWorkstationForProject(project, token);
      
      const workstation = {
        id: wsResult.workstationId || project.id,
        projectId: project.id,
        name: project.name,
        language: 'Unknown',
        status: wsResult.status as any,
        createdAt: project.createdAt,
        files: [],
        githubUrl: project.repositoryUrl,
        folderId: null,
      };
      
      addWorkstation(workstation);
      setShowImportModal(false);
      setSearchQuery('');
    } catch (error: any) {
      console.log('🔴 Import error details:', {
        status: error.response?.status,
        data: error.response?.data,
        requiresAuth: error.response?.data?.requiresAuth,
        hasToken: !!token
      });
      
      // If 401 and requiresAuth, show auth modal
      if (error.response?.status === 401 && !token) {
        console.log('🔐 Opening auth modal for:', url);
        setPendingRepoUrl(url);
        setShowAuthModal(true);
        setShowImportModal(false);
      }
    }
  };

  return (
    <>
      <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
      <LinearGradient
        colors={['#1e1e1e', '#1a1a1a']}
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
          <View style={styles.searchIconContainer}>
            <Ionicons name="search" size={18} color="rgba(255, 255, 255, 0.6)" />
          </View>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Cerca progetti..."
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchButton}
            >
              <Ionicons name="close-circle" size={18} color="rgba(255, 255, 255, 0.5)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setActiveTab('projects')}
          style={[
            styles.tab,
            activeTab === 'projects' && styles.tabActive,
          ]}
          activeOpacity={0.7}
        >
          <View style={styles.tabContent}>
            <View style={[
              styles.tabIconContainer,
              activeTab === 'projects' && styles.tabIconContainerActive
            ]}>
              <Ionicons
                name="folder"
                size={18}
                color={activeTab === 'projects' ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'}
              />
            </View>
            <Text
              style={[
                styles.tabText,
                activeTab === 'projects' && styles.tabTextActive,
              ]}
            >
              Progetti
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('chat')}
          style={[
            styles.tab,
            activeTab === 'chat' && styles.tabActive,
          ]}
          activeOpacity={0.7}
        >
          <View style={styles.tabContent}>
            <View style={[
              styles.tabIconContainer,
              activeTab === 'chat' && styles.tabIconContainerActive
            ]}>
              <Ionicons
                name="chatbubbles"
                size={18}
                color={activeTab === 'chat' ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'}
              />
            </View>
            <Text
              style={[
                styles.tabText,
                activeTab === 'chat' && styles.tabTextActive,
              ]}
            >
              Chats
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {selectedProjectId ? (
          <View style={styles.fileExplorerContainer}>
            <View style={styles.fileExplorerHeader}>
              <TouchableOpacity 
                onPress={() => setSelectedProjectId(null)}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={20} color={AppColors.primary} />
                <Text style={styles.backButtonText}>Progetti</Text>
              </TouchableOpacity>
            </View>
            <FileExplorer 
              projectId={selectedProjectId} 
              onFileSelect={(path) => {
                setSelectedFile(path);
              }}
            />
          </View>
        ) : activeTab === 'projects' ? (
          <>
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => setShowNewProjectModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.actionButtonIconContainer}>
                  <Ionicons name="add-circle" size={20} color={AppColors.primary} />
                </View>
                <Text style={styles.actionButtonText}>Nuovo</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => setShowImportModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.actionButtonIconContainer}>
                  <Ionicons name="cloud-download" size={20} color={AppColors.primary} />
                </View>
                <Text style={styles.actionButtonText}>Importa</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => setShowNewFolderModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.actionButtonIconContainer}>
                  <Ionicons name="folder" size={20} color={AppColors.primary} />
                </View>
                <Text style={styles.actionButtonText}>Cartella</Text>
              </TouchableOpacity>
            </View>

            {projectFolders.length === 0 && workstations.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
                <Text style={styles.emptyText}>Nessun progetto</Text>
              </View>
            ) : (
              <>
                {workstations
                  .filter((w) => !w.folderId)
                  .map((ws) => (
                    <TouchableOpacity 
                      key={ws.id} 
                      style={styles.projectItem}
                      onPress={() => handleOpenWorkstation(ws)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.projectItemContent}>
                        <View style={styles.projectHeader}>
                          <View style={styles.projectIconContainer}>
                            <Ionicons name="document-text" size={18} color={AppColors.primary} />
                          </View>
                          <View style={styles.projectInfo}>
                            <SafeText style={styles.projectName} numberOfLines={1}>{ws.name || 'Unnamed Project'}</SafeText>
                            <Text style={styles.projectLanguage}>{ws.language || 'Unknown'}</Text>
                          </View>
                          <TouchableOpacity 
                            onPress={(e) => handleDeleteWorkstation(ws.id, e)} 
                            style={styles.deleteButton}
                            activeOpacity={0.6}
                          >
                            <Ionicons name="trash" size={16} color="#FF6B6B" />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.projectStatus}>
                          <View style={[styles.statusDot, { backgroundColor: ws.status === 'running' ? AppColors.primary : 'rgba(255, 255, 255, 0.4)' }]} />
                          <Text style={styles.statusText}>{ws.status || 'idle'}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
              </>
            )}

            {showImportModal && (
              <Modal
                visible={true}
                transparent
                animationType="fade"
                onRequestClose={() => setShowImportModal(false)}
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                      <Ionicons name="cloud-download-outline" size={28} color="#58A6FF" />
                      <SafeText style={styles.modalTitle}>Importa da GitHub</SafeText>
                    </View>
                    
                    <TextInput
                      style={styles.modalInput}
                      placeholder="https://github.com/user/repo"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(text) => setSearchQuery(text)}
                      returnKeyType="done"
                    />
                    
                    <View style={styles.modalButtons}>
                      <TouchableOpacity 
                        style={styles.modalCancelButton}
                        onPress={() => setShowImportModal(false)}
                      >
                        <SafeText style={styles.modalCancelText}>Annulla</SafeText>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={styles.modalSubmitButton}
                        onPress={async () => {
                          const url = searchQuery.trim();
                          if (url) {
                            await handleImportRepo(url);
                          }
                        }}
                      >
                        <SafeText style={styles.modalSubmitText}>Importa</SafeText>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
            )}
          </>
        ) : (
          <ChatList chats={chatHistory} />
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.footerButton} 
          onPress={onOpenAllProjects}
          activeOpacity={0.7}
        >
          <View style={styles.footerButtonContent}>
            <Ionicons name="grid" size={20} color={AppColors.primary} />
            <Text style={styles.footerButtonText}>All Projects</Text>
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>

    <GitHubAuthModal
      visible={showAuthModal}
      repositoryUrl={pendingRepoUrl}
      onAuthenticate={async (token) => {
        setShowAuthModal(false);
        await handleImportRepo(pendingRepoUrl, token);
        setPendingRepoUrl('');
      }}
      onCancel={() => {
        setShowAuthModal(false);
        setPendingRepoUrl('');
      }}
    />

    <FileViewer
      visible={!!selectedFile}
      projectId={selectedProjectId || ''}
      filePath={selectedFile || ''}
      repositoryUrl={selectedRepoUrl}
      userId={userId || 'anonymous'}
      onClose={() => setSelectedFile(null)}
    />
    </>  );
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
            <SafeText style={styles.userRepos}>{(repositories || []).length} repositories</SafeText>
          </View>
        </View>
      )}

      {(repositories || []).length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Nessuna repository trovata</Text>
        </View>
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
                <Ionicons name="star-outline" size={14} color="rgba(255, 255, 255, 0.5)" />
                <Text style={styles.repoMetaText}>{String(repo.stargazers_count || 0)}</Text>
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
    moveProjectToFolder,
    reorderWorkstations
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
    console.log('🔵 handleImportFromGitHub called with:', repoUrl);
    try {
      console.log('🔵 Processing repo URL...');
      const repoName = String(repoUrl || '').split('/').pop()?.replace('.git', '') || 'Imported';
      console.log('🔵 Repo name:', repoName);
      
      const newWorkstation = {
        id: 'ws-' + Date.now(),
        name: String(repoName),
        language: 'Unknown',
        status: 'idle' as const,
        createdAt: new Date(),
        files: [],
        githubUrl: String(repoUrl || ''),
        folderId: null,
      };
      console.log('🔵 New workstation:', newWorkstation);
      
      console.log('🔵 Adding workstation...');
      addWorkstation(newWorkstation);
      console.log('🔵 Workstation added successfully');
    } catch (error) {
      console.error('🔴 Import error:', error);
    }
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
      content: `Opened workstation: ${ws.name || 'Unnamed Project'}`,
      timestamp: new Date(),
    });
    onClose();
  };

  const handleDeleteWorkstation = async (id: string, e: any) => {
    e.stopPropagation();
    await removeWorkstation(id);
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

      <Modal
        visible={showImportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImportModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: '#1a1a1a', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontSize: 20, fontWeight: '600', color: '#FFFFFF', marginBottom: 20 }}>Import GitHub Repo</Text>
            <TextInput
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12, color: '#FFFFFF', marginBottom: 20 }}
              placeholder="https://github.com/user/repo.git"
              placeholderTextColor="rgba(255,255,255,0.4)"
              onSubmitEditing={(e) => {
                const url = String(e.nativeEvent.text || '').trim();
                if (url) {
                  handleImportFromGitHub(url);
                  setShowImportModal(false);
                }
              }}
            />
            <TouchableOpacity 
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 8, alignItems: 'center' }}
              onPress={() => setShowImportModal(false)}
            >
              <Text style={{ color: '#FFFFFF' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
          <Ionicons name="grid-outline" size={20} color={AppColors.primary} />
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
            <DropZoneFolder
              key={folder.id}
              folder={folder}
              isExpanded={folder.isExpanded}
              onToggle={() => toggleFolderExpanded(folder.id)}
              onDelete={() => {
                removeProjectFolder(folder.id);
              }}
            >
              {workstations
                .filter((w) => w.folderId === folder.id)
                .map((ws) => (
                  <TouchableOpacity 
                    key={ws.id} 
                    style={styles.projectItemInFolder}
                    onPress={() => handleOpenWorkstation(ws)}
                  >
                    <View style={styles.projectHeader}>
                      <Ionicons name="document" size={14} color={AppColors.primary} />
                      <SafeText style={styles.projectName} numberOfLines={1}>{ws.name || 'Unnamed Project'}</SafeText>
                      <TouchableOpacity onPress={(e) => handleDeleteWorkstation(ws.id, e)} style={styles.deleteButton}>
                        <Ionicons name="trash-outline" size={14} color="#FF4444" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
            </DropZoneFolder>
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
                  <Ionicons name="document" size={16} color={AppColors.primary} />
                  <SafeText style={styles.projectName} numberOfLines={1}>{ws.name || 'Unnamed Project'}</SafeText>
                  <TouchableOpacity onPress={(e) => handleDeleteWorkstation(ws.id, e)} style={styles.deleteButton}>
                    <Ionicons name="trash-outline" size={16} color="#FF4444" />
                  </TouchableOpacity>
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

// Modal component separato per evitare problemi di sintassi
const ImportModal = ({ visible, onClose, onImport }: { visible: boolean; onClose: () => void; onImport: (url: string) => void }) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <View style={{ width: '100%', maxWidth: 400, backgroundColor: '#1a1a1a', borderRadius: 16, padding: 24 }}>
        <SafeText style={{ fontSize: 20, fontWeight: '600', color: '#FFFFFF', marginBottom: 20 }}>Import GitHub Repo</SafeText>
        <TextInput
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12, color: '#FFFFFF', marginBottom: 20 }}
          placeholder="https://github.com/user/repo.git"
          placeholderTextColor="rgba(255,255,255,0.4)"
          onSubmitEditing={(e) => {
            const url = String(e.nativeEvent.text || '').trim();
            if (url) {
              onImport(url);
              onClose();
            }
          }}
        />
        <TouchableOpacity 
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 8, alignItems: 'center' }}
          onPress={onClose}
        >
          <SafeText style={{ color: '#FFFFFF' }}>Cancel</SafeText>
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
    backgroundColor: 'transparent',
    zIndex: 999,
  },  container: {
    position: 'absolute',
    left: 50,
    top: 0,
    bottom: 0,
    width: '70%',
    maxWidth: 280,
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
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
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
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 8,
  },
  searchIconContainer: {
    padding: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  clearSearchButton: {
    padding: 2,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    marginHorizontal: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconContainerActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
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
    marginBottom: 8,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  projectItemContent: {
    padding: 8,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  projectIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  projectLanguage: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
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
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  languageText: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
  },
  projectUrl: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
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
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
  },
  footerButton: {
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  footerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.primary,
  },

  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 13,
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
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  actionButtonIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
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
    backgroundColor: 'rgba(28, 28, 30, 0.98)',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    color: '#FFFFFF',
  },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 15,
    fontWeight: '500',
  },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: '#58A6FF',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  fileExplorerContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  fileExplorerHeader: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
  },
});
