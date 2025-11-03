import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../../shared/theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  tab: any;
}

export const GitHubView = ({ tab }: Props) => {
  const [activeSection, setActiveSection] = useState<'repo' | 'commits' | 'branches'>('repo');
  const insets = useSafeAreaInsets();

  const mockCommits = [
    { id: '1', message: 'Add new feature', author: 'John Doe', time: '2h ago', hash: 'a3f2c1d' },
    { id: '2', message: 'Fix bug in login', author: 'Jane Smith', time: '5h ago', hash: 'b7e8f9a' },
    { id: '3', message: 'Update dependencies', author: 'John Doe', time: '1d ago', hash: 'c4d5e6f' },
  ];

  const mockBranches = [
    { name: 'main', isDefault: true, ahead: 0, behind: 0 },
    { name: 'develop', isDefault: false, ahead: 3, behind: 1 },
    { name: 'feature/new-ui', isDefault: false, ahead: 12, behind: 0 },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="logo-github" size={24} color="#FFFFFF" />
          <View>
            <Text style={styles.repoName}>username/repository</Text>
            <Text style={styles.repoVisibility}>Public</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} activeOpacity={0.7}>
            <Ionicons name="star-outline" size={18} color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.headerButtonText}>Star</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} activeOpacity={0.7}>
            <Ionicons name="git-branch-outline" size={18} color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.headerButtonText}>Fork</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Tabs */}
      <View style={styles.navTabs}>
        <TouchableOpacity
          style={[styles.navTab, activeSection === 'repo' && styles.navTabActive]}
          onPress={() => setActiveSection('repo')}
          activeOpacity={0.7}
        >
          <Ionicons name="information-circle-outline" size={18} color={activeSection === 'repo' ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'} />
          <Text style={[styles.navTabText, activeSection === 'repo' && styles.navTabTextActive]}>Repository</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navTab, activeSection === 'commits' && styles.navTabActive]}
          onPress={() => setActiveSection('commits')}
          activeOpacity={0.7}
        >
          <Ionicons name="git-commit-outline" size={18} color={activeSection === 'commits' ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'} />
          <Text style={[styles.navTabText, activeSection === 'commits' && styles.navTabTextActive]}>Commits</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navTab, activeSection === 'branches' && styles.navTabActive]}
          onPress={() => setActiveSection('branches')}
          activeOpacity={0.7}
        >
          <Ionicons name="git-branch-outline" size={18} color={activeSection === 'branches' ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'} />
          <Text style={[styles.navTabText, activeSection === 'branches' && styles.navTabTextActive]}>Branches</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeSection === 'repo' && (
          <View style={styles.section}>
            <View style={styles.repoStats}>
              <View style={styles.statItem}>
                <Ionicons name="star" size={20} color="#FFA500" />
                <Text style={styles.statValue}>1.2k</Text>
                <Text style={styles.statLabel}>Stars</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="git-branch" size={20} color="#4A90E2" />
                <Text style={styles.statValue}>234</Text>
                <Text style={styles.statLabel}>Forks</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="eye" size={20} color="#00D084" />
                <Text style={styles.statValue}>89</Text>
                <Text style={styles.statLabel}>Watchers</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Descrizione</Text>
              <Text style={styles.infoText}>
                Un progetto React Native per gestire progetti con AI. Include terminale integrato, editor di codice e preview live.
              </Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Tecnologie</Text>
              <View style={styles.techTags}>
                <View style={[styles.techTag, { backgroundColor: 'rgba(97, 218, 251, 0.15)' }]}>
                  <Text style={styles.techTagText}>React Native</Text>
                </View>
                <View style={[styles.techTag, { backgroundColor: 'rgba(139, 124, 246, 0.15)' }]}>
                  <Text style={styles.techTagText}>TypeScript</Text>
                </View>
                <View style={[styles.techTag, { backgroundColor: 'rgba(0, 208, 132, 0.15)' }]}>
                  <Text style={styles.techTagText}>Expo</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {activeSection === 'commits' && (
          <View style={styles.section}>
            {mockCommits.map((commit) => (
              <View key={commit.id} style={styles.commitCard}>
                <View style={styles.commitHeader}>
                  <View style={styles.commitAuthor}>
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="person" size={16} color="rgba(255, 255, 255, 0.7)" />
                    </View>
                    <Text style={styles.authorName}>{commit.author}</Text>
                  </View>
                  <Text style={styles.commitTime}>{commit.time}</Text>
                </View>
                <Text style={styles.commitMessage}>{commit.message}</Text>
                <View style={styles.commitFooter}>
                  <View style={styles.commitHash}>
                    <Ionicons name="code-outline" size={14} color={AppColors.primary} />
                    <Text style={styles.hashText}>{commit.hash}</Text>
                  </View>
                  <TouchableOpacity style={styles.viewButton} activeOpacity={0.7}>
                    <Text style={styles.viewButtonText}>View</Text>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255, 255, 255, 0.5)" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeSection === 'branches' && (
          <View style={styles.section}>
            {mockBranches.map((branch) => (
              <View key={branch.name} style={styles.branchCard}>
                <View style={styles.branchHeader}>
                  <View style={styles.branchLeft}>
                    <Ionicons name="git-branch" size={18} color={AppColors.primary} />
                    <Text style={styles.branchName}>{branch.name}</Text>
                    {branch.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>default</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity style={styles.checkoutButton} activeOpacity={0.7}>
                    <Text style={styles.checkoutButtonText}>Checkout</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.branchStats}>
                  <Text style={styles.branchStat}>
                    <Ionicons name="arrow-up" size={12} color="#00D084" /> {branch.ahead} ahead
                  </Text>
                  <Text style={styles.branchSeparator}>•</Text>
                  <Text style={styles.branchStat}>
                    <Ionicons name="arrow-down" size={12} color="#FF6B6B" /> {branch.behind} behind
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingLeft: 50, // IconBar width
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  repoName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  repoVisibility: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  navTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  navTabActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
  },
  navTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  navTabTextActive: {
    color: AppColors.primary,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  repoStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  statItem: {
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  infoCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 20,
  },
  techTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  techTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  techTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  commitCard: {
    marginBottom: 12,
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  commitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  commitAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  commitTime: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  commitMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  commitFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commitHash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    borderRadius: 6,
  },
  hashText: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.primary,
    fontFamily: 'monospace',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  branchCard: {
    marginBottom: 12,
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  branchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  branchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  branchName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(0, 208, 132, 0.2)',
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00D084',
    textTransform: 'uppercase',
  },
  checkoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  checkoutButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.primary,
  },
  branchStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  branchStat: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  branchSeparator: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
});
