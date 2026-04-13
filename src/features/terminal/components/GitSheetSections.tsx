import React from 'react';
import { ActivityIndicator, Dimensions, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../../shared/theme/colors';
import type { GitAccount } from '../../../core/git/gitAccountService';
import type { GitBranch, GitCommit } from './views/gitHubViewUtils';
import {
  countGitChangeNodeFiles,
  formatGitCommitDate,
  GIT_BRANCH_COLORS,
  type GitChangeFile,
  type GitChangeTreeNode,
} from './gitSheetUtils';

type ActiveSection = 'commits' | 'branches' | 'changes';

export const GitSheetContainer: React.FC<{ styles: any; children: React.ReactNode }> = ({ styles, children }) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView
        style={[styles.modalContainer, { backgroundColor: 'rgba(18, 18, 22, 0.55)', overflow: 'hidden' }]}
        interactive
        effect="clear"
        colorScheme="dark"
      >
        <View style={{ flex: 1 }}>{children}</View>
      </LiquidGlassView>
    );
  }

  return <View style={styles.modalContainer}>{children}</View>;
};

interface HeaderProps {
  styles: any;
  repoName: string;
  repoOwner: string;
  onClose: () => void;
  actionLoading: string | null;
  aheadCount: number;
  behindCount: number;
  onAction: (action: 'fetch' | 'pull' | 'push') => void;
}

