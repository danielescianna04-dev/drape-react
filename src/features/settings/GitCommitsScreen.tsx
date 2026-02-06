import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Image,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { githubService, GitHubCommit } from '../../core/github/githubService';
import { gitAccountService } from '../../core/git/gitAccountService';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { AppColors } from '../../shared/theme/colors';

interface Props {
  repositoryUrl: string;
  onClose: () => void;
}

export const GitCommitsScreen = ({ repositoryUrl, onClose }: Props) => {
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const userId = useTerminalStore.getState().userId || 'anonymous';

  useEffect(() => {
    loadCommits();

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();

    return () => shimmerLoop.stop();
  }, []);

  const loadCommits = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get token for this repository
      const tokenResult = await gitAccountService.getTokenForRepo(userId, repositoryUrl);
      const token = tokenResult?.token;

      const fetchedCommits = await githubService.fetchCommits(repositoryUrl, token);
      setCommits(fetchedCommits);
    } catch (err: any) {
      console.error('Error loading commits:', err);
      setError(err.message || 'Impossibile caricare i commit');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCommits();
    setRefreshing(false);
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

  const getRepoName = () => {
    const match = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      return `${match[1]}/${match[2].replace('.git', '')}`;
    }
    return 'Repository';
  };

  const handleCommitPress = (commit: GitHubCommit) => {
    setSelectedCommit(selectedCommit === commit.sha ? null : commit.sha);
  };

  const handleOpenInGitHub = (url: string) => {
    Linking.openURL(url);
  };

  const renderSkeletonCard = (index: number) => {
    const shimmerOpacity = shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.7],
    });

    return (
      <View key={`skeleton-${index}`} style={styles.commitCard}>
        <Animated.View style={[styles.skeletonAvatar, { opacity: shimmerOpacity }]} />
        <View style={styles.commitInfo}>
          <Animated.View style={[styles.skeletonTitle, { opacity: shimmerOpacity }]} />
          <Animated.View style={[styles.skeletonSubtitle, { opacity: shimmerOpacity }]} />
        </View>
      </View>
    );
  };

  const renderCommitCard = (commit: GitHubCommit) => {
    const isExpanded = selectedCommit === commit.sha;
    const firstLine = commit.message.split('\n')[0];
    const hasMoreLines = commit.message.includes('\n');

    const cardContent = (
      <View style={styles.cardInner}>
        {commit.author.avatar_url ? (
          <Image source={{ uri: commit.author.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>
              {commit.author.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.commitInfo}>
          <Text style={styles.commitMessage} numberOfLines={isExpanded ? undefined : 2}>
            {isExpanded ? commit.message : firstLine}
          </Text>
          <View style={styles.commitMeta}>
            <Text style={styles.authorName}>{commit.author.login || commit.author.name}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.commitTime}>{getTimeAgo(commit.author.date)}</Text>
          </View>
          <View style={styles.commitSha}>
            <Ionicons name="git-commit-outline" size={12} color="rgba(255,255,255,0.3)" />
            <Text style={styles.shaText}>{commit.sha.substring(0, 7)}</Text>
          </View>

          {isExpanded && (
            <View style={styles.expandedActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleOpenInGitHub(commit.url)}
              >
                <Ionicons name="open-outline" size={16} color={AppColors.primary} />
                <Text style={styles.actionButtonText}>Apri su GitHub</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <Ionicons
          name={hasMoreLines || isExpanded ? (isExpanded ? 'chevron-up' : 'chevron-down') : 'chevron-forward'}
          size={16}
          color="rgba(255,255,255,0.3)"
        />
      </View>
    );

    return (
      <TouchableOpacity
        key={commit.sha}
        style={[styles.commitCard, isExpanded && styles.commitCardExpanded]}
        onPress={() => handleCommitPress(commit)}
        activeOpacity={0.7}
      >
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={{ backgroundColor: 'transparent', borderRadius: 14, overflow: 'hidden' }}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            {cardContent}
          </LiquidGlassView>
        ) : (
          cardContent
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Commit</Text>
            <Text style={styles.headerSubtitle}>{getRepoName()}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          activeOpacity={0.7}
          onPress={onRefresh}
          disabled={loading}
        >
          <Ionicons name="refresh" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={AppColors.primary}
          />
        }
      >
        {loading && !refreshing ? (
          <>
            {[0, 1, 2, 3, 4].map(renderSkeletonCard)}
          </>
        ) : error ? (
          <View style={styles.errorState}>
            <View style={styles.errorIcon}>
              <Ionicons name="alert-circle" size={48} color="#ff4d4d" />
            </View>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              activeOpacity={0.7}
              onPress={loadCommits}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryButtonText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        ) : commits.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>
              {commits.length} commit recenti
            </Text>
            {commits.map(renderCommitCard)}
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="git-commit-outline" size={48} color="rgba(255,255,255,0.2)" />
            </View>
            <Text style={styles.emptyText}>Nessun commit</Text>
            <Text style={styles.emptySubtext}>
              Questo repository non ha ancora commit
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0C0E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  commitCard: {
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
  },
  commitCardExpanded: {
    borderColor: `${AppColors.primary}30`,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  commitInfo: {
    flex: 1,
  },
  commitMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 20,
    marginBottom: 6,
  },
  commitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 6,
  },
  commitTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  commitSha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shaText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(255,255,255,0.3)',
  },
  expandedActions: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: `${AppColors.primary}15`,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.primary,
  },
  // Skeleton
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 12,
  },
  skeletonTitle: {
    width: '80%',
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  skeletonSubtitle: {
    width: '50%',
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Error state
  errorState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: AppColors.primary,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
