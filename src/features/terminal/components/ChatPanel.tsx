import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useTabStore } from '../../../core/tabs/tabStore';
import { EmptyState } from '../../../shared/components/organisms';
import { IconButton } from '../../../shared/components/atoms';

interface Props {
  onClose: () => void;
}

export const ChatPanel = ({ onClose }: Props) => {
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const { chatHistory, chatFolders, setCurrentChat, updateChat, deleteChat, loadChats, currentWorkstation } = useTerminalStore();
  const { addTab, tabs, removeTab, updateTab, setActiveTab } = useTabStore();

  // Opening animation
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, []);

  // Load chats from AsyncStorage on mount
  useEffect(() => {
    loadChats();
  }, []);

  // Filter chats by current workspace and search query
  const filteredChats = chatHistory.filter((chat) => {
    const matchesSearch = chat.title.toLowerCase().includes(searchQuery.toLowerCase());
    // Show chats that: have no repositoryId (legacy), OR match current project
    const matchesWorkspace = !currentWorkstation ||
      !chat.repositoryId || // Legacy chats without repositoryId
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
    handleClose();
  };

  const handleNewChat = () => {
    const chatId = Date.now().toString();
    const newChat = {
      id: chatId,
      title: 'Nuova Conversazione',
      createdAt: new Date(),
      lastUsed: new Date(),
      messages: [],
      aiModel: 'gemini-2.0-flash-exp',
      repositoryId: currentWorkstation?.id,
      repositoryName: currentWorkstation?.name,
    };

    // Save chat to chatHistory immediately
    useTerminalStore.getState().addChat(newChat);

    // Don't save chat to chatHistory yet - it will be saved when the first message is sent
    // Just create a new tab
    addTab({
      id: `chat-${chatId}`,
      type: 'chat',
      title: 'Nuova Conversazione',
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

    if (days > 0) return `${days}g fa`;
    if (hours > 0) return `${hours}h fa`;
    if (minutes > 0) return `${minutes}m fa`;
    return 'ora';
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
    deleteChat(chatId);
    // Close any open tabs for this chat
    const chatTab = tabs.find(t => t.data?.chatId === chatId);
    if (chatTab) {
      removeTab(chatTab.id);
    }
    setOpenMenuId(null);
  };

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: -300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  return (
    <>
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
        {/* New Chat Button - ChatGPT style */}
        <TouchableOpacity style={styles.newChatButton} onPress={handleNewChat} activeOpacity={0.7}>
          <Ionicons name="add" size={18} color="rgba(255,255,255,0.9)" />
          <Text style={styles.newChatText}>Nuova chat</Text>
        </TouchableOpacity>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={15} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Cerca nelle chat..."
            placeholderTextColor="rgba(255,255,255,0.4)"
          />
        </View>

        {/* Chat List */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        >
          {filteredChats.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={32} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'Nessun risultato' : 'Nessuna chat'}
              </Text>
            </View>
          ) : (
            <>
              {/* Today section */}
              <Text style={styles.sectionTitle}>Recenti</Text>
              {filteredChats.map((chat) => (
                <View key={chat.id} style={styles.chatItemWrapper}>
                  {renamingChatId === chat.id ? (
                    <View style={styles.renameContainer}>
                      <TextInput
                        style={styles.renameInput}
                        value={renamingValue}
                        onChangeText={setRenamingValue}
                        onSubmitEditing={() => handleRenameSubmit(chat.id)}
                        autoFocus
                        placeholder="Nome chat"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                      />
                      <TouchableOpacity onPress={() => handleRenameSubmit(chat.id)} style={styles.renameAction}>
                        <Ionicons name="checkmark" size={18} color={AppColors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setRenamingChatId(null)} style={styles.renameAction}>
                        <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.chatItem}
                      onPress={() => handleSelectChat(chat)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chatbubble-outline" size={16} color="rgba(255,255,255,0.5)" />
                      <Text style={styles.chatTitle} numberOfLines={1}>{chat.title}</Text>
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
                      <TouchableOpacity style={styles.dropdownItem} onPress={() => handleRename(chat)}>
                        <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.dropdownText}>Rinomina</Text>
                      </TouchableOpacity>
                      <View style={styles.dropdownDivider} />
                      <TouchableOpacity style={styles.dropdownItem} onPress={() => handleDelete(chat.id)}>
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        <Text style={[styles.dropdownText, { color: '#ef4444' }]}>Elimina</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>

        {/* Bottom close button */}
        <TouchableOpacity style={styles.bottomClose} onPress={handleClose} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.5)" />
          <Text style={styles.bottomCloseText}>Chiudi</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999,
  },
  container: {
    position: 'absolute',
    left: 44,
    top: 0,
    bottom: 0,
    width: 260,
    backgroundColor: '#0a0a0a',
    zIndex: 1000,
    paddingTop: 54,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 10,
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
    borderRadius: 8,
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
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    overflow: 'hidden',
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
});
