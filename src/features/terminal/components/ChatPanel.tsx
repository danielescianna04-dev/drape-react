import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Dimensions, Keyboard, InteractionManager, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, Layout, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';
import { useChatStore } from '../../../core/terminal/chatStore';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { workstationService } from '../../../core/workstation/workstationService';
import type { WorkstationInfo } from '../../../shared/types';
import { useTabStore } from '../../../core/tabs/tabStore';
import { useUIStore } from '../../../core/terminal/uiStore';
import { useAuthStore } from '../../../core/auth/authStore';
import { useNavigationStore } from '../../../core/navigation/navigationStore';
import { ChatSession } from '../../../shared/types';
import { FolderPickerModal } from './FolderPickerModal';
import { tracciaNuovaChat, tracciaChatSelezionata, tracciaChatEliminata, tracciaChatRinominata, tracciaChatFissata, tracciaChatSpostataCartella, tracciaPannelloAperto } from '../../../core/services/analyticsService';
import { getAuthToken } from '../../../core/api/getAuthToken';
import { config } from '../../../config/config';

// ── Navigation section definitions ────────────────────────────────────
const NAV_SECTIONS = [
  { id: 'chat', icon: 'chatbubbles-outline' as const, label: 'Chat' },
  { id: 'files', icon: 'folder-outline' as const, label: 'File del progetto' },
  { id: 'preview', icon: 'eye-outline' as const, label: 'Preview' },
  { id: 'terminal', icon: 'terminal-outline' as const, label: 'Terminale' },
  { id: 'git', icon: 'git-branch-outline' as const, label: 'Git' },
  { id: 'buildReport', icon: 'time-outline' as const, label: 'Project History' },
] as const;

interface Props {
  onClose: () => void;
  onHidePreview?: () => void;
  onExit?: () => void;
}

const GRADIENT_PALETTES = [
  ['#6D4CFF', '#9E86FF'], // Purple / Indigo (Brand)
  ['#00D084', '#00F5A0'], // Emerald / Mint
  ['#FF8E53', '#FF6B8B'], // Coral / Rose
  ['#00c6ff', '#0072ff'], // Ocean Blue
  ['#F355DA', '#7000FF'], // Neon Purple / Pink
  ['#FF9966', '#FF5E62'], // Sunset Orange
  ['#3A1C71', '#D76D77'], // Mauve
  ['#11998e', '#38ef7d'], // Teal Green
] as const;

const getChatMetaTime = (date: Date | string | number | undefined): string => {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'now';
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
};

