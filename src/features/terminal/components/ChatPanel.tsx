import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Dimensions, Keyboard, InteractionManager, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, Layout, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';
import { useChatStore } from '../../../core/terminal/chatStore';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { useTabStore } from '../../../core/tabs/tabStore';
import { useUIStore } from '../../../core/terminal/uiStore';
import { useAuthStore } from '../../../core/auth/authStore';
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

export const ChatPanel = ({ onClose, onHidePreview, onExit }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuButtonRefs = useRef<Record<string, View | null>>({});
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [expandedNav, setExpandedNav] = useState<Record<string, boolean>>({ chat: true });
  const [folderPickerChat, setFolderPickerChat] = useState<ChatSession | null>(null);
  const {
    chatHistory, chatFolders, setCurrentChat, updateChat, deleteChat,
    loadChats, loadFolders, pinChat, unpinChat, moveChatToFolder, deleteFolder,
  } = useChatStore();
  const { currentWorkstation } = useWorkstationStore();
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

  // Filter chats by current workspace and search query
  const filteredChats = useMemo(() => {
    return chatHistory.filter((chat) => {
      const matchesSearch = chat.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (!currentWorkstation) {
        return matchesSearch && !chat.repositoryId;
      }
      const matchesWorkspace =
        chat.repositoryId === currentWorkstation.id ||
        chat.repositoryId === currentWorkstation.projectId;
      return matchesSearch && matchesWorkspace;
    });
  }, [chatHistory, searchQuery, currentWorkstation]);

  // Build chat sub-sections: Pinned -> Folders -> Recent
  const chatSubSections = useMemo(() => {
    const result: { key: string; title: string; icon?: string; folderId?: string; data: ChatSession[] }[] = [];

    const pinned = filteredChats.filter((c) => c.pinned);
    if (pinned.length > 0) {
      result.push({ key: 'pinned', title: t('chat.pinned'), icon: 'pin', data: pinned });
    }

    for (const folder of chatFolders) {
      const folderChats = filteredChats.filter((c) => c.folderId === folder.id && !c.pinned);
      if (folderChats.length > 0) {
        result.push({ key: `folder-${folder.id}`, title: folder.name, icon: 'folder', folderId: folder.id, data: folderChats });
      }
    }

    const uncategorized = filteredChats.filter((c) => !c.pinned && !c.folderId);
    if (uncategorized.length > 0) {
      result.push({ key: 'recent', title: t('chat.recent'), data: uncategorized });
    }

    return result;
  }, [filteredChats, chatFolders, t]);

  // ── Navigation section toggle ────────────────────────────────────
  // Shared values for chevron rotation per section
  const chevronRotations: Record<string, Animated.SharedValue<number>> = {};
  const useChevronRotation = (id: string, isExpanded: boolean) => {
    const rotation = useSharedValue(isExpanded ? 1 : 0);
    chevronRotations[id] = rotation;
    return useAnimatedStyle(() => ({
      transform: [{ rotate: `${rotation.value * 90}deg` }],
    }));
  };
  const chatChevron = useChevronRotation('chat', !!expandedNav.chat);
  const filesChevron = useChevronRotation('files', !!expandedNav.files);
  const previewChevron = useChevronRotation('preview', !!expandedNav.preview);
  const gitChevron = useChevronRotation('git', !!expandedNav.git);
  const databaseChevron = useChevronRotation('database', !!expandedNav.database);
  const chevronStyles: Record<string, any> = { chat: chatChevron, files: filesChevron, preview: previewChevron, git: gitChevron, database: databaseChevron };

  const toggleNav = useCallback((id: string) => {
    setExpandedNav(prev => {
      const next = !prev[id];
      if (chevronRotations[id]) {
        chevronRotations[id].value = withTiming(next ? 1 : 0, { duration: 250 });
      }
      return { ...prev, [id]: next };
    });
  }, []);

  const toggleSubSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Chat handlers ────────────────────────────────────────────────
  const handleSelectChat = (chat: ChatSession) => {
    tracciaChatSelezionata(chat.title || 'Untitled');
    setCurrentChat(chat);
    const existingTab = tabs.find(t => t.type === 'chat' && t.data?.chatId === chat.id);
    if (existingTab) {
      setActiveTab(existingTab.id);
    } else {
      addTab({
        id: `chat-${chat.id}`,
        type: 'chat',
        title: chat.title || 'Chat',
        data: { chatId: chat.id },
        terminalItems: chat.messages || [],
      });
    }
    onHidePreview?.();
    handleClose();
  };

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
    addTab({
      id: `chat-${chatId}`,
      type: 'chat',
      title: t('terminal:chat.newConversation'),
      data: { chatId: chatId },
    });
    tracciaNuovaChat('fullpage');
    handleClose();
  };

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
    useUIStore.getState().setOpenPreviewRequested(true);
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
    useUIStore.setState({ openGitSheetTab: null, openGitSheetRequested: true });
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

  // ── Render helpers ────────────────────────────────────────────────

  const renderNavSectionHeader = (
    id: string,
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    count?: number,
  ) => {
    const isExpanded = expandedNav[id];
    return (
      <Animated.View layout={Layout.duration(250)}>
      <TouchableOpacity
        style={styles.navSectionHeader}
        onPress={() => toggleNav(id)}
        activeOpacity={0.7}
      >
        <Ionicons name={icon} size={18} color="rgba(255,255,255,0.6)" />
        <Text style={styles.navSectionLabel}>{label}</Text>
        {count !== undefined && count > 0 && (
          <View style={styles.navBadge}>
            <Text style={styles.navBadgeText}>{count}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Animated.View style={chevronStyles[id]}>
          <Ionicons
            name="chevron-forward"
            size={14}
            color="rgba(255,255,255,0.25)"
          />
        </Animated.View>
      </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderActionItem = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    color?: string,
  ) => (
    <TouchableOpacity style={styles.actionItem} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={16} color={color || 'rgba(255,255,255,0.45)'} />
      <Text style={[styles.actionItemText, color ? { color } : undefined]}>{label}</Text>
      <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.15)" />
    </TouchableOpacity>
  );

  const renderChatItem = (chat: ChatSession) => (
    <View key={chat.id} style={styles.chatItemWrapper}>
      {renamingChatId === chat.id ? (
        isLiquidGlassSupported ? (
          <LiquidGlassView
            style={[
              styles.renameContainer,
              { backgroundColor: 'transparent', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8 },
            ]}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                style={styles.renameInput}
                value={renamingValue}
                onChangeText={setRenamingValue}
                onSubmitEditing={() => handleRenameSubmit(chat.id)}
                autoFocus
                placeholder={t('terminal:chat.chatName')}
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
              <TouchableOpacity onPress={() => handleRenameSubmit(chat.id)} style={styles.renameAction}>
                <Ionicons name="checkmark" size={18} color={AppColors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRenamingChatId(null)} style={styles.renameAction}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
          </LiquidGlassView>
        ) : (
          <View style={styles.renameContainer}>
            <TextInput
              style={styles.renameInput}
              value={renamingValue}
              onChangeText={setRenamingValue}
              onSubmitEditing={() => handleRenameSubmit(chat.id)}
              autoFocus
              placeholder={t('terminal:chat.chatName')}
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
            <TouchableOpacity onPress={() => handleRenameSubmit(chat.id)} style={styles.renameAction}>
              <Ionicons name="checkmark" size={18} color={AppColors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRenamingChatId(null)} style={styles.renameAction}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        )
      ) : (
        <TouchableOpacity
          style={styles.chatItem}
          onPress={() => handleSelectChat(chat)}
          activeOpacity={0.7}
        >
          {chat.pinned && (
            <Ionicons name="pin" size={12} color={AppColors.primary} style={{ marginRight: -4 }} />
          )}
          <Ionicons name={chat.id.startsWith('preview-') ? 'eye-outline' : 'chatbubble-outline'} size={16} color="rgba(255,255,255,0.5)" />
          <Text style={styles.chatTitle} numberOfLines={1}>{chat.title.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s?/u, '')}</Text>
          <View
            ref={(ref) => { menuButtonRefs.current[chat.id] = ref; }}
            collapsable={false}
          >
            <TouchableOpacity
              onPress={() => handleMenuToggle(chat.id)}
              style={styles.menuButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-horizontal" size={16} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );

  // Preview status
  const previewServerUrl = useUIStore((s) => s.previewServerUrl);
  const projectPreviewUrls = useUIStore((s) => s.projectPreviewUrls);
  const hasPreview = !!(previewServerUrl || (currentWorkstation?.id && projectPreviewUrls[currentWorkstation.id]));

  return (
    <>
      <LinearGradient colors={['#111114', '#151519', '#1C1828', '#131316']} locations={[0, 0.3, 0.7, 1]} style={styles.container}>
        <View style={styles.containerInner}>

          {/* Drape title */}
          <Text style={styles.drawerTitle}>Drape</Text>

          {/* ═══ Scrollable sections ═══ */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── Chat Section ── */}
            {renderNavSectionHeader('chat', 'chatbubbles-outline', 'Chat', filteredChats.length)}
            {expandedNav.chat && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={Layout.duration(250)} style={styles.navSectionContent}>

                {/* Search + New Chat row */}
                <View style={styles.searchRow}>
                  <View style={styles.searchFlex}>
                    <View style={styles.searchContainer}>
                      {isLiquidGlassSupported && (
                        <LiquidGlassView
                          style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}
                          interactive={true}
                          effect="clear"
                          colorScheme="dark"
                        />
                      )}
                      <Ionicons name="search" size={15} color="rgba(255,255,255,0.4)" />
                      <TextInput
                        style={styles.searchInput}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={t('terminal:chat.searchChats')}
                        placeholderTextColor="rgba(255,255,255,0.4)"
                      />
                    </View>
                  </View>
                  <TouchableOpacity onPress={handleNewChat} activeOpacity={0.7} style={styles.newChatBtn}>
                    {isLiquidGlassSupported && (
                      <LiquidGlassView
                        style={[StyleSheet.absoluteFill, { borderRadius: 20, overflow: 'hidden' }]}
                        interactive={true}
                        effect="clear"
                        colorScheme="dark"
                      />
                    )}
                    <Ionicons name="add" size={20} color="rgba(255,255,255,0.85)" />
                  </TouchableOpacity>
                </View>
                {chatSubSections.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="chatbubbles-outline" size={28} color="rgba(255,255,255,0.15)" />
                    <Text style={styles.emptyText}>
                      {searchQuery ? t('terminal:chat.noResults') : t('terminal:chat.noChats')}
                    </Text>
                  </View>
                ) : (
                  chatSubSections.map((section) => (
                    <View key={section.key}>
                      {/* Sub-section header (Pinned, Folders, Recent) */}
                      <TouchableOpacity
                        style={styles.subSectionHeader}
                        onPress={() => toggleSubSection(section.key)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={collapsedSections[section.key] ? 'chevron-forward' : 'chevron-down'}
                          size={11}
                          color="rgba(255,255,255,0.3)"
                        />
                        {section.icon && (
                          <Ionicons name={section.icon as any} size={11} color="rgba(255,255,255,0.35)" />
                        )}
                        <Text style={styles.subSectionTitle}>{section.title}</Text>
                        <Text style={styles.subSectionCount}>{section.data.length}</Text>
                        {section.folderId && (
                          <TouchableOpacity
                            onPress={() => handleDeleteFolder(section.folderId!)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ marginLeft: 'auto' }}
                          >
                            <Ionicons name="close-circle-outline" size={13} color="rgba(255,255,255,0.2)" />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                      {/* Chat items */}
                      {!collapsedSections[section.key] && section.data.map((chat) => renderChatItem(chat))}
                    </View>
                  ))
                )}
              </Animated.View>
            )}

            <Animated.View layout={Layout.duration(250)} style={styles.navDivider} />

            {/* ── File del progetto Section ── */}
            {renderNavSectionHeader('files', 'folder-outline', 'File del progetto')}
            {expandedNav.files && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={Layout.duration(250)} style={styles.navSectionContent}>
                {renderActionItem('document-text-outline', 'Apri file browser', handleOpenFiles)}
                {renderActionItem('server-outline', 'Variabili ambiente', handleOpenEnvVars)}
              </Animated.View>
            )}

            <Animated.View layout={Layout.duration(250)} style={styles.navDivider} />

            {/* ── Preview Section ── */}
            {renderNavSectionHeader('preview', 'eye-outline', 'Preview')}
            {expandedNav.preview && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={Layout.duration(250)} style={styles.navSectionContent}>
                {renderActionItem(
                  hasPreview ? 'open-outline' : 'play-circle-outline',
                  hasPreview ? 'Apri preview' : 'Avvia preview',
                  handleOpenPreview,
                  hasPreview ? '#00D084' : undefined,
                )}
                {hasPreview && (
                  <View style={styles.statusRow}>
                    <View style={[styles.statusDot, { backgroundColor: '#00D084' }]} />
                    <Text style={styles.statusText}>Server attivo</Text>
                  </View>
                )}
              </Animated.View>
            )}

            <Animated.View layout={Layout.duration(250)} style={styles.navDivider} />

            {/* ── Git Section ── */}
            {renderNavSectionHeader('git', 'git-branch-outline', 'Git')}
            {expandedNav.git && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={Layout.duration(250)} style={styles.navSectionContent}>
                {renderActionItem('git-branch-outline', 'Pannello Git', handleOpenGit)}
              </Animated.View>
            )}

            <Animated.View layout={Layout.duration(250)} style={styles.navDivider} />

            {/* ── Database Section ── */}
            {renderNavSectionHeader('database', 'server-outline', 'Database')}
            {expandedNav.database && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={Layout.duration(250)} style={styles.navSectionContent}>
                {renderActionItem('server-outline', 'Gestisci database', handleOpenDatabase)}
              </Animated.View>
            )}

            <Animated.View layout={Layout.duration(250)} style={styles.navDivider} />

            {/* ── Build Report Section ── */}
            {renderNavSectionHeader('buildReport', 'construct-outline', 'Build Report')}
            {expandedNav.buildReport && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} layout={Layout.duration(250)} style={styles.navSectionContent}>
                {renderActionItem('time-outline', 'Project History', () => {
                  const { tabs, setActiveTab, addTab } = useTabStore.getState();
                  const existing = tabs.find(t => t.id === 'build-report');
                  if (existing) { setActiveTab('build-report'); }
                  else { addTab({ id: 'build-report', type: 'buildReport' as any, title: 'Build Report', data: {} }); }
                  onClose();
                })}
              </Animated.View>
            )}

          </ScrollView>

          {/* Bottom close button */}
          <TouchableOpacity style={styles.bottomClose} onPress={() => onExit?.()} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={16} color="rgba(255,255,255,0.5)" />
            <Text style={styles.bottomCloseText}>Esci</Text>
          </TouchableOpacity>
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
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  containerInner: {
    flex: 1,
    paddingTop: 58,
    maxWidth: 300,
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
    marginBottom: 8,
    gap: 8,
  },
  searchFlex: {
    flex: 1,
  },
  newChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    padding: 0,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingLeft: 4,
    paddingRight: 16,
    paddingBottom: 20,
  },

  // ── Navigation section styles ──
  navSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  navSectionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },
  navBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  navBadgeText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },
  navSectionContent: {
    marginLeft: 8,
    marginRight: 8,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  navDivider: {
    height: 0,
    marginVertical: 1,
  },

  // ── Action item styles ──
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 10,
  },
  actionItemText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },

  // ── Status indicator ──
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },

  // ── Chat sub-section styles ──
  subSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 5,
  },
  subSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subSectionCount: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.2)',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  chatItemWrapper: {
    position: 'relative',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 10,
  },
  chatTitle: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  menuButton: {
    padding: 4,
    opacity: 0.6,
  },

  // ── Modal / Dropdown ──
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
    backgroundColor: 'rgba(30, 30, 30, 0.97)',
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

  // ── Rename ──
  renameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    gap: 8,
  },
  renameInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
  },
  renameAction: {
    padding: 4,
  },

  // ── Bottom ──
  bottomClose: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  bottomCloseText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
});
