import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../../shared/theme/colors';
import { useChatStore } from '../../../core/terminal/chatStore';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { useTabStore } from '../../../core/tabs/tabStore';
import { useAuthStore } from '../../../core/auth/authStore';
import { useNavigationStore } from '../../../core/navigation/navigationStore';
import { EmptyState } from '../../../shared/components/organisms';
import { IconButton } from '../../../shared/components/atoms';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  onClose: () => void;
  onHidePreview?: () => void;
}

export const ChatPanel = ({ onClose, onHidePreview }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const { chatHistory, chatFolders, setCurrentChat, updateChat, deleteChat, loadChats } = useChatStore();
  const { currentWorkstation } = useWorkstationStore();
  const { addTab, tabs, removeTab, updateTab, setActiveTab } = useTabStore();
  const { user } = useAuthStore();

  const isGoUser = user?.plan === 'go';

  // Load chats from AsyncStorage on mount
  useEffect(() => {
    loadChats();
  }, []);

  // Filter chats by current workspace and search query
  const filteredChats = chatHistory.filter((chat) => {
    const matchesSearch = chat.title.toLowerCase().includes(searchQuery.toLowerCase());
    // Strict filtering: only show chats that belong to current project
    // If no workspace is open, don't show any project-specific chats
    if (!currentWorkstation) {
      return matchesSearch && !chat.repositoryId; // Only show orphan chats
    }
    // Check if chat belongs to this project
    const matchesWorkspace =
      chat.repositoryId === currentWorkstation.id ||
      chat.repositoryId === currentWorkstation.projectId;
    return matchesSearch && matchesWorkspace;
  });

  const handleSelectChat = (chat: any) => {
    setCurrentChat(chat);

    // Check if a tab with this chatId already exists
    const existingTab = tabs.find(t => t.type === 'chat' && t.data?.chatId === chat.id);

    if (existingTab) {
      // Tab already exists, just activate it
      setActiveTab(existingTab.id);
    } else {
      // Create new tab with existing messages
      addTab({
        id: `chat-${chat.id}`,
        type: 'chat',
        title: chat.title || 'Chat',
        data: { chatId: chat.id },
        terminalItems: chat.messages || [] // Load previous messages
      });
    }
    // Hide preview panel to show the chat
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

    // Save chat to chatHistory immediately
    useChatStore.getState().addChat(newChat);

    // Don't save chat to chatHistory yet - it will be saved when the first message is sent
    // Just create a new tab
    addTab({
      id: `chat-${chatId}`,
      type: 'chat',
      title: t('terminal:chat.newConversation'),
      data: { chatId: chatId }
    });
    handleClose();
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return t('terminal:chat.daysAgo', { count: days });
    if (hours > 0) return t('terminal:chat.hoursAgo', { count: hours });
    if (minutes > 0) return t('terminal:chat.minutesAgo', { count: minutes });
    return t('terminal:chat.justNow');
  };

  const handleMenuToggle = (chatId: string) => {
    setOpenMenuId(openMenuId === chatId ? null : chatId);
  };

  const handleRename = (chat: any) => {
    setRenamingChatId(chat.id);
    setRenamingValue(chat.title);
    setOpenMenuId(null);
  };

  const handleRenameSubmit = (chatId: string) => {
    if (renamingValue.trim()) {
      updateChat(chatId, { title: renamingValue.trim() });
      // Update tab title if tab exists
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
      'Elimina conversazione',
      'Sei sicuro di voler eliminare questa conversazione? L\'azione non può essere annullata.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            deleteChat(chatId);
            const chatTab = tabs.find(t => t.data?.chatId === chatId);
            if (chatTab) {
              removeTab(chatTab.id);
            }
            setOpenMenuId(null);
          }
        }
      ]
    );
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <>
      <View style={styles.container}>

        <View style={styles.containerInner}>


          {/* New Chat Button - ChatGPT style */}
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
                  { marginHorizontal: 0, marginBottom: 0, backgroundColor: 'transparent', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 8 }
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

          {/* Chat List */}
          <FlatList
            data={filteredChats}
            keyExtractor={(item) => item.id}
            renderItem={({ item: chat }) => (
              <View style={styles.chatItemWrapper}>
                {renamingChatId === chat.id ? (
                  isLiquidGlassSupported ? (
                    <LiquidGlassView
                      style={[
                        styles.renameContainer,
                        { backgroundColor: 'transparent', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8 }
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
                    <Ionicons name={chat.id.startsWith('preview-') ? "eye-outline" : "chatbubble-outline"} size={16} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.chatTitle} numberOfLines={1}>{chat.title.replace(/^👁\s?/, '')}</Text>
                    <TouchableOpacity
                      onPress={() => handleMenuToggle(chat.id)}
                      style={styles.menuButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={16} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}

                {/* Dropdown menu */}
                {openMenuId === chat.id && (
                  <View style={styles.dropdown}>
                    {isLiquidGlassSupported ? (
                      <LiquidGlassView
                        style={[StyleSheet.absoluteFill, { borderRadius: 8, overflow: 'hidden' }]}
                        interactive={true}
                        effect="clear"
                        colorScheme="dark"
                      />
                    ) : null}
                    <View style={styles.dropdownInner}>
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
                )}
              </View>
            )}
            ListHeaderComponent={
              filteredChats.length > 0 ? (
                <Text style={styles.sectionTitle}>{t('terminal:chat.recent')}</Text>
              ) : null
            }
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
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            windowSize={5}
          />

          {/* Bottom close button */}
          <TouchableOpacity style={styles.bottomClose} onPress={handleClose} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.5)" />
            <Text style={styles.bottomCloseText}>{t('terminal:chat.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 44,
    top: 0,
    bottom: 0,
    width: '55%',
    maxWidth: 220,
    backgroundColor: AppColors.dark.backgroundAlt,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
  },
  containerInner: {
    flex: 1,
    paddingTop: 54,
  },
  newChatButton: {
    marginHorizontal: 12,
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
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  dropdown: {
    position: 'absolute',
    top: 0,
    right: 4,
    backgroundColor: 'transparent',
    borderRadius: 8,
    zIndex: 1000,
    minWidth: 140,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownInner: {
    backgroundColor: 'rgba(42, 42, 42, 0.4)',
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
