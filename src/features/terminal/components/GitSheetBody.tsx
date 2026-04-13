import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import {
  GitSheetBranchesSection,
  GitSheetChangesSection,
  GitSheetCommitsSection,
} from './GitSheetSections';
import type { GitSheetData, GitSheetActions, GitSheetStyles } from './gitSheetTypes';

interface Props {
  styles: GitSheetStyles;
  data: GitSheetData;
  actions: GitSheetActions;
  repoUrl?: string;
  currentWorkstationName?: string;
  onOpenAddAccount: () => void;
  onOpenConnectRepo: () => void;
}

export const GitSheetBody: React.FC<Props> = ({
  styles,
  data,
  actions,
  repoUrl,
  currentWorkstationName,
  onOpenAddAccount,
  onOpenConnectRepo,
}) => {
  if (data.gitLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        {data.errorMsg && (
          <Text style={styles.loadingText}>{data.errorMsg}</Text>
        )}
      </View>
    );
  }

  if (!data.isGitRepo && !repoUrl) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.connectGitIcon}>
          <Ionicons name="git-branch-outline" size={32} color="rgba(255,255,255,0.4)" />
        </View>
        <Text style={styles.connectGitTitle}>{data.t('connectRepo.title')}</Text>
        <Text style={styles.connectGitSubtitle}>
          {data.t('connectRepo.noAccountsAvailable')}
        </Text>
        <TouchableOpacity
          style={styles.connectGitButton}
          onPress={onOpenConnectRepo}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.connectGitButtonText}>{data.t('connectRepo.title')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (actions.activeSection === 'commits') {
    return (
      <GitSheetCommitsSection
        styles={styles}
        t={data.t}
        repoUrl={repoUrl}
        errorMsg={data.errorMsg}
        commits={data.commits}
        displayCommits={data.displayCommits}
        branches={data.branches}
        selectedBranchFilter={data.selectedBranchFilter}
        branchFilterLoading={data.branchFilterLoading}
        isDetachedHead={data.isDetachedHead}
        detachedAt={data.detachedAt}
        previousBranch={data.previousBranchRef.current || data.currentBranch}
        currentBranch={data.currentBranch}
        aheadCount={data.aheadCount}
        remoteHead={data.remoteHead}
        linkedAccount={data.linkedAccount}
        branchColorMap={data.branchColorMap}
        commitTimelineColors={data.commitTimelineColors}
        actionLoading={actions.actionLoading}
        onSelectBranchFilter={data.handleBranchFilterSelect}
        onReturnToBranch={actions.handleReturnToBranch}
        onOpenCommitMenu={actions.setCommitContextMenu}
        onOpenConnectRepo={onOpenConnectRepo}
        onRetryLoad={() => data.loadGitData()}
      />
    );
  }

  if (actions.activeSection === 'branches') {
    return (
      <GitSheetBranchesSection
        styles={styles}
        t={data.t}
        branches={data.branches}
        showCreateBranch={actions.showCreateBranch}
        newBranchName={actions.newBranchName}
        actionLoading={actions.actionLoading}
        onSetNewBranchName={actions.setNewBranchName}
        onShowCreateBranch={actions.setShowCreateBranch}
        onCreateBranch={actions.handleCreateBranch}
      />
    );
  }

  return (
    <GitSheetChangesSection
      styles={styles}
      t={data.t}
      allChangedFiles={data.allChangedFiles}
      changeFileTree={data.changeFileTree}
      selectedFiles={actions.selectedFiles}
      expandedFolders={actions.expandedChangeFolders}
      statusRefreshing={data.statusRefreshing}
      actionLoading={actions.actionLoading}
      gitAccountsCount={data.gitAccounts.length}
      onToggleSelectAll={actions.toggleSelectAll}
      onDiscardSelected={() => actions.handleDiscard(Array.from(actions.selectedFiles))}
      onToggleFile={actions.toggleFileSelection}
      onToggleFolder={(path: string) => {
        actions.setExpandedChangeFolders((prev: Set<string>) => {
          const next = new Set(prev);
          next.has(path) ? next.delete(path) : next.add(path);
          return next;
        });
      }}
      onOpenDiff={data.fetchDiff}
      onOpenFileMenu={actions.setFileContextMenu}
      onOpenCommitModal={() => {
        if (actions.selectedFiles.size === 0) {
          Alert.alert(data.t('terminal:git.selectFiles'), data.t('terminal:git.selectAtLeastOneFile'));
          return;
        }
        actions.setShowCommitModal(true);
      }}
      onOpenAddAccount={onOpenAddAccount}
    />
  );
};
