import React from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { Button } from '../../../../shared/components/atoms/Button';
import { Input } from '../../../../shared/components/atoms/Input';
import { AppColors } from '../../../../shared/theme/colors';
import type { GitAccount } from '../../../../core/git/gitAccountService';
import type { GitBranch, GitCommit, GitStatus } from './gitHubViewUtils';

type ActiveSection = 'commits' | 'branches' | 'changes';

interface HeaderProps {
  projectName: string;
  repoInfo: { owner: string; repo: string } | null;
  linkedAccount: GitAccount | null;
  permissionStatus: 'checking' | 'write' | 'read' | 'none' | null;
  currentBranch: string;
  actionLoading: string | null;
  activeSection: ActiveSection;
  styles: any;
  labels: {
    commits: string;
    branches: string;
    changes: string;
    linkAccount: string;
  };
  onOpenAccountPicker: () => void;
  onAction: (action: 'fetch' | 'pull' | 'push') => void;
  onChangeSection: (section: ActiveSection) => void;
}

export const GitHeaderSection: React.FC<HeaderProps> = ({
  projectName,
  repoInfo,
  linkedAccount,
  permissionStatus,
  currentBranch,
  actionLoading,
  activeSection,
  styles,
  labels,
  onOpenAccountPicker,
  onAction,
  onChangeSection,
}) => {
  const headerContent = (
    <View style={styles.headerInner}>
      <View style={styles.headerRow}>
        <View style={styles.repoInfo}>
          <Ionicons name="git-branch" size={18} color={AppColors.primary} />
          <View style={styles.repoTextContainer}>
            <Text style={styles.repoName} numberOfLines={1}>{projectName}</Text>
            {repoInfo && (
              <Text style={styles.repoPath} numberOfLines={1}>{repoInfo.owner}/{repoInfo.repo}</Text>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.accountSelector} onPress={onOpenAccountPicker}>
          {linkedAccount ? (
            <>
              {linkedAccount.avatarUrl ? (
                <Image source={{ uri: linkedAccount.avatarUrl }} style={styles.accountAvatar} />
              ) : (
                <View style={[styles.accountAvatar, styles.accountAvatarPlaceholder]}>
                  <Ionicons name="person" size={12} color="#fff" />
                </View>
              )}
              <Text style={styles.accountName} numberOfLines={1}>{linkedAccount.username}</Text>
              {permissionStatus === 'checking' ? (
                <ActivityIndicator size="small" color={AppColors.primary} style={{ marginLeft: 4 }} />
              ) : permissionStatus === 'write' ? (
                <View style={styles.permBadgeWrite}>
                  <Ionicons name="checkmark" size={10} color="#00D084" />
                </View>
              ) : permissionStatus === 'read' ? (
                <View style={styles.permBadgeRead}>
                  <Ionicons name="eye" size={10} color="#f59e0b" />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Ionicons name="person-add-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.accountPlaceholder}>{labels.linkAccount}</Text>
            </>
          )}
          <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <View style={styles.branchPill}>
          <Ionicons name="git-branch" size={12} color={AppColors.primary} />
          <Text style={styles.branchText}>{currentBranch}</Text>
        </View>

        <View style={styles.actionButtons}>
          {(['fetch', 'pull', 'push'] as const).map((action) => {
            const isPush = action === 'push';
            const disabled = !!actionLoading || !linkedAccount || (isPush && permissionStatus !== 'write');
            const iconName = action === 'fetch'
              ? 'cloud-download-outline'
              : action === 'pull'
                ? 'arrow-down'
                : 'arrow-up';

            return (
              <TouchableOpacity
                key={action}
                style={[
                  styles.actionBtn,
                  isPush && styles.pushBtn,
                  actionLoading === action && styles.actionBtnLoading,
                ]}
                onPress={() => onAction(action)}
                disabled={disabled}
              >
                {actionLoading === action ? (
                  <ActivityIndicator size="small" color={isPush ? '#fff' : AppColors.primary} />
                ) : (
                  <Ionicons
                    name={iconName}
                    size={14}
                    color={!disabled ? '#fff' : 'rgba(255,255,255,0.3)'}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.tabsRow}>
        {[
          { key: 'commits' as const, label: labels.commits },
          { key: 'branches' as const, label: labels.branches },
          { key: 'changes' as const, label: labels.changes },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabItem, activeSection === tab.key && styles.tabItemActive]}
            onPress={() => onChangeSection(tab.key)}
          >
            <Text style={[styles.tabText, activeSection === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.compactHeader}>
      {isLiquidGlassSupported ? (
        <LiquidGlassView style={{ backgroundColor: 'transparent' }} interactive effect="clear" colorScheme="dark">
          {headerContent}
        </LiquidGlassView>
      ) : headerContent}
    </View>
  );
};

interface PickerProps {
  styles: any;
  title: string;
  addAccountLabel: string;
  linkedAccount: GitAccount | null;
  gitAccounts: GitAccount[];
  getProviderConfig: (provider: string) => { name: string; color: string; icon: string } | undefined;
  onClose: () => void;
  onUnlink: () => void;
  onLinkAccount: (account: GitAccount) => void;
  onAddAccount: () => void;
  removeAccountLabel: string;
}

export const GitAccountPickerModal: React.FC<PickerProps> = ({
  styles,
  title,
  addAccountLabel,
  linkedAccount,
  gitAccounts,
  getProviderConfig,
  onClose,
  onUnlink,
  onLinkAccount,
  onAddAccount,
  removeAccountLabel,
}) => {
  const pickerContent = (
    <View style={styles.pickerInner}>
      <View style={styles.pickerHeader}>
        <Text style={styles.pickerTitle}>{title}</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <View style={styles.pickerList}>
        {linkedAccount && (
          <TouchableOpacity style={styles.pickerItem} onPress={onUnlink}>
            <View style={[styles.pickerItemAvatar, { backgroundColor: 'rgba(255,77,77,0.1)' }]}>
              <Ionicons name="unlink" size={16} color="#ff4d4d" />
            </View>
            <Text style={[styles.pickerItemText, { color: '#ff4d4d' }]}>{removeAccountLabel}</Text>
          </TouchableOpacity>
        )}

        {gitAccounts.map((account) => {
          const providerConfig = getProviderConfig(account.provider);
          const isLinked = linkedAccount?.id === account.id;
          return (
            <TouchableOpacity
              key={account.id}
              style={[styles.pickerItem, isLinked && styles.pickerItemSelected]}
              onPress={() => onLinkAccount(account)}
            >
              {account.avatarUrl ? (
                <Image source={{ uri: account.avatarUrl }} style={styles.pickerItemAvatar} />
              ) : (
                <View style={[styles.pickerItemAvatar, { backgroundColor: providerConfig?.color || '#333' }]}>
                  <Ionicons name={(providerConfig?.icon as any) || 'person'} size={16} color="#fff" />
                </View>
              )}
              <View style={styles.pickerItemInfo}>
                <Text style={styles.pickerItemText}>{account.username}</Text>
                <Text style={styles.pickerItemProvider}>{providerConfig?.name || account.provider}</Text>
              </View>
              {isLinked && <Ionicons name="checkmark-circle" size={18} color={AppColors.primary} />}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={styles.pickerItem} onPress={onAddAccount}>
          <View style={[styles.pickerItemAvatar, { backgroundColor: `${AppColors.primary}20` }]}>
            <Ionicons name="add" size={16} color={AppColors.primary} />
          </View>
          <Text style={[styles.pickerItemText, { color: AppColors.primary }]}>{addAccountLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.pickerOverlay}>
      <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
      {isLiquidGlassSupported ? (
        <LiquidGlassView
          style={[styles.pickerCard, { backgroundColor: 'transparent', overflow: 'hidden' }]}
          interactive
          effect="clear"
          colorScheme="dark"
        >
          {pickerContent}
        </LiquidGlassView>
      ) : (
        <View style={styles.pickerCard}>{pickerContent}</View>
      )}
    </View>
  );
};

const GlassRow: React.FC<{ style: any; styles: any; children: React.ReactNode }> = ({ style, styles, children }) => (
  <View style={style}>
    {isLiquidGlassSupported ? (
      <LiquidGlassView
        style={{ backgroundColor: 'transparent', borderRadius: 8, overflow: 'hidden' }}
        interactive
        effect="clear"
        colorScheme="dark"
      >
        {children}
      </LiquidGlassView>
    ) : children}
  </View>
);

interface CommitsProps {
  styles: any;
  commits: GitCommit[];
  gitLoading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  sectionTitle: string;
  formatDate: (date: Date) => string;
  onOpenCommit: (url?: string) => void;
}

export const GitCommitsSection: React.FC<CommitsProps> = ({
  styles,
  commits,
  gitLoading,
  loadingLabel,
  emptyLabel,
  sectionTitle,
  formatDate,
  onOpenCommit,
}) => (
  <View style={styles.section}>
    {gitLoading ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <Text style={styles.loadingText}>{loadingLabel}</Text>
      </View>
    ) : commits.length === 0 ? (
      <View style={styles.emptyState}>
        <Ionicons name="git-commit" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    ) : (
      <>
        <Text style={styles.sectionTitle}>{sectionTitle}</Text>
        {commits.map((commit, index) => {
          const commitContent = (
            <View style={styles.commitRowInner}>
              <View style={styles.graphColumn}>
                <View style={[styles.graphLine, index === 0 && styles.graphLineFirst]} />
                <View style={[styles.graphDot, commit.isHead && styles.graphDotHead]} />
                {index < commits.length - 1 && <View style={styles.graphLine} />}
              </View>
              {commit.authorAvatar ? (
                <Image source={{ uri: commit.authorAvatar }} style={styles.commitAvatar} />
              ) : (
                <View style={[styles.commitAvatar, styles.commitAvatarPlaceholder]}>
                  <Text style={styles.commitAvatarText}>{commit.author.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.commitInfo}>
                <View style={styles.commitHeader}>
                  <Text style={styles.commitMessage} numberOfLines={2}>{commit.message.split('\n')[0]}</Text>
                </View>
                <View style={styles.commitMeta}>
                  <Text style={styles.commitHash}>{commit.shortHash}</Text>
                  <Text style={styles.commitAuthor}>{commit.authorLogin || commit.author}</Text>
                  <Text style={styles.commitDate}>{formatDate(commit.date)}</Text>
                </View>
                <View style={styles.commitBadges}>
                  {commit.isHead && (
                    <View style={styles.headBadge}>
                      <Text style={styles.headBadgeText}>HEAD</Text>
                    </View>
                  )}
                  {commit.branch && (
                    <View style={styles.branchBadge}>
                      <Ionicons name="git-branch" size={10} color={AppColors.primary} />
                      <Text style={styles.branchBadgeText}>{commit.branch}</Text>
                    </View>
                  )}
                </View>
              </View>
              {commit.url && <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.2)" style={{ marginLeft: 8 }} />}
            </View>
          );

          return (
            <TouchableOpacity key={commit.hash} style={styles.commitRow} activeOpacity={0.7} onPress={() => onOpenCommit(commit.url)}>
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={{ backgroundColor: 'transparent', borderRadius: 10, overflow: 'hidden' }}
                  interactive
                  effect="clear"
                  colorScheme="dark"
                >
                  {commitContent}
                </LiquidGlassView>
              ) : commitContent}
            </TouchableOpacity>
          );
        })}
      </>
    )}
  </View>
);

interface BranchesProps {
  styles: any;
  branches: GitBranch[];
  localLabel: string;
  remoteLabel: string;
}

export const GitBranchesSection: React.FC<BranchesProps> = ({ styles, branches, localLabel, remoteLabel }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{localLabel}</Text>
    {branches.filter((branch) => !branch.isRemote).map((branch) => (
      <GlassRow key={branch.name} style={styles.branchRow} styles={styles}>
        <View style={styles.branchRowInner}>
          <View style={styles.branchRowLeft}>
            <Ionicons
              name={branch.isCurrent ? 'radio-button-on' : 'radio-button-off'}
              size={16}
              color={branch.isCurrent ? AppColors.primary : 'rgba(255,255,255,0.4)'}
            />
            <Text style={[styles.branchRowName, branch.isCurrent && styles.branchRowNameActive]}>{branch.name}</Text>
          </View>
          {(branch.ahead !== undefined || branch.behind !== undefined) && (
            <View style={styles.branchRowStats}>
              {branch.ahead !== undefined && branch.ahead > 0 && (
                <View style={styles.statBadge}>
                  <Ionicons name="arrow-up" size={10} color="#00D084" />
                  <Text style={styles.statBadgeTextGreen}>{branch.ahead}</Text>
                </View>
              )}
              {branch.behind !== undefined && branch.behind > 0 && (
                <View style={styles.statBadge}>
                  <Ionicons name="arrow-down" size={10} color="#FF6B6B" />
                  <Text style={styles.statBadgeTextRed}>{branch.behind}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </GlassRow>
    ))}

    {branches.some((branch) => branch.isRemote) && (
      <>
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{remoteLabel}</Text>
        {branches.filter((branch) => branch.isRemote).map((branch) => (
          <GlassRow key={branch.name} style={styles.branchRow} styles={styles}>
            <View style={styles.branchRowInner}>
              <View style={styles.branchRowLeft}>
                <Ionicons name="cloud-outline" size={16} color="rgba(255,255,255,0.4)" />
                <Text style={styles.branchRowName}>{branch.name}</Text>
              </View>
            </View>
          </GlassRow>
        ))}
      </>
    )}
  </View>
);

interface ChangesProps {
  styles: any;
  gitStatus: GitStatus | null;
  commitMessage: string;
  actionLoading: string | null;
  labels: {
    createCommit: string;
    placeholder: string;
    commit: string;
    staged: string;
    modified: string;
    untracked: string;
    noChanges: string;
    status: string;
    noData: string;
  };
  onCommitMessageChange: (value: string) => void;
  onCommit: () => void;
}

export const GitChangesSection: React.FC<ChangesProps> = ({
  styles,
  gitStatus,
  commitMessage,
  actionLoading,
  labels,
  onCommitMessageChange,
  onCommit,
}) => {
  const hasChanges = !!gitStatus && (
    (gitStatus.staged?.length || 0) > 0
    || (gitStatus.modified?.length || 0) > 0
    || (gitStatus.untracked?.length || 0) > 0
  );

  const renderFiles = (files: string[], badge: string, badgeStyle?: any) => files.map((file) => (
    <GlassRow key={file} style={styles.fileRow} styles={styles}>
      <View style={styles.fileRowInner}>
        <View style={[styles.fileStatusBadge, badgeStyle]}>
          <Text style={styles.fileStatusText}>{badge}</Text>
        </View>
        <Text style={styles.fileName} numberOfLines={1}>{file}</Text>
      </View>
    </GlassRow>
  ));

  return (
    <View style={styles.section}>
      {hasChanges && (
        <View style={styles.commitSection}>
          <Text style={styles.sectionTitle}>{labels.createCommit}</Text>
          <View style={styles.commitInputContainer}>
            <Input
              value={commitMessage}
              onChangeText={onCommitMessageChange}
              placeholder={labels.placeholder}
              multiline
              numberOfLines={2}
              style={{ marginBottom: 10 }}
            />
            <Button
              label={actionLoading === 'commit' ? '' : labels.commit}
              onPress={onCommit}
              disabled={!commitMessage.trim() || actionLoading === 'commit'}
              variant="primary"
            />
          </View>
        </View>
      )}

      {gitStatus ? (
        <>
          {(gitStatus.staged?.length || 0) > 0 && (
            <>
              <Text style={styles.sectionTitle}>{labels.staged} ({gitStatus.staged.length})</Text>
              {renderFiles(gitStatus.staged, 'S')}
            </>
          )}
          {(gitStatus.modified?.length || 0) > 0 && (
            <>
              <Text style={[styles.sectionTitle, (gitStatus.staged?.length || 0) > 0 && { marginTop: 20 }]}>
                {labels.modified} ({gitStatus.modified.length})
              </Text>
              {renderFiles(gitStatus.modified, 'M', styles.fileStatusModified)}
            </>
          )}
          {(gitStatus.untracked?.length || 0) > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
                {labels.untracked} ({gitStatus.untracked.length})
              </Text>
              {renderFiles(gitStatus.untracked, '?', styles.fileStatusUntracked)}
            </>
          )}
          {!gitStatus.staged?.length && !gitStatus.modified?.length && !gitStatus.untracked?.length && (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color="#00D084" />
              <Text style={styles.emptyText}>{labels.noChanges}</Text>
              <Text style={styles.emptySubtext}>{labels.status}</Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyText}>{labels.noData}</Text>
        </View>
      )}
    </View>
  );
};
