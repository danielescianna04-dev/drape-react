import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';

const colors = AppColors.dark;

interface Props {
  onClose: () => void;
}

export const Sidebar = ({ onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'github'>('chat');
  const [searchQuery, setSearchQuery] = useState('');

  const {
    chatHistory,
    isGitHubConnected,
    gitHubRepositories,
    gitHubUser,
    selectedRepository,
    setSelectedRepository,
  } = useTerminalStore();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.titleText }]}>Drape</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.bodyText} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchWrapper, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name="search" size={20} color={colors.bodyText} />
          <TextInput
            style={[styles.searchInput, { color: colors.titleText }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search..."
            placeholderTextColor={colors.bodyText}
          />
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setActiveTab('chat')}
          style={[
            styles.tab,
            activeTab === 'chat' && { borderBottomColor: AppColors.primary },
          ]}
        >
          <Ionicons
            name="chatbubbles"
            size={20}
            color={activeTab === 'chat' ? AppColors.primary : colors.bodyText}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'chat' ? AppColors.primary : colors.bodyText },
            ]}
          >
            Chats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('github')}
          style={[
            styles.tab,
            activeTab === 'github' && { borderBottomColor: AppColors.primary },
          ]}
        >
          <Ionicons
            name="logo-github"
            size={20}
            color={activeTab === 'github' ? AppColors.primary : colors.bodyText}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'github' ? AppColors.primary : colors.bodyText },
            ]}
          >
            GitHub
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'chat' ? (
          <ChatList chats={chatHistory} />
        ) : (
          <GitHubList
            repositories={gitHubRepositories}
            isConnected={isGitHubConnected}
            user={gitHubUser}
            selectedRepo={selectedRepository}
            onSelectRepo={setSelectedRepository}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.footerButton}>
          <Ionicons name="add-circle-outline" size={24} color={AppColors.primary} />
          <Text style={[styles.footerButtonText, { color: AppColors.primary }]}>
            New Chat
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const ChatList = ({ chats }: any) => {
  if (chats.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="chatbubbles-outline" size={48} color={colors.bodyText} />
        <Text style={[styles.emptyText, { color: colors.bodyText }]}>
          No chats yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {chats.map((chat: any) => (
        <TouchableOpacity key={chat.id} style={styles.listItem}>
          <View style={styles.listItemContent}>
            <Text style={[styles.listItemTitle, { color: colors.titleText }]}>
              {chat.title}
            </Text>
            <Text style={[styles.listItemSubtitle, { color: colors.bodyText }]}>
              {chat.messages.length} messages
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.bodyText} />
        </TouchableOpacity>
      ))}
    </View>
  );
};

const GitHubList = ({ repositories, isConnected, user, selectedRepo, onSelectRepo }: any) => {
  if (!isConnected) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="logo-github" size={48} color={colors.bodyText} />
        <Text style={[styles.emptyText, { color: colors.bodyText }]}>
          Connect GitHub to see repositories
        </Text>
        <TouchableOpacity style={styles.connectButton}>
          <LinearGradient
            colors={[AppColors.primary, AppColors.primaryShade]}
            style={styles.connectGradient}
          >
            <Text style={styles.connectButtonText}>Connect GitHub</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {user && (
        <View style={styles.userInfo}>
          <Ionicons name="person-circle" size={40} color={AppColors.primary} />
          <Text style={[styles.userName, { color: colors.titleText }]}>
            {user.name || user.login}
          </Text>
        </View>
      )}

      {repositories.map((repo: any) => (
        <TouchableOpacity
          key={repo.id}
          style={[
            styles.repoItem,
            selectedRepo?.id === repo.id && {
              backgroundColor: colors.surfaceVariant,
            },
          ]}
          onPress={() => onSelectRepo(repo)}
        >
          <View style={styles.repoContent}>
            <Text style={[styles.repoName, { color: colors.titleText }]}>
              {repo.name}
            </Text>
            {repo.description && (
              <Text
                style={[styles.repoDescription, { color: colors.bodyText }]}
                numberOfLines={2}
              >
                {repo.description}
              </Text>
            )}
            <View style={styles.repoMeta}>
              <View style={styles.repoMetaItem}>
                <Ionicons name="star-outline" size={14} color={colors.bodyText} />
                <Text style={[styles.repoMetaText, { color: colors.bodyText }]}>
                  {repo.stars}
                </Text>
              </View>
              <View style={styles.repoMetaItem}>
                <Ionicons name="git-branch-outline" size={14} color={colors.bodyText} />
                <Text style={[styles.repoMetaText, { color: colors.bodyText }]}>
                  {repo.forks}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
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
  },
  closeButton: {
    padding: 8,
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
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168, 85, 247, 0.1)',
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
  tabText: {
    fontSize: 14,
    fontWeight: '600',
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
    borderBottomColor: 'rgba(168, 85, 247, 0.1)',
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  listItemSubtitle: {
    fontSize: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168, 85, 247, 0.1)',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  repoItem: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  repoContent: {
    gap: 8,
  },
  repoName: {
    fontSize: 14,
    fontWeight: '600',
  },
  repoDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  repoMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  repoMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  repoMetaText: {
    fontSize: 12,
  },
  footer: {
    borderTopWidth: 1,
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
  },
});
