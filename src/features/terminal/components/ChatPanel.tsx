import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useTabStore } from '../../../core/tabs/tabStore';

interface Props {
  onClose: () => void;
}

export const ChatPanel = ({ onClose }: Props) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const { chatHistory, chatFolders, setCurrentChat, updateChat, deleteChat } = useTerminalStore();
  const { addTab, tabs, removeTab, updateTab } = useTabStore();

  const filteredChats = chatHistory.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectChat = (chat: any) => {
    setCurrentChat(chat);
    addTab({
      id: `chat-${chat.id}`,
      type: 'chat',
      title: chat.title || 'Chat',
      data: { chatId: chat.id }
    });
    onClose();
  };

  const handleNewChat = () => {
    const chatId = Date.now().toString();
    const newChat = {
      id: chatId,
      title: 'Nuova Conversazione',
      createdAt: new Date(),
      lastUsed: new Date(),
      messages: [],
      aiModel: 'llama-3.1-8b-instant',
    };

    // Save chat to chatHistory immediately
    useTerminalStore.getState().addChat(newChat);

    addTab({
      id: `chat-${chatId}`,
      type: 'chat',
      title: newChat.title,
      data: { chatId: chatId }
    });
    onClose();
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

  return (
    <>
      {/* Backdrop - Click to close */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      <View style={styles.container}>
        <LinearGradient
          colors={['#0a0a0a', '#000000']}
          style={StyleSheet.absoluteFill}
        />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="chatbubbles" size={24} color={AppColors.primary} />
            <Text style={styles.headerTitle}>Conversazioni</Text>
          </View>
          <TouchableOpacity onPress={handleNewChat} style={styles.newChatIconButton}>
            <Ionicons name="add" size={24} color={AppColors.primary} />
          </TouchableOpacity>
        </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <View style={styles.searchIconContainer}>
            <Ionicons name="search" size={18} color="rgba(255, 255, 255, 0.6)" />
          </View>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Cerca conversazioni..."
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


      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {filteredChats.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'Nessuna conversazione trovata' : 'Nessuna conversazione'}
            </Text>
            <Text style={styles.emptySubtext}>
              Inizia una nuova conversazione premendo il pulsante sopra
            </Text>
          </View>
        ) : (
          <View style={styles.chatList}>
            {filteredChats.map((chat) => (
              <View key={chat.id} style={styles.chatItemWrapper}>
                {renamingChatId === chat.id ? (
                  // Rename mode
                  <View style={styles.renameContainer}>
                    <TextInput
                      style={styles.renameInput}
                      value={renamingValue}
                      onChangeText={setRenamingValue}
                      onSubmitEditing={() => handleRenameSubmit(chat.id)}
                      autoFocus
                      placeholder="Nome conversazione"
                      placeholderTextColor="rgba(255, 255, 255, 0.4)"
                    />
                    <TouchableOpacity
                      onPress={() => handleRenameSubmit(chat.id)}
                      style={styles.renameButton}
                    >
                      <Ionicons name="checkmark" size={20} color={AppColors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setRenamingChatId(null)}
                      style={styles.renameButton}
                    >
                      <Ionicons name="close" size={20} color="rgba(255, 255, 255, 0.6)" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.chatItem}
                    onPress={() => handleSelectChat(chat)}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={['rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.02)']}
                      style={styles.chatItemGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.chatItemContent}>
                        <View style={styles.chatIconCircle}>
                          <LinearGradient
                            colors={['rgba(139, 124, 246, 0.2)', 'rgba(107, 93, 214, 0.1)']}
                            style={styles.chatIconGradient}
                          >
                            <Ionicons name="chatbubble" size={14} color="rgba(255, 255, 255, 0.8)" />
                          </LinearGradient>
                        </View>

                        <View style={styles.chatInfo}>
                          <Text style={styles.chatTitle} numberOfLines={1}>
                            {chat.title}
                          </Text>
                          {chat.description && (
                            <Text style={styles.chatDescription} numberOfLines={1}>
                              {chat.description}
                            </Text>
                          )}
                          <View style={styles.chatMeta}>
                            <Ionicons name="time-outline" size={12} color="rgba(255, 255, 255, 0.4)" />
                            <Text style={styles.chatDate}>{getTimeAgo(chat.lastUsed)}</Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          onPress={() => handleMenuToggle(chat.id)}
                          style={styles.menuButton}
                        >
                          <Ionicons name="ellipsis-vertical" size={16} color="rgba(255, 255, 255, 0.5)" />
                        </TouchableOpacity>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                )}

                {/* Dropdown menu */}
                {openMenuId === chat.id && (
                  <View style={styles.dropdown}>
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={() => handleRename(chat)}
                    >
                      <Ionicons name="pencil" size={16} color="rgba(255, 255, 255, 0.8)" />
                      <Text style={styles.dropdownText}>Rinomina</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dropdownItem, styles.dropdownItemDanger]}
                      onPress={() => handleDelete(chat.id)}
                    >
                      <Ionicons name="trash" size={16} color="#FF6B6B" />
                      <Text style={[styles.dropdownText, styles.dropdownTextDanger]}>Elimina</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
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
    backgroundColor: 'transparent',
    zIndex: 1001,
  },
  container: {
    position: 'absolute',
    left: 50,
    top: 0,
    bottom: 0,
    width: 250,
    zIndex: 1002,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
  },
  searchIconContainer: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 10,
  },
  clearSearchButton: {
    padding: 4,
  },
  newChatIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 18,
  },
  chatList: {
    gap: 8,
  },
  chatItem: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  chatItemGradient: {
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
  },
  chatItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chatIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  chatIconGradient: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.25)',
  },
  chatInfo: {
    flex: 1,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 4,
  },
  chatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatDate: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  chatSeparator: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  chatMessages: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  chatItemWrapper: {
    position: 'relative',
  },
  chatDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
  },
  menuButton: {
    padding: 8,
    marginLeft: 4,
  },
  dropdown: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 1000,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  dropdownItemDanger: {
    borderBottomWidth: 0,
  },
  dropdownText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  dropdownTextDanger: {
    color: '#FF6B6B',
  },
  renameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  renameInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 6,
  },
  renameButton: {
    padding: 6,
    marginLeft: 8,
  },
});