const ProjectChevron: React.FC<{ expanded: boolean }> = ({ expanded }) => {
  const rotation = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    rotation.value = withTiming(expanded ? 1 : 0, { duration: 180 });
  }, [expanded, rotation]);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 90}deg` }],
  }));
  return (
    <Animated.View style={[{ marginLeft: 8 }, animStyle]}>
      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.4)" />
    </Animated.View>
  );
};

export const ChatPanel = ({ onClose, onHidePreview, onExit }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [showProjectSearch, setShowProjectSearch] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuButtonRefs = useRef<Record<string, View | null>>({});
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [expandedNav, setExpandedNav] = useState<Record<string, boolean>>({ projects: true });
  const [projects, setProjects] = useState<WorkstationInfo[]>([]);
  const [folderPickerChat, setFolderPickerChat] = useState<ChatSession | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const {
    chatHistory, chatFolders, setCurrentChat, updateChat, deleteChat,
    loadChats, loadFolders, pinChat, unpinChat, moveChatToFolder, deleteFolder,
    currentChatSession,
  } = useChatStore();
  const { currentWorkstation, setWorkstation } = useWorkstationStore();
  const { addTab, tabs, removeTab, updateTab, setActiveTab } = useTabStore();
  const { user } = useAuthStore();

  // Load chats and folders from AsyncStorage — deferred to avoid blocking animations
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      loadChats();
      loadFolders();
    });
    return () => task.cancel();
  }, []);

  // Load projects list (shown at top of sidebar so user can switch context).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await workstationService.getWorkstations();
        if (!cancelled) {
          const sorted = [...list].sort((a, b) => {
            const da = a.lastOpened ? new Date(a.lastOpened).getTime() : new Date(a.createdAt).getTime();
            const db = b.lastOpened ? new Date(b.lastOpened).getTime() : new Date(b.createdAt).getTime();
            return db - da;
          });
          setProjects(sorted);
        }
      } catch (_e) {
        // best-effort
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-expand the active project folder when it changes
  useEffect(() => {
    if (currentWorkstation) {
      setCollapsedProjects((prev) => ({
        ...prev,
        [currentWorkstation.id]: false,
      }));
    }
  }, [currentWorkstation?.id]);

  // Filter projects/workstations by name search query
  const filteredProjects = useMemo(() => {
    if (!projectSearchQuery.trim()) {
      return projects;
    }
    return projects.filter((p) =>
      p.name.toLowerCase().includes(projectSearchQuery.toLowerCase())
    );
  }, [projects, projectSearchQuery]);

  // Toggle nav folder expansion
  const toggleNav = useCallback((id: string) => {
    setExpandedNav((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  // Toggle project folder expansion
  const toggleProjectCollapse = useCallback((projectId: string) => {
    setCollapsedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  }, []);

  const toggleProjectSearch = useCallback(() => {
    setShowProjectSearch((prev) => !prev);
    if (showProjectSearch) {
      setProjectSearchQuery('');
    }
  }, [showProjectSearch]);

  const toggleSearch = useCallback(() => {
    setShowSearch((prev) => {
      const next = !prev;
      if (!next) {
        setSearchQuery('');
      }
      return next;
    });
  }, []);

  // Filter chats by project ID or name and search query
  const getChatsForProject = useCallback((projectId: string, projectName: string) => {
    return chatHistory.filter((chat) => {
      const matchesSearch = chat.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesProject =
        chat.repositoryId === projectId ||
        chat.repositoryName === projectName;
      return matchesSearch && matchesProject;
    });
  }, [chatHistory, searchQuery]);

  // General chats (no project)
  const generalChats = useMemo(() => {
    return chatHistory.filter((chat) => {
      const matchesSearch = chat.title.toLowerCase().includes(searchQuery.toLowerCase());
      const hasNoProject = !chat.repositoryId && !chat.repositoryName;
      return matchesSearch && hasNoProject;
    });
  }, [chatHistory, searchQuery]);

  // ── Chat handlers ────────────────────────────────────────────────
  const handleSelectChat = useCallback((chat: ChatSession) => {
    tracciaChatSelezionata(chat.title || 'Untitled');
    setCurrentChat(chat);
    const targetTabId = `chat-${chat.id}`;
    const existingTab = tabs.find(t => t.type === 'chat' && t.data?.chatId === chat.id);
    if (existingTab) {
      setActiveTab(existingTab.id);
    } else {
      addTab({
        id: targetTabId,
        type: 'chat',
        title: chat.title || 'Chat',
        data: { chatId: chat.id },
        terminalItems: chat.messages || [],
      });
    }
    // Close every other chat tab — only one chat is open at a time.
    const otherChatTabs = useTabStore.getState().tabs.filter(
      (t) => t.type === 'chat' && t.id !== targetTabId,
    );
    otherChatTabs.forEach((t) => removeTab(t.id));
    onHidePreview?.();
    handleClose();
  }, [tabs, addTab, setActiveTab, setCurrentChat, removeTab, onHidePreview]);

  const handleSelectChatWithProject = useCallback((chat: ChatSession, project: WorkstationInfo) => {
    if (currentWorkstation?.id !== project.id) {
      setWorkstation(project);
    }
    handleSelectChat(chat);
  }, [currentWorkstation, setWorkstation, handleSelectChat]);

  const handleSelectGeneralChat = useCallback((chat: ChatSession) => {
    handleSelectChat(chat);
  }, [handleSelectChat]);

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectNameInput, setNewProjectNameInput] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [renameProject, setRenameProject] = useState<WorkstationInfo | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renamingProject, setRenamingProject] = useState(false);

  const refreshProjects = useCallback(async () => {
    try {
      const list = await workstationService.getWorkstations();
      const sorted = [...list].sort((a, b) => {
        const da = a.lastOpened ? new Date(a.lastOpened).getTime() : new Date(a.createdAt).getTime();
        const db = b.lastOpened ? new Date(b.lastOpened).getTime() : new Date(b.createdAt).getTime();
        return db - da;
      });
      setProjects(sorted);
    } catch {/* ignore */}
  }, []);

  const handleDeleteProject = useCallback((project: WorkstationInfo) => {
    Alert.alert(
      `Elimina "${project.name}"?`,
      'Questa azione non può essere annullata.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await workstationService.deleteWorkstation(project.id);
              if (currentWorkstation?.id === project.id) {
                setWorkstation(null);
              }
              await refreshProjects();
            } catch (err: any) {
              Alert.alert('Errore', err?.message ?? "Impossibile eliminare il progetto");
            }
          },
        },
      ],
    );
  }, [currentWorkstation?.id, setWorkstation, refreshProjects]);

  const openRenameProject = useCallback((project: WorkstationInfo) => {
    setRenameInput(project.name);
    setRenameProject(project);
  }, []);

  const confirmRenameProject = useCallback(async () => {
    if (!renameProject) return;
    const newName = renameInput.trim();
    if (!newName || newName === renameProject.name || renamingProject) {
      setRenameProject(null);
      return;
    }
    setRenamingProject(true);
    try {
      await workstationService.updateWorkstation(renameProject.id, { name: newName });
      if (currentWorkstation?.id === renameProject.id) {
        setWorkstation({ ...currentWorkstation, name: newName });
      }
      await refreshProjects();
      setRenameProject(null);
      setRenameInput('');
    } catch (err: any) {
      Alert.alert('Errore', err?.message ?? "Impossibile rinominare il progetto");
    } finally {
      setRenamingProject(false);
    }
  }, [renameProject, renameInput, renamingProject, currentWorkstation, setWorkstation, refreshProjects]);

  const onProjectLongPress = useCallback((project: WorkstationInfo) => {
    Alert.alert(
      project.name,
      undefined,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Rinomina', onPress: () => openRenameProject(project) },
        { text: 'Elimina', style: 'destructive', onPress: () => handleDeleteProject(project) },
      ],
    );
  }, [openRenameProject, handleDeleteProject]);

  const openNewProjectModal = useCallback(() => {
    setNewProjectNameInput('');
    setShowNewProjectModal(true);
  }, []);

  const confirmNewProject = useCallback(async () => {
    const name = newProjectNameInput.trim();
    if (!name || creatingProject) return;
    setCreatingProject(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`${config.apiUrl}/workstation/create-with-template`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: name, technology: 'react' }),
      });
      const data = await res.json();
      if (!data?.success) return;
      const list = await workstationService.getWorkstations();
      const sorted = [...list].sort((a, b) => {
        const da = a.lastOpened ? new Date(a.lastOpened).getTime() : new Date(a.createdAt).getTime();
        const db = b.lastOpened ? new Date(b.lastOpened).getTime() : new Date(b.createdAt).getTime();
        return db - da;
      });
      setProjects(sorted);
      const created = sorted.find((p) => p.id === data.projectId);
      if (created) {
        setWorkstation(created);
        setShowNewProjectModal(false);
        setNewProjectNameInput('');
        onClose?.();
      }
    } catch (err: any) {
      console.warn('[ChatPanel.confirmNewProject] failed', err?.message);
    } finally {
      setCreatingProject(false);
    }
  }, [newProjectNameInput, creatingProject, setWorkstation, onClose]);

  const handleNewChat = () => {
    const chatId = Date.now().toString();
    const newChat = {
      id: chatId,
      title: t('terminal:chat.newConversation'),
      createdAt: new Date(),
      lastUsed: new Date(),
      messages: [],
      aiModel: 'gemini-2.0-flash-exp',
      repositoryId: currentWorkstation?.id,
      repositoryName: currentWorkstation?.name,
    };
    useChatStore.getState().addChat(newChat);
    const newTabId = `chat-${chatId}`;
    addTab({
      id: newTabId,
      type: 'chat',
      title: t('terminal:chat.newConversation'),
      data: { chatId: chatId },
    });
    // Close every other chat tab — only one chat is open at a time.
    const otherChatTabs = useTabStore.getState().tabs.filter(
      (t) => t.type === 'chat' && t.id !== newTabId,
    );
    otherChatTabs.forEach((t) => removeTab(t.id));
    tracciaNuovaChat('fullpage');
    handleClose();
  };

  /**
   * Open a project: select its single chat (auto-create one if missing).
   * No expansion, no chevron — projects map 1:1 to their chat.
   */
  const handleOpenProject = useCallback((project: WorkstationInfo) => {
    setWorkstation(project);
    const existingChat = chatHistory.find(
      (c) => c.repositoryId === project.id || c.repositoryName === project.name,
    );
    if (existingChat) {
      handleSelectChat(existingChat);
      return;
    }
    // Inline chat creation for this project — same shape as handleNewChat
    const chatId = Date.now().toString();
    const newChat = {
      id: chatId,
      title: t('terminal:chat.newConversation'),
      createdAt: new Date(),
      lastUsed: new Date(),
      messages: [],
      aiModel: 'gemini-2.0-flash-exp',
      repositoryId: project.id,
      repositoryName: project.name,
    };
    useChatStore.getState().addChat(newChat);
    const newTabId = `chat-${chatId}`;
    addTab({
      id: newTabId,
      type: 'chat',
      title: t('terminal:chat.newConversation'),
      data: { chatId },
    });
    const otherChatTabs = useTabStore.getState().tabs.filter(
      (tab) => tab.type === 'chat' && tab.id !== newTabId,
    );
    otherChatTabs.forEach((tab) => removeTab(tab.id));
    handleClose();
  }, [chatHistory, setWorkstation, handleSelectChat, addTab, removeTab, t]);

  const handleMenuToggle = useCallback((chatId: string) => {
    if (openMenuId === chatId) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }
    const ref = menuButtonRefs.current[chatId];
    if (ref) {
      ref.measureInWindow((x, y, width, height) => {
        const screen = Dimensions.get('window');
        const menuWidth = 170;
        const estimatedMenuHeight = 190;
        const panelWidth = Math.min(screen.width * 0.55, 220);
        const panelRight = 44 + panelWidth;
        let menuX = panelRight + 4;
        if (menuX + menuWidth > screen.width - 8) {
          menuX = screen.width - menuWidth - 8;
        }
        const menuY = y;
        const adjustedY = (menuY + estimatedMenuHeight > screen.height - 40)
          ? screen.height - 40 - estimatedMenuHeight
          : menuY;
        setMenuPosition({ x: menuX, y: adjustedY });
        setOpenMenuId(chatId);
      });
    }
  }, [openMenuId]);

  const handleRename = (chat: ChatSession) => {
    setRenamingChatId(chat.id);
    setRenamingValue(chat.title);
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  const handleRenameSubmit = (chatId: string) => {
    if (renamingValue.trim()) {
      tracciaChatRinominata(renamingValue.trim());
      updateChat(chatId, { title: renamingValue.trim() });
      const chatTab = tabs.find(t => t.data?.chatId === chatId);
      if (chatTab) {
        updateTab(chatTab.id, { title: renamingValue.trim() });
      }
    }
    setRenamingChatId(null);
    setRenamingValue('');
  };

  const handleDelete = (chatId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t('common:confirmDelete'),
      t('common:deleteConfirmMessage', { name: chatHistory.find(c => c.id === chatId)?.title || '' }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: () => {
            tracciaChatEliminata();
            deleteChat(chatId);
            const chatTab = tabs.find(t => t.data?.chatId === chatId);
            if (chatTab) {
              removeTab(chatTab.id);
            }
            setOpenMenuId(null);
            setMenuPosition(null);
          },
        },
      ]
    );
  };

  const handleTogglePin = (chat: ChatSession) => {
    tracciaChatFissata(chat.pinned ? 'false' : 'true');
    if (chat.pinned) {
      unpinChat(chat.id);
    } else {
      pinChat(chat.id);
    }
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  const handleMoveToFolder = (chat: ChatSession) => {
    tracciaChatSpostataCartella();
    setFolderPickerChat(chat);
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  const handleRemoveFromFolder = (chat: ChatSession) => {
    moveChatToFolder(chat.id, undefined);
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  const handleDeleteFolder = (folderId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t('chat.deleteFolder'),
      t('chat.deleteFolderConfirm'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: () => deleteFolder(folderId),
        },
      ]
    );
  };

  const handleClose = () => {
    onClose();
  };

  // ── Navigation action handlers ────────────────────────────────────
  const handleOpenFiles = useCallback(async () => {
    Keyboard.dismiss();
    tracciaPannelloAperto('files');
    const projectId = currentWorkstation?.projectId || currentWorkstation?.id;
    if (!projectId) {
      Alert.alert('Error', 'No project selected');
      return;
    }
    try {
      const token = await getAuthToken();
      if (!token) {
        Alert.alert('Error', 'Authentication required');
        return;
      }
      const url = `${config.apiUrl}/files/${projectId}/browse?token=${encodeURIComponent(token)}`;
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to open file browser');
    }
    handleClose();
  }, [currentWorkstation]);

  const handleOpenPreview = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('preview');
    useUIStore.getState().requestOpenPreview();
    handleClose();
  }, []);

  const handleOpenTerminal = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('pty');
    const ptyTab = tabs.find(t => t.id === 'interactive-terminal');
    if (ptyTab) {
      setActiveTab('interactive-terminal');
    } else {
      addTab({
        id: 'interactive-terminal',
        type: 'pty' as any,
        title: 'Terminal',
        data: {},
      });
    }
    handleClose();
  }, [tabs, setActiveTab, addTab]);

  const handleOpenShell = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('terminal');
    const shellTab = tabs.find(t => t.id === 'shell');
    if (shellTab) {
      setActiveTab('shell');
    } else {
      addTab({
        id: 'shell',
        type: 'shell' as any,
        title: 'Logs',
        data: {},
      });
    }
    handleClose();
  }, [tabs, setActiveTab, addTab]);

  const handleOpenEnvVars = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('envVars');
    const envTab = tabs.find(t => t.id === 'env-vars');
    if (envTab) {
      setActiveTab('env-vars');
    } else {
      addTab({
        id: 'env-vars',
        type: 'envVars',
        title: 'Environment Variables',
        data: {},
      });
    }
    handleClose();
  }, [tabs, setActiveTab, addTab]);

  const handleOpenGit = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('git');
    handleClose();
    useUIStore.getState().requestOpenGitSheet(null);
  }, [tabs, setActiveTab, addTab]);

  const projectIdForPublish = currentWorkstation?.projectId || currentWorkstation?.id;

  useEffect(() => {
    if (!projectIdForPublish) { setIsPublished(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const r = await fetch(`${config.apiUrl}/fly/project/${projectIdForPublish}/published`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        if (!cancelled) setIsPublished(!!data?.published);
      } catch {
        if (!cancelled) setIsPublished(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectIdForPublish]);

  const handleOpenInsights = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('insights' as any);
    const tabId = `insights-${projectIdForPublish}`;
    const existing = tabs.find(t => t.id === tabId);
    if (existing) {
      setActiveTab(tabId);
    } else {
      addTab({
        id: tabId,
        type: 'insights' as any,
        title: 'Insights',
        data: { projectId: projectIdForPublish },
      });
    }
    handleClose();
  }, [projectIdForPublish, tabs, setActiveTab, addTab]);

  const handleOpenPlugins = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('plugins' as any);
    const tabId = 'plugins';
    const existing = tabs.find(t => t.id === tabId);
    if (existing) {
      setActiveTab(tabId);
    } else {
      addTab({
        id: tabId,
        type: 'plugins' as any,
        title: 'Plugin',
        data: {},
      });
    }
    handleClose();
  }, [tabs, setActiveTab, addTab]);

  const handleOpenMcps = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('mcps' as any);
    const tabId = 'mcps';
    const existing = tabs.find(t => t.id === tabId);
    if (existing) {
      setActiveTab(tabId);
    } else {
      addTab({
        id: tabId,
        type: 'mcps' as any,
        title: 'MCP',
        data: {},
      });
    }
    handleClose();
  }, [tabs, setActiveTab, addTab]);

  const handleOpenDatabase = useCallback(() => {
    Keyboard.dismiss();
    tracciaPannelloAperto('database');
    const dbTab = tabs.find(t => t.id === 'database');
    if (dbTab) {
      setActiveTab('database');
    } else {
      addTab({
        id: 'database',
        type: 'database' as any,
        title: 'Database',
        data: {},
      });
    }
    handleClose();
  }, [tabs, setActiveTab, addTab]);

  // ── Render tree-view components ──────────────────────────────────────────

  const renderChatLeaf = (chat: ChatSession, project?: WorkstationInfo) => {
    const isActive = currentChatSession?.id === chat.id;
    const timeMeta = getChatMetaTime(chat.lastUsed || chat.createdAt);

    return (
      <View key={chat.id} style={styles.chatLeafWrapper}>
        {renamingChatId === chat.id ? (
          <View style={styles.renameLeafContainer}>
            <TextInput
              style={styles.renameLeafInput}
              value={renamingValue}
              onChangeText={setRenamingValue}
              onSubmitEditing={() => handleRenameSubmit(chat.id)}
              autoFocus
              placeholder={t('terminal:chat.chatName')}
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
            <TouchableOpacity onPress={() => handleRenameSubmit(chat.id)} style={styles.renameAction}>
              <Ionicons name="checkmark" size={16} color={AppColors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRenamingChatId(null)} style={styles.renameAction}>
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        ) : (
          <View
            ref={(ref) => { menuButtonRefs.current[chat.id] = ref; }}
            collapsable={false}
          >
            <TouchableOpacity
              style={[
                styles.chatLeafRow,
                isActive && styles.chatLeafRowActive
              ]}
              onPress={() => project ? handleSelectChatWithProject(chat, project) : handleSelectGeneralChat(chat)}
              onLongPress={() => handleMenuToggle(chat.id)}
              activeOpacity={0.7}
            >
              {isActive && isLiquidGlassSupported && (
                <LiquidGlassView
                  style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}
                  interactive={true}
                  effect="clear"
                  colorScheme="dark"
                />
              )}
              <Text
                style={[
                  styles.chatLeafTitle,
                  isActive ? styles.chatLeafTitleActive : styles.chatLeafTitleInactive
                ]}
                numberOfLines={1}
              >
                {chat.title.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s?/u, '')}
              </Text>

              {isActive ? (
                <ActivityIndicator
                  size="small"
                  color="rgba(255, 255, 255, 0.6)"
                  style={styles.chatActiveSpinner}
                />
              ) : (
                timeMeta ? <Text style={styles.chatLeafTime}>{timeMeta}</Text> : null
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderProjectFolder = (project: WorkstationInfo) => {
    const isSelectedProject =
      currentWorkstation?.id === project.id ||
      currentWorkstation?.projectId === project.id;

    return (
      <View key={project.id} style={styles.projectFolderContainer}>
        <TouchableOpacity
          style={styles.projectFolderRow}
          onPress={() => handleOpenProject(project)}
          onLongPress={() => onProjectLongPress(project)}
          delayLongPress={350}
          activeOpacity={0.7}
        >
          <Ionicons
            name="folder-outline"
            size={18}
            color="rgba(255,255,255,0.55)"
            style={{ marginRight: 10 }}
          />
          <Text
            style={[
              styles.projectFolderName,
              isSelectedProject && styles.projectFolderNameSelected,
            ]}
            numberOfLines={1}
          >
            {project.name}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderGeneralChatsFolder = () => {
    if (generalChats.length === 0) return null;
    const isExpanded = !collapsedProjects['general'];
    return (
      <View key="general" style={styles.projectFolderContainer}>
        <TouchableOpacity
          style={styles.projectFolderRow}
          onPress={() => toggleProjectCollapse('general')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isExpanded ? "folder-open-outline" : "folder-outline"}
            size={18}
            color="rgba(255,255,255,0.5)"
            style={{ marginRight: 10 }}
          />
          <Text style={styles.projectFolderName}>General Conversations</Text>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.projectChatsContainer}>
            <View style={styles.treeIndentationGuide} />
            <View style={styles.projectChatsList}>
              {generalChats.map(chat => renderChatLeaf(chat))}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderNavFolder = (id: string, icon: keyof typeof Ionicons.glyphMap, label: string, children: React.ReactNode) => {
    const isExpanded = !!expandedNav[id];
    return (
      <View key={id} style={styles.projectFolderContainer}>
        <TouchableOpacity
          style={styles.projectFolderRow}
          onPress={() => toggleNav(id)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={icon}
            size={16}
            color="rgba(255,255,255,0.4)"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.projectFolderName}>{label}</Text>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.projectChatsContainer}>
            <View style={styles.treeIndentationGuide} />
            <View style={styles.projectChatsList}>
              {children}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderNavLeaf = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, color?: string) => {
    return (
      <TouchableOpacity
        style={styles.chatLeafRow}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Ionicons name={icon} size={14} color={color || "rgba(255, 255, 255, 0.4)"} style={{ marginRight: 6 }} />
        <Text style={[styles.chatLeafTitle, styles.chatLeafTitleInactive, color ? { color } : undefined]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // Preview status
  const previewServerUrl = useUIStore((s) => s.previewServerUrl);
  const projectPreviewUrls = useUIStore((s) => s.projectPreviewUrls);
  const hasPreview = !!(previewServerUrl || (currentWorkstation?.id && projectPreviewUrls[currentWorkstation.id]));

  return (
    <>
      <LinearGradient colors={['#151515', '#131313', '#111111']} locations={[0, 0.5, 1]} style={styles.container}>
        <View style={styles.containerInner}>

          {/* New Conversation pill removed — actions live in the Projects header below. */}

          {/* ═══ Scrollable Sidebar Tree ═══ */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

            {/* Projects Section Header */}
            <View style={styles.projectsHeaderRow}>
              <Text style={styles.projectsHeaderTitle}>Projects</Text>
              <View style={styles.projectsHeaderActions}>
                <TouchableOpacity
                  onPress={toggleSearch}
                  activeOpacity={0.7}
                  style={styles.projectsHeaderActionButton}
                  hitSlop={6}
                >
                  {isLiquidGlassSupported && (
                    <LiquidGlassView
                      style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}
                      interactive={true}
                      effect="clear"
                      colorScheme="dark"
                    />
                  )}
                  <Ionicons
                    name={showSearch ? 'close' : 'search-outline'}
                    size={16}
                    color="rgba(255,255,255,0.7)"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openNewProjectModal}
                  activeOpacity={0.7}
                  style={styles.projectsHeaderActionButton}
                  hitSlop={6}
                >
                  {isLiquidGlassSupported && (
                    <LiquidGlassView
                      style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}
                      interactive={true}
                      effect="clear"
                      colorScheme="dark"
                    />
                  )}
                  <Ionicons name="add" size={18} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              </View>
            </View>

            {showSearch && (
              <Animated.View
                entering={FadeIn}
                exiting={FadeOut}
                style={styles.collapsibleSearchContainer}
              >
                {isLiquidGlassSupported && (
                  <LiquidGlassView
                    style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: 'hidden' }]}
                    interactive={true}
                    effect="clear"
                    colorScheme="dark"
                  />
                )}
                <Ionicons name="search-outline" size={14} color="rgba(255,255,255,0.4)" />
                <TextInput
                  style={styles.globalSearchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search conversations..."
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoFocus
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                ) : null}
              </Animated.View>
            )}

            {/* Projects Filter Search Input */}
            {showProjectSearch && (
              <View style={styles.projectSearchContainer}>
                <Ionicons name="search-outline" size={12} color="rgba(255,255,255,0.4)" style={styles.projectSearchIcon} />
                <TextInput
                  style={styles.projectSearchInput}
                  value={projectSearchQuery}
                  onChangeText={setProjectSearchQuery}
                  placeholder="Filter projects..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  autoFocus
                />
                <TouchableOpacity onPress={() => { setShowProjectSearch(false); setProjectSearchQuery(''); }} style={styles.projectSearchCloseBtn}>
                  <Ionicons name="close" size={12} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>
            )}

            {/* Project Folders Tree */}
            {filteredProjects.map((p) => renderProjectFolder(p))}

          </ScrollView>

          {/* Bottom user pill: avatar + name + settings (liquid glass) */}
          <View style={styles.bottomUserBar}>
            <View style={styles.bottomUserPill}>
              {isLiquidGlassSupported && (
                <LiquidGlassView
                  style={[StyleSheet.absoluteFill, { borderRadius: 22, overflow: 'hidden' }]}
                  interactive={true}
                  effect="clear"
                  colorScheme="dark"
                />
              )}
              <View style={styles.bottomUserAvatar}>
                <Text style={styles.bottomUserAvatarText}>
                  {(user?.displayName || user?.email || 'D').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.bottomUserName} numberOfLines={1} ellipsizeMode="tail">
                {user?.displayName || user?.email || 'Drape'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.bottomSettingsBtn}
              onPress={() => useNavigationStore.getState().navigateTo('settings')}
              activeOpacity={0.7}
              hitSlop={6}
            >
              {isLiquidGlassSupported && (
                <LiquidGlassView
                  style={[StyleSheet.absoluteFill, { borderRadius: 22, overflow: 'hidden' }]}
                  interactive={true}
                  effect="clear"
                  colorScheme="dark"
                />
              )}
              <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Dropdown Menu Modal */}
      <Modal
        visible={!!openMenuId && !!menuPosition}
        transparent
        animationType="fade"
        onRequestClose={() => { setOpenMenuId(null); setMenuPosition(null); }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setOpenMenuId(null); setMenuPosition(null); }}
        >
          {menuPosition && openMenuId && (() => {
            const chat = chatHistory.find(c => c.id === openMenuId);
            if (!chat) return null;
            return (
              <View
                style={[styles.dropdown, { left: menuPosition.x, top: menuPosition.y }]}
                onStartShouldSetResponder={() => true}
              >
                {isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={[StyleSheet.absoluteFill, { borderRadius: 8, overflow: 'hidden' }]}
                    interactive={true}
                    effect="clear"
                    colorScheme="dark"
                  />
                ) : null}
                <View style={styles.dropdownInner}>
                  <TouchableOpacity style={styles.dropdownItem} onPress={() => handleTogglePin(chat)}>
                    <Ionicons name={chat.pinned ? 'pin-outline' : 'pin'} size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.dropdownText}>{chat.pinned ? t('chat.unpin') : t('chat.pin')}</Text>
                  </TouchableOpacity>
                  <View style={styles.dropdownDivider} />
                  {chat.folderId ? (
                    <TouchableOpacity style={styles.dropdownItem} onPress={() => handleRemoveFromFolder(chat)}>
                      <Ionicons name="folder-open-outline" size={16} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.dropdownText}>{t('chat.removeFromFolder')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.dropdownItem} onPress={() => handleMoveToFolder(chat)}>
                      <Ionicons name="folder-outline" size={16} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.dropdownText}>{t('chat.moveToFolder')}</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.dropdownDivider} />
                  <TouchableOpacity style={styles.dropdownItem} onPress={() => handleRename(chat)}>
                    <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.dropdownText}>{t('common:rename')}</Text>
                  </TouchableOpacity>
                  <View style={styles.dropdownDivider} />
                  <TouchableOpacity style={styles.dropdownItem} onPress={() => handleDelete(chat.id)}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    <Text style={[styles.dropdownText, { color: '#ef4444' }]}>{t('common:delete')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </TouchableOpacity>
      </Modal>

      {/* Folder Picker Modal */}
      <FolderPickerModal
        visible={!!folderPickerChat}
        onClose={() => setFolderPickerChat(null)}
        onSelectFolder={(folderId) => {
          if (folderPickerChat) {
            moveChatToFolder(folderPickerChat.id, folderId);
          }
          setFolderPickerChat(null);
        }}
        currentFolderId={folderPickerChat?.folderId}
      />

      {/* Rename project modal — same liquid glass style as the new-project modal */}
      <Modal
        visible={!!renameProject}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameProject(null)}
        statusBarTranslucent
      >
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity
          style={styles.newProjectBackdrop}
          activeOpacity={1}
          onPress={() => !renamingProject && setRenameProject(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.newProjectCardWrap}>
            <View style={styles.newProjectCard}>
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={[StyleSheet.absoluteFill, { borderRadius: 28, overflow: 'hidden' }]}
                  interactive={true}
                  effect="clear"
                  colorScheme="dark"
                />
              ) : (
                <LinearGradient
                  colors={['rgba(40, 38, 60, 0.85)', 'rgba(20, 18, 32, 0.92)']}
                  style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
                />
              )}
              <Text style={styles.newProjectTitle}>Rinomina progetto</Text>
              <Text style={styles.newProjectSubtitle}>Scegli un nuovo nome</Text>
              <View style={styles.newProjectInputWrap}>
                {isLiquidGlassSupported && (
                  <LiquidGlassView
                    style={[StyleSheet.absoluteFill, { borderRadius: 16, overflow: 'hidden' }]}
                    interactive={true}
                    effect="clear"
                    colorScheme="dark"
                  />
                )}
                <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.45)" style={{ marginLeft: 14 }} />
                <TextInput
                  value={renameInput}
                  onChangeText={setRenameInput}
                  placeholder="Nome progetto"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={styles.newProjectInput}
                  autoFocus
                  keyboardAppearance="dark"
                  maxLength={50}
                  onSubmitEditing={confirmRenameProject}
                  returnKeyType="done"
                  selectTextOnFocus
                />
              </View>
              <View style={styles.newProjectActions}>
                <TouchableOpacity
                  style={styles.newProjectCancelBtn}
                  onPress={() => setRenameProject(null)}
                  disabled={renamingProject}
                  activeOpacity={0.7}
                >
                  {isLiquidGlassSupported && (
                    <LiquidGlassView
                      style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}
                      interactive={true}
                      effect="clear"
                      colorScheme="dark"
                    />
                  )}
                  <Text style={styles.newProjectCancelText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.newProjectConfirmBtn,
                    (!renameInput.trim() || renamingProject) && styles.newProjectConfirmBtnDisabled,
                  ]}
                  onPress={confirmRenameProject}
                  disabled={!renameInput.trim() || renamingProject}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[AppColors.primary, '#8B6CFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {renamingProject ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.newProjectConfirmText}>Salva</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* New project modal — liquid glass */}
      <Modal
        visible={showNewProjectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewProjectModal(false)}
        statusBarTranslucent
      >
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity
          style={styles.newProjectBackdrop}
          activeOpacity={1}
          onPress={() => !creatingProject && setShowNewProjectModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.newProjectCardWrap}>
            <View style={styles.newProjectCard}>
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={[StyleSheet.absoluteFill, { borderRadius: 28, overflow: 'hidden' }]}
                  interactive={true}
                  effect="clear"
                  colorScheme="dark"
                />
              ) : (
                <LinearGradient
                  colors={['rgba(40, 38, 60, 0.85)', 'rgba(20, 18, 32, 0.92)']}
                  style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
                />
              )}

              <Text style={styles.newProjectTitle}>Nuovo progetto</Text>
              <Text style={styles.newProjectSubtitle}>Dai un nome al tuo prossimo capolavoro</Text>

              <View style={styles.newProjectInputWrap}>
                {isLiquidGlassSupported && (
                  <LiquidGlassView
                    style={[StyleSheet.absoluteFill, { borderRadius: 16, overflow: 'hidden' }]}
                    interactive={true}
                    effect="clear"
                    colorScheme="dark"
                  />
                )}
                <Ionicons
                  name="cube-outline"
                  size={16}
                  color="rgba(255,255,255,0.45)"
                  style={{ marginLeft: 14 }}
                />
                <TextInput
                  value={newProjectNameInput}
                  onChangeText={setNewProjectNameInput}
                  placeholder="Es. La mia app"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={styles.newProjectInput}
                  autoFocus
                  keyboardAppearance="dark"
                  maxLength={50}
                  onSubmitEditing={confirmNewProject}
                  returnKeyType="done"
                />
              </View>

              <View style={styles.newProjectActions}>
                <TouchableOpacity
                  style={styles.newProjectCancelBtn}
                  onPress={() => setShowNewProjectModal(false)}
                  disabled={creatingProject}
                  activeOpacity={0.7}
                >
                  {isLiquidGlassSupported && (
                    <LiquidGlassView
                      style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}
                      interactive={true}
                      effect="clear"
                      colorScheme="dark"
                    />
                  )}
                  <Text style={styles.newProjectCancelText}>Annulla</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.newProjectConfirmBtn,
                    (!newProjectNameInput.trim() || creatingProject) && styles.newProjectConfirmBtnDisabled,
                  ]}
                  onPress={confirmNewProject}
                  disabled={!newProjectNameInput.trim() || creatingProject}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[AppColors.primary, '#8B6CFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {creatingProject ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={styles.newProjectConfirmText}>Crea</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151515',
  },
  containerInner: {
    flex: 1,
    paddingTop: 64,
    maxWidth: 300,
  },
  topActionsContainer: {
    paddingHorizontal: 12,
    paddingBottom: 0,
    gap: 8,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newConversationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 0,
    overflow: 'hidden',
  },
  newConversationButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  searchCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  collapsibleSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 18,
    paddingHorizontal: 14,
    height: 36,
    marginTop: 8,
    gap: 8,
    overflow: 'hidden',
  },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  topActionText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  globalSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    padding: 0,
    height: '100%',
  },
  projectsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
  },
  projectsHeaderTitle: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  projectsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectsHeaderActionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  newProjectBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  newProjectCardWrap: {
    width: '100%',
    maxWidth: 380,
  },
  newProjectCard: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(28, 26, 40, 0.55)',
  },
  newProjectIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: AppColors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  newProjectTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  newProjectSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginBottom: 22,
    textAlign: 'center',
  },
  newProjectInputWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 20,
    overflow: 'hidden',
    minHeight: 50,
  },
  newProjectInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
  },
  newProjectActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    width: '100%',
  },
  newProjectCancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  newProjectCancelText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '500',
  },
  newProjectConfirmBtn: {
    flexDirection: 'row',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  newProjectConfirmBtnDisabled: {
    opacity: 0.4,
  },
  newProjectConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  projectSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 4,
    paddingHorizontal: 8,
    height: 26,
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 6,
  },
  projectSearchIcon: {
    marginRight: 2,
  },
  projectSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 11,
    padding: 0,
    height: '100%',
  },
  projectSearchCloseBtn: {
    padding: 2,
  },
  projectFolderContainer: {
    paddingHorizontal: 12,
    marginVertical: 1,
  },
  projectFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  projectFolderName: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.75)',
    flex: 1,
  },
  projectFolderNameSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  projectChatsContainer: {
    position: 'relative',
    paddingLeft: 18,
  },
  treeIndentationGuide: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  projectChatsList: {
    paddingVertical: 2,
  },
  emptyChatsText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.25)',
    paddingLeft: 8,
    paddingVertical: 4,
    fontStyle: 'italic',
  },
  chatLeafWrapper: {
    position: 'relative',
  },
  chatLeafRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginVertical: 2,
    minHeight: 36,
    overflow: 'hidden',
  },
  chatLeafRowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  chatLeafTitle: {
    flex: 1,
    fontSize: 14,
  },
  chatLeafTitleActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  chatLeafTitleInactive: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  chatActiveSpinner: {
    marginRight: 6,
    transform: [{ scale: 0.85 }],
  },
  chatLeafTime: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.30)',
    marginRight: 4,
  },
  leafMenuButton: {
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  renameLeafContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 4,
    height: 26,
    gap: 4,
  },
  renameLeafInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    padding: 0,
    height: '100%',
  },
  renameAction: {
    padding: 2,
  },
  extraSectionsContainer: {
    marginTop: 8,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 12,
    marginVertical: 8,
  },
  statusRowLeaf: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  bottomClose: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    gap: 8,
  },
  bottomCloseText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  bottomUserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  bottomUserPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    paddingRight: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 22,
    gap: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    maxWidth: 200,
  },
  bottomUserAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomUserAvatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  bottomUserName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  bottomSettingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdown: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderRadius: 8,
    minWidth: 170,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  dropdownInner: {
    backgroundColor: 'rgba(25, 25, 25, 0.98)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dropdownText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
});
