import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, TextInput, Alert, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useChatStore } from '../../../core/terminal/chatStore';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { useTabStore } from '../../../core/tabs/tabStore';
import { useAuthStore } from '../../../core/auth/authStore';
import { ChatSession } from '../../../shared/types';
import { FolderPickerModal } from './FolderPickerModal';
import { tracciaNuovaChat, tracciaChatSelezionata, tracciaChatEliminata, tracciaChatRinominata, tracciaChatFissata, tracciaChatSpostataCartella } from '../../../core/services/analyticsService';

interface Props {
  onClose: () => void;
  onHidePreview?: () => void;
}

export const ChatPanel = ({ onClose, onHidePreview }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuButtonRefs = useRef<Record<string, View | null>>({});
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [folderPickerChat, setFolderPickerChat] = useState<ChatSession | null>(null);
  const {
    chatHistory, chatFolders, setCurrentChat, updateChat, deleteChat,
    loadChats, loadFolders, pinChat, unpinChat, moveChatToFolder, deleteFolder,
  } = useChatStore();
  const { currentWorkstation } = useWorkstationStore();
  const { addTab, tabs, removeTab, updateTab, setActiveTab } = useTabStore();
  const { user } = useAuthStore();

  // Load chats and folders from AsyncStorage on mount
  useEffect(() => {
    loadChats();
    loadFolders();
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

  // Build sections: Pinned → Folders → Recent (uncategorized)
  const sections = useMemo(() => {
    const result: { key: string; title: string; icon?: string; folderId?: string; data: ChatSession[] }[] = [];

    // 1. Pinned
    const pinned = filteredChats.filter((c) => c.pinned);
    if (pinned.length > 0) {
      result.push({ key: 'pinned', title: t('chat.pinned'), icon: 'pin', data: pinned });
    }

    // 2. Custom folders
    for (const folder of chatFolders) {
      const folderChats = filteredChats.filter((c) => c.folderId === folder.id && !c.pinned);
      if (folderChats.length > 0) {
        result.push({ key: `folder-${folder.id}`, title: folder.name, icon: 'folder', folderId: folder.id, data: folderChats });
      }
    }

    // 3. Recent / Uncategorized
    const uncategorized = filteredChats.filter((c) => !c.pinned && !c.folderId);
    if (uncategorized.length > 0) {
      result.push({ key: 'recent', title: t('chat.recent'), data: uncategorized });
    }

    return result;
  }, [filteredChats, chatFolders, t]);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
        // Panel right edge: left(44) + min(55% of screen, 220)
        const panelWidth = Math.min(screen.width * 0.55, 220);
        const panelRight = 44 + panelWidth;
        // Place menu just to the right of the panel
        let menuX = panelRight + 4;
        // If it overflows right, clamp to screen edge
        if (menuX + menuWidth > screen.width - 8) {
          menuX = screen.width - menuWidth - 8;
        }
        // Vertical: align with button, shift up if overflows bottom
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

  const renderChatItem = (chat: ChatSession) => (
    <View style={styles.chatItemWrapper}>
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
          <Text style={styles.chatTitle} numberOfLines={1}>{chat.title.replace(/^👁\s?/, '')}</Text>
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

  return (
    <>
      <LinearGradient colors={['#111114', '#151519', '#1C1828', '#131316']} locations={[0, 0.3, 0.7, 1]} style={styles.container}>
        <View style={styles.containerInner}>

          {/* New Chat Button */}
          <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat} activeOpacity={0.7}>
            {isLiquidGlassSupported && (
              <LiquidGlassView
                style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}
                interactive={true}
                effect="clear"
                colorScheme="dark"
              />
            )}
            <View style={styles.newChatButtonInner}>
              <Ionicons name="add" size={18} color="rgba(255,255,255,0.9)" />
              <Text style={styles.newChatText}>{t('terminal:chat.newChat')}</Text>
            </View>
          </TouchableOpacity>

          {/* Search */}
          <View style={{ marginHorizontal: 12, marginBottom: 12 }}>
            {isLiquidGlassSupported ? (
              <LiquidGlassView
                style={[
                  styles.searchContainer,
                  { marginHorizontal: 0, marginBottom: 0, backgroundColor: 'transparent', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 8 },
                ]}
                interactive={true}
                effect="clear"
                colorScheme="dark"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="search" size={15} color="rgba(255,255,255,0.4)" />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={t('terminal:chat.searchChats')}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                  />
                </View>
              </LiquidGlassView>
            ) : (
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={15} color="rgba(255,255,255,0.4)" />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t('terminal:chat.searchChats')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                />
              </View>
            )}
          </View>

          {/* Chat List — SectionList */}
          <SectionList
            sections={sections.map((s) => ({
              ...s,
              data: collapsedSections[s.key] ? [] : s.data,
            }))}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderChatItem(item)}
            renderSectionHeader={({ section }) => (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={collapsedSections[section.key] ? 'chevron-forward' : 'chevron-down'}
                  size={12}
                  color="rgba(255,255,255,0.35)"
                />
                {section.icon && (
                  <Ionicons name={section.icon as any} size={12} color="rgba(255,255,255,0.4)" />
                )}
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCount}>{
                  // Show count from the original (non-collapsed) sections
                  sections.find((s) => s.key === section.key)?.data.length || 0
                }</Text>
                {section.folderId && (
                  <TouchableOpacity
                    onPress={() => handleDeleteFolder(section.folderId!)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: 'auto' }}
                  >
                    <Ionicons name="close-circle-outline" size={14} color="rgba(255,255,255,0.25)" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={32} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>
                  {searchQuery ? t('terminal:chat.noResults') : t('terminal:chat.noChats')}
                </Text>
              </View>
            }
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
          />

          {/* Bottom close button */}
          <TouchableOpacity style={styles.bottomClose} onPress={handleClose} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.5)" />
            <Text style={styles.bottomCloseText}>{t('terminal:chat.close')}</Text>
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
    paddingTop: 54,
  },
  newChatButton: {
    marginHorizontal: 12,
    marginRight: 140,
    marginBottom: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  newChatButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  newChatText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginRight: 140,
    marginBottom: 12,
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
    paddingHorizontal: 8,
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    fontWeight: '500',
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
  upgradeBtnContainer: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  upgradeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flashIconBg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(155, 138, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(155, 138, 255, 0.2)',
  },
  upgradeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  upgradeSubtitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
});