export const GitSheetHeader: React.FC<HeaderProps> = ({
  styles,
  repoName,
  repoOwner,
  onClose,
  actionLoading,
  aheadCount,
  behindCount,
  onAction,
}) => (
  <>
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.gitIcon}>
          <Ionicons name="git-branch" size={18} color="#fff" />
        </View>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{repoName}</Text>
          <Text style={styles.headerSubtitle}>{repoOwner}</Text>
        </View>
      </View>
      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>
    </View>

    <View style={styles.branchRow}>
      <View style={styles.gitActions}>
        {([
          ['fetch', null],
          ['pull', behindCount],
          ['push', aheadCount],
        ] as const).map(([action, badgeCount]) => {
          const iconName = action === 'fetch'
            ? 'sync-outline'
            : action === 'pull'
              ? 'arrow-down-outline'
              : 'arrow-up-outline';

          return (
            <View key={action}>
              <TouchableOpacity
                style={styles.gitActionBtn}
                onPress={() => onAction(action)}
                disabled={!!actionLoading}
              >
                {actionLoading === action ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name={iconName} size={16} color="#fff" />
                )}
              </TouchableOpacity>
              {!!badgeCount && badgeCount > 0 && (
                <View style={styles.actionBadge}>
                  <Text style={styles.actionBadgeText}>{badgeCount}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  </>
);

interface TabsProps {
  styles: any;
  activeSection: ActiveSection;
  isGitRepo: boolean;
  changesCount: number;
  t: (key: string) => string;
  onSelect: (section: ActiveSection) => void;
}

export const GitSheetTabs: React.FC<TabsProps> = ({
  styles,
  activeSection,
  isGitRepo,
  changesCount,
  t,
  onSelect,
}) => (
  <View style={styles.tabs}>
    {(['commits', 'branches', 'changes'] as const).map((section) => (
      <TouchableOpacity
        key={section}
        style={[styles.tab, activeSection === section && styles.tabActive]}
        onPress={() => onSelect(section)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.tabText, activeSection === section && styles.tabTextActive]}>
            {section === 'commits' ? t('git.commit') : section === 'branches' ? t('git.branch') : t('git.changes')}
          </Text>
          {section === 'changes' && isGitRepo && changesCount > 0 && (
            <View style={styles.changesBadge}>
              <Text style={styles.changesBadgeText}>{changesCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    ))}
  </View>
);

const GitChangeTree: React.FC<{
  nodes: GitChangeTreeNode[];
  depth?: number;
  selectedFiles: Set<string>;
  expandedFolders: Set<string>;
  styles: any;
  onToggleFile: (filePath: string) => void;
  onToggleFolder: (path: string) => void;
  onOpenDiff: (filePath: string) => void;
  onOpenMenu: (payload: { y: number; file: string; type: 'modified' | 'untracked' | 'deleted' }) => void;
}> = ({
  nodes,
  depth = 0,
  selectedFiles,
  expandedFolders,
  styles,
  onToggleFile,
  onToggleFolder,
  onOpenDiff,
  onOpenMenu,
}) => (
  <>
    {nodes.map((node) => {
      if (node.type === 'file') {
        const statusIcon = node.changeType === 'modified'
          ? { name: 'create-outline' as const, color: '#f59e0b' }
          : node.changeType === 'untracked'
            ? { name: 'add-circle-outline' as const, color: '#22c55e' }
            : { name: 'trash-outline' as const, color: '#ef4444' };

        return (
          <View key={node.path} style={[styles.changeItem, { marginLeft: depth * 20 }]}>
            <TouchableOpacity onPress={() => onToggleFile(node.path)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name={selectedFiles.has(node.path) ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={selectedFiles.has(node.path) ? AppColors.primary : 'rgba(255,255,255,0.3)'}
              />
            </TouchableOpacity>
            <Ionicons name={statusIcon.name} size={14} color={statusIcon.color} />
            <TouchableOpacity style={{ flex: 1 }} onPress={() => onOpenDiff(node.path)}>
              <Text style={styles.changeFileName} numberOfLines={1}>{node.name}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(event) => onOpenMenu({
                y: event.nativeEvent.pageY,
                file: node.path,
                type: node.changeType!,
              })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
            >
              <Ionicons name="ellipsis-vertical" size={14} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>
        );
      }

      const isExpanded = !expandedFolders.has(node.path);
      return (
        <View key={node.path}>
          <TouchableOpacity
            style={[styles.changeFolderItem, { marginLeft: depth * 20 }]}
            onPress={() => onToggleFolder(node.path)}
          >
            <Ionicons
              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
              size={12}
              color="rgba(255,255,255,0.4)"
            />
            <Ionicons name="folder-outline" size={14} color="rgba(255,255,255,0.5)" />
            <Text style={styles.changeFolderName}>{node.name}</Text>
            <Text style={styles.changeFolderCount}>{countGitChangeNodeFiles(node)}</Text>
          </TouchableOpacity>
          {isExpanded && node.children && (
            <GitChangeTree
              nodes={node.children}
              depth={depth + 1}
              selectedFiles={selectedFiles}
              expandedFolders={expandedFolders}
              styles={styles}
              onToggleFile={onToggleFile}
              onToggleFolder={onToggleFolder}
              onOpenDiff={onOpenDiff}
              onOpenMenu={onOpenMenu}
            />
          )}
        </View>
      );
    })}
  </>
);

interface CommitsProps {
  styles: any;
  t: (key: string, options?: Record<string, unknown>) => string;
  repoUrl?: string;
  errorMsg: string | null;
  commits: GitCommit[];
  displayCommits: GitCommit[];
  branches: GitBranch[];
  selectedBranchFilter: string | null;
  branchFilterLoading: boolean;
  isDetachedHead: boolean;
  detachedAt: string | null;
  previousBranch: string;
  currentBranch: string;
  aheadCount: number;
  remoteHead: string | null;
  linkedAccount: GitAccount | null;
  branchColorMap: Record<string, string>;
  commitTimelineColors: string[];
  actionLoading: string | null;
  onSelectBranchFilter: (branchName: string | null) => void;
  onReturnToBranch: () => void;
  onOpenCommitMenu: (payload: { hash: string; shortHash: string; message: string }) => void;
  onOpenConnectRepo: () => void;
  onRetryLoad: () => void;
}

export const GitSheetCommitsSection: React.FC<CommitsProps> = ({
  styles,
  t,
  repoUrl,
  errorMsg,
  commits,
  displayCommits,
  branches,
  selectedBranchFilter,
  branchFilterLoading,
  isDetachedHead,
  detachedAt,
  previousBranch,
  currentBranch,
  aheadCount,
  remoteHead,
  linkedAccount,
  branchColorMap,
  commitTimelineColors,
  actionLoading,
  onSelectBranchFilter,
  onReturnToBranch,
  onOpenCommitMenu,
  onOpenConnectRepo,
  onRetryLoad,
}) => (
  <View style={styles.commitsList}>
    {(branches.filter((branch) => !branch.name.startsWith('origin/')).length > 1 || new Set(displayCommits.flatMap((commit) => commit.branches || [])).size > 1) && (
      <View style={styles.branchFilterContainer}>
        <TouchableOpacity
          style={[styles.branchFilterPill, selectedBranchFilter === null && styles.branchFilterPillActive]}
          onPress={() => onSelectBranchFilter(null)}
        >
          <Text style={[styles.branchFilterPillText, selectedBranchFilter === null && styles.branchFilterPillTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {branches.filter((branch) => !branch.name.startsWith('origin/')).slice(0, 15).map((branch) => (
          <TouchableOpacity
            key={branch.name}
            style={[
              styles.branchFilterPill,
              selectedBranchFilter === branch.name && styles.branchFilterPillActive,
              branch.isCurrent && selectedBranchFilter !== branch.name && styles.branchFilterPillCurrent,
            ]}
            onPress={() => onSelectBranchFilter(branch.name)}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: branchColorMap[branch.name] || 'rgba(255,255,255,0.3)' }} />
            <Ionicons
              name="git-branch"
              size={11}
              color={selectedBranchFilter === branch.name ? '#fff' : branch.isCurrent ? AppColors.primary : 'rgba(255,255,255,0.4)'}
            />
            <Text style={[styles.branchFilterPillText, selectedBranchFilter === branch.name && styles.branchFilterPillTextActive]}>
              {branch.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    )}

    {branchFilterLoading && (
      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={AppColors.primary} />
      </View>
    )}

    {isDetachedHead && (
      <TouchableOpacity
        style={styles.detachedBanner}
        onPress={onReturnToBranch}
        disabled={!!actionLoading}
        activeOpacity={0.7}
      >
        <Ionicons name="return-up-back" size={14} color="#f59e0b" />
        <Text style={styles.detachedBannerText}>Return to {previousBranch || currentBranch}</Text>
      </TouchableOpacity>
    )}

    {!branchFilterLoading && displayCommits.map((commit, index) => {
      const isDetachedHere = isDetachedHead && detachedAt && commit.shortHash === detachedAt;
      const isRemoteHead = remoteHead && commit.shortHash === remoteHead;
      const isPushed = !remoteHead || (() => {
        const remoteIndex = displayCommits.findIndex((candidate) => candidate.shortHash === remoteHead);
        return remoteIndex >= 0 ? index >= remoteIndex : !!commit.authorAvatar;
      })();
      const timelineColor = selectedBranchFilter
        ? (branchColorMap[selectedBranchFilter] || GIT_BRANCH_COLORS[0])
        : commitTimelineColors[index] || GIT_BRANCH_COLORS[0];

      return (
        <React.Fragment key={commit.hash || index}>
          {index === aheadCount && aheadCount > 0 && selectedBranchFilter === null && (
            <View style={styles.remoteSeparator}>
              <View style={styles.remoteSeparatorLine} />
              <View style={styles.remoteSeparatorBadge}>
                <Ionicons name="checkmark-circle-outline" size={11} color="#8b8b8b" />
                <Text style={styles.remoteSeparatorText}>{t('terminal:git.pushed')}</Text>
              </View>
              <View style={styles.remoteSeparatorLine} />
            </View>
          )}
          <View style={[styles.commitItem, isDetachedHere && styles.commitItemDetachedHere]}>
            <View style={styles.timeline}>
              {index > 0 && (
                <View style={[
                  styles.timelineLine,
                  styles.timelineLineTop,
                  !isPushed && styles.timelineLineUnpushed,
                  { backgroundColor: `${timelineColor}30` },
                ]} />
              )}
              <View style={[
                styles.timelineDot,
                commit.isHead && !isDetachedHead && [
                  styles.timelineDotHead,
                  { backgroundColor: timelineColor, shadowColor: timelineColor },
                ],
                isDetachedHere && styles.timelineDotDetached,
                !isPushed && !commit.isHead && !isDetachedHere && styles.timelineDotUnpushed,
                !commit.isHead && !isDetachedHere && { borderColor: `${timelineColor}99` },
              ]}>
                {commit.isHead && !isDetachedHead && <View style={styles.timelineDotInner} />}
                {isDetachedHere && <View style={styles.timelineDotInnerDetached} />}
              </View>
              {index < displayCommits.length - 1 && (
                <View style={[
                  styles.timelineLine,
                  styles.timelineLineBottom,
                  !isPushed && styles.timelineLineUnpushed,
                  { backgroundColor: `${timelineColor}30` },
                ]} />
              )}
            </View>

            <View style={styles.commitContent}>
              {(commit.isHead || isDetachedHere || (commit.branches && commit.branches.length > 0) || (commit.tags && commit.tags.length > 0)) && (
                <View style={styles.commitBadgesRow}>
                  {commit.isHead && !isDetachedHead && (
                    <>
                      <View style={styles.branchBadgeInline}>
                        <Ionicons name="git-branch" size={11} color="#fff" />
                        <Text style={styles.branchBadgeInlineText}>{currentBranch}</Text>
                      </View>
                      <View style={styles.headBadgeInline}>
                        <Text style={styles.headBadgeInlineText}>HEAD</Text>
                      </View>
                    </>
                  )}
                  {isDetachedHere && (
                    <View style={styles.detachedBadgeInline}>
                      <Ionicons name="warning-outline" size={10} color="#f59e0b" />
                      <Text style={styles.detachedBadgeInlineText}>HEAD (detached)</Text>
                    </View>
                  )}
                  {isRemoteHead && commit.isHead && (
                    <View style={styles.remoteBadgeInline}>
                      <Ionicons name="cloud-outline" size={10} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.remoteBadgeInlineText}>origin/{currentBranch}</Text>
                    </View>
                  )}
                  {commit.branches?.filter((branch) => branch !== currentBranch && !branch.startsWith('origin/')).map((branch) => (
                    <View key={branch} style={[styles.branchRefBadge, { borderColor: `${branchColorMap[branch] || '#a78bfa'}40` }]}>
                      <Ionicons name="git-branch" size={10} color={branchColorMap[branch] || '#a78bfa'} />
                      <Text style={[styles.branchRefBadgeText, { color: branchColorMap[branch] || '#a78bfa' }]}>{branch}</Text>
                    </View>
                  ))}
                  {commit.branches?.filter((branch) => {
                    if (!branch.startsWith('origin/')) return false;
                    if (branch === 'origin/HEAD') return false;
                    if (isRemoteHead && branch === `origin/${currentBranch}`) return false;
                    return true;
                  }).map((branch) => (
                    <View key={branch} style={styles.remoteBadgeInline}>
                      <Ionicons name="cloud-outline" size={10} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.remoteBadgeInlineText}>{branch}</Text>
                    </View>
                  ))}
                  {commit.tags?.map((tag) => (
                    <View key={tag} style={styles.tagBadge}>
                      <Ionicons name="pricetag-outline" size={10} color="#22d3ee" />
                      <Text style={styles.tagBadgeText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={[styles.commitMessage, !isPushed && styles.commitMessageUnpushed]} numberOfLines={1}>
                {commit.message}
              </Text>
              <View style={styles.commitMeta}>
                {(commit.authorAvatar || linkedAccount?.avatarUrl) ? (
                  <Image source={{ uri: commit.authorAvatar || linkedAccount?.avatarUrl }} style={styles.commitAvatarSmall} />
                ) : (
                  <View style={[styles.commitAvatarSmall, styles.commitAvatarPlaceholder]}>
                    <Ionicons name="person-outline" size={10} color="rgba(255,255,255,0.6)" />
                  </View>
                )}
                <Text style={styles.commitAuthor}>{commit.authorLogin || commit.author || linkedAccount?.username || ''}</Text>
                <Text style={styles.commitHash}>{commit.shortHash}</Text>
                <Text style={styles.commitDate}>{formatGitCommitDate(commit.date)}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.commitMenuBtn}
              onPress={() => onOpenCommitMenu({ hash: commit.hash, shortHash: commit.shortHash, message: commit.message })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-vertical" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>
        </React.Fragment>
      );
    })}

    {commits.length === 0 && (
      <View style={styles.emptyState}>
        {!repoUrl ? (
          <>
            <View style={styles.connectGitIcon}>
              <Ionicons name="logo-github" size={32} color="rgba(255,255,255,0.4)" />
            </View>
            <Text style={styles.connectGitTitle}>{t('connectRepo.title')}</Text>
            <Text style={styles.connectGitSubtitle}>{t('connectRepo.noAccountsAvailable')}</Text>
            <TouchableOpacity style={styles.connectGitButton} onPress={onOpenConnectRepo}>
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.connectGitButtonText}>{t('connectRepo.title')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Ionicons name="git-commit-outline" size={40} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyStateText}>{errorMsg || t('terminal:git.noCommitsFound')}</Text>
            {errorMsg && (
              <TouchableOpacity onPress={onRetryLoad} style={styles.retryButton}>
                <Text style={styles.retryText}>{t('common:retry')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    )}
  </View>
);

interface BranchesProps {
  styles: any;
  t: (key: string) => string;
  branches: GitBranch[];
  showCreateBranch: boolean;
  newBranchName: string;
  actionLoading: string | null;
  onSetNewBranchName: (value: string) => void;
  onShowCreateBranch: (value: boolean) => void;
  onCreateBranch: () => void;
}

export const GitSheetBranchesSection: React.FC<BranchesProps> = ({
  styles,
  t,
  branches,
  showCreateBranch,
  newBranchName,
  actionLoading,
  onSetNewBranchName,
  onShowCreateBranch,
  onCreateBranch,
}) => (
  <View style={styles.branchesList}>
    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
      Local
    </Text>
    {branches.filter((branch) => !branch.isRemote && !branch.name.startsWith('origin/')).map((branch) => (
      <View key={branch.name} style={styles.branchItem}>
        <View style={styles.branchItemLeft}>
          <Ionicons
            name={branch.isCurrent ? 'git-branch' : 'git-branch-outline'}
            size={16}
            color={branch.isCurrent ? AppColors.primary : 'rgba(255,255,255,0.5)'}
          />
          <Text style={[styles.branchItemText, branch.isCurrent && styles.branchItemTextActive]}>
            {branch.name}
          </Text>
        </View>
        {branch.isCurrent && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>{t('terminal:git.current')}</Text>
          </View>
        )}
      </View>
    ))}

    {branches.filter((branch) => branch.isRemote || branch.name.startsWith('origin/')).length > 0 && (
      <>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 16, marginBottom: 8, letterSpacing: 0.5 }}>
          Remote
        </Text>
        {branches.filter((branch) => branch.isRemote || branch.name.startsWith('origin/')).map((branch) => (
          <View key={branch.name} style={styles.branchItem}>
            <View style={styles.branchItemLeft}>
              <Ionicons name="cloud-outline" size={14} color="rgba(255,255,255,0.35)" />
              <Text style={[styles.branchItemText, { color: 'rgba(255,255,255,0.5)' }]}>
                {branch.name.replace(/^origin\//, '')}
              </Text>
            </View>
          </View>
        ))}
      </>
    )}

    {showCreateBranch ? (
      <View style={styles.createBranchContainer}>
        <TextInput
          style={styles.createBranchInput}
          value={newBranchName}
          onChangeText={onSetNewBranchName}
          placeholder={t('terminal:git.newBranchName')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          keyboardAppearance="dark"
          returnKeyType="done"
          onSubmitEditing={onCreateBranch}
        />
        <View style={styles.createBranchActions}>
          <TouchableOpacity onPress={() => { onShowCreateBranch(false); onSetNewBranchName(''); }} style={styles.createBranchCancelBtn}>
            <Text style={styles.createBranchCancelText}>{t('common:cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onCreateBranch}
            disabled={!newBranchName.trim() || actionLoading === 'createBranch'}
            style={[styles.createBranchConfirmBtn, !newBranchName.trim() && { opacity: 0.4 }]}
          >
            {actionLoading === 'createBranch' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.createBranchConfirmText}>{t('terminal:git.createBranch')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    ) : (
      <TouchableOpacity style={styles.addBranchBtn} onPress={() => onShowCreateBranch(true)}>
        <Ionicons name="add-circle-outline" size={16} color={AppColors.primary} />
        <Text style={styles.addBranchText}>{t('terminal:git.createBranch')}</Text>
      </TouchableOpacity>
    )}
  </View>
);

interface ChangesProps {
  styles: any;
  t: (key: string, options?: Record<string, unknown>) => string;
  allChangedFiles: GitChangeFile[];
  changeFileTree: GitChangeTreeNode[];
  selectedFiles: Set<string>;
  expandedFolders: Set<string>;
  statusRefreshing: boolean;
  actionLoading: string | null;
  gitAccountsCount: number;
  onToggleSelectAll: () => void;
  onDiscardSelected: () => void;
  onToggleFile: (filePath: string) => void;
  onToggleFolder: (path: string) => void;
  onOpenDiff: (filePath: string) => void;
  onOpenFileMenu: (payload: { y: number; file: string; type: 'modified' | 'untracked' | 'deleted' }) => void;
  onOpenCommitModal: () => void;
  onOpenAddAccount: () => void;
}

export const GitSheetChangesSection: React.FC<ChangesProps> = ({
  styles,
  t,
  allChangedFiles,
  changeFileTree,
  selectedFiles,
  expandedFolders,
  statusRefreshing,
  actionLoading,
  gitAccountsCount,
  onToggleSelectAll,
  onDiscardSelected,
  onToggleFile,
  onToggleFolder,
  onOpenDiff,
  onOpenFileMenu,
  onOpenCommitModal,
  onOpenAddAccount,
}) => (
  <View style={styles.changesContainer}>
    {allChangedFiles.length > 0 ? (
      <>
        <TouchableOpacity style={styles.selectAllRow} onPress={onToggleSelectAll}>
          <Ionicons
            name={selectedFiles.size === allChangedFiles.length && allChangedFiles.length > 0 ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={selectedFiles.size === allChangedFiles.length && allChangedFiles.length > 0 ? AppColors.primary : 'rgba(255,255,255,0.4)'}
          />
          <Text style={styles.selectAllText}>
            {selectedFiles.size === allChangedFiles.length && allChangedFiles.length > 0 ? t('common:deselectAll') : t('common:selectAll')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {statusRefreshing && <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />}
            <Text style={styles.selectedCount}>{selectedFiles.size}/{allChangedFiles.length}</Text>
          </View>
        </TouchableOpacity>

        {selectedFiles.size > 0 && (
          <TouchableOpacity
            style={styles.discardSelectedBtn}
            onPress={onDiscardSelected}
            disabled={actionLoading === 'discard'}
          >
            <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
            <Text style={styles.discardSelectedText}>
              {t('terminal:git.discardSelected')} ({selectedFiles.size})
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.changeSection}>
          <GitChangeTree
            nodes={changeFileTree}
            selectedFiles={selectedFiles}
            expandedFolders={expandedFolders}
            styles={styles}
            onToggleFile={onToggleFile}
            onToggleFolder={onToggleFolder}
            onOpenDiff={onOpenDiff}
            onOpenMenu={onOpenFileMenu}
          />
        </View>

        {gitAccountsCount === 0 ? (
          <View style={styles.authRequiredContainer}>
            <View style={styles.authRequiredBanner}>
              <Ionicons name="lock-closed" size={16} color="#FFB800" />
              <Text style={styles.authRequiredText}>{t('terminal:git.authRequiredForCommit')}</Text>
            </View>
            <TouchableOpacity style={styles.authRequiredBtn} onPress={onOpenAddAccount}>
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.authRequiredBtnText}>{t('terminal:git.linkGitHubAccount')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.createCommitBtn, selectedFiles.size === 0 && styles.createCommitBtnDisabled]}
            onPress={onOpenCommitModal}
          >
            <Ionicons name="git-commit-outline" size={18} color="#fff" />
            <Text style={styles.createCommitBtnText}>
              {t('terminal:git.createCommit')} ({selectedFiles.size === 1
                ? t('terminal:git.filesSelected', { count: selectedFiles.size })
                : t('terminal:git.filesSelectedPlural', { count: selectedFiles.size })})
            </Text>
          </TouchableOpacity>
        )}
      </>
    ) : (
      <View style={styles.emptyState}>
        <Ionicons name="checkmark-circle-outline" size={40} color="rgba(255,255,255,0.2)" />
        <Text style={styles.emptyStateText}>{t('terminal:git.noChanges')}</Text>
      </View>
    )}
  </View>
);

interface AccountRowProps {
  styles: any;
  linkedAccount: GitAccount;
  onOpen: () => void;
}

export const GitSheetAccountRow: React.FC<AccountRowProps> = ({ styles, linkedAccount, onOpen }) => (
  <TouchableOpacity style={styles.accountRow} onPress={onOpen}>
    <Image source={{ uri: linkedAccount.avatarUrl }} style={styles.accountAvatar} />
    <Text style={styles.accountName}>{linkedAccount.username}</Text>
    <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.4)" />
  </TouchableOpacity>
);

interface OverlayMenuProps {
  styles: any;
  title: string;
  y: number;
  viewDiffLabel: string;
  discardLabel: string;
  onClose: () => void;
  onViewDiff: () => void;
  onDiscard: () => void;
}

export const GitSheetFileContextMenu: React.FC<OverlayMenuProps> = ({
  styles,
  title,
  y,
  viewDiffLabel,
  discardLabel,
  onClose,
  onViewDiff,
  onDiscard,
}) => (
  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
    <TouchableOpacity
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' }}
      activeOpacity={1}
      onPress={onClose}
    >
      <View
        style={[
          styles.popoverMenu,
          {
            top: Math.min(y, Dimensions.get('window').height - 140),
            right: 16,
          },
        ]}
      >
        <Text style={styles.popoverTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity style={styles.popoverItem} onPress={onViewDiff}>
          <Ionicons name="git-compare-outline" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={styles.popoverItemText}>{viewDiffLabel}</Text>
        </TouchableOpacity>
        <View style={styles.popoverDivider} />
        <TouchableOpacity style={styles.popoverItem} onPress={onDiscard}>
          <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
          <Text style={[styles.popoverItemText, { color: '#FF6B6B' }]}>{discardLabel}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </View>
);
