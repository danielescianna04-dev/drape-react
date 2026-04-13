import React from 'react';
import { GitAccount } from '../../../core/git/gitAccountService';
import { AddGitAccountModal } from '../../settings/components/AddGitAccountModal';
import { ConnectRepoModal } from './ConnectRepoModal';
import { GitAccountPickerModal, GitCommitComposerModal, GitCommitContextMenu, GitPullModal, GitPushModal } from './GitSheetOverlays';
import { CommitFilesModal, DiffViewerModal } from './GitDiffModals';
import type { GitSheetData, GitSheetActions, GitSheetStyles } from './gitSheetTypes';
import type { WorkstationInfo } from '../../../shared/types';

interface Props {
  styles: GitSheetStyles;
  data: GitSheetData;
  actions: GitSheetActions;
  currentWorkstation: WorkstationInfo | null;
  showAddAccountModal: boolean;
  setShowAddAccountModal: (value: boolean) => void;
}

export const GitSheetDialogs: React.FC<Props> = ({
  styles,
  data,
  actions,
  currentWorkstation,
  showAddAccountModal,
  setShowAddAccountModal,
}) => {
  return (
    <>
      <AddGitAccountModal
        visible={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        onAccountAdded={data.loadAccountInfo}
      />

      <CommitFilesModal
        visible={actions.commitFilesModal !== null}
        modalData={actions.commitFilesModal}
        commitFiles={data.commitFiles}
        loading={data.commitFilesLoading}
        expandedFile={actions.expandedCommitFile}
        expandedDiff={actions.expandedCommitDiff}
        expandedDiffLoading={actions.expandedCommitDiffLoading}
        collapsedFolders={actions.commitCollapsedFolders}
        styles={styles}
        onClose={() => {
          actions.setCommitFilesModal(null);
          actions.setExpandedCommitFile(null);
          actions.setExpandedCommitDiff(null);
        }}
        onBack={() => {
          actions.setExpandedCommitFile(null);
          actions.setExpandedCommitDiff(null);
        }}
        onToggleFolder={(path) => {
          actions.setCommitCollapsedFolders((prev: Set<string>) => {
            const next = new Set(prev);
            next.has(path) ? next.delete(path) : next.add(path);
            return next;
          });
        }}
        onOpenFile={async (filePath) => {
          if (!actions.commitFilesModal || !currentWorkstation?.id) return;
          actions.setExpandedCommitFile(filePath);
          actions.setExpandedCommitDiff(null);
          actions.setExpandedCommitDiffLoading(true);
          try {
            const fetchedData = await data.fetchCommitDiff(actions.commitFilesModal.hash, filePath);
            actions.setExpandedCommitDiff(fetchedData?.diff || fetchedData || '');
          } catch (error: unknown) {
            actions.setExpandedCommitDiff(`Error: ${error instanceof Error ? error.message : String(error)}`);
          } finally {
            actions.setExpandedCommitDiffLoading(false);
          }
        }}
      />

      <DiffViewerModal
        visible={data.diffFile !== null && actions.commitFilesModal === null}
        file={data.diffFile}
        diff={data.diffContent}
        loading={data.diffLoading}
        styles={styles}
        onClose={() => data.setDiffFile(null)}
      />

      <ConnectRepoModal
        visible={actions.showConnectModal}
        onClose={() => actions.setShowConnectModal(false)}
        onConnected={(newRepoUrl) => {
          actions.setShowConnectModal(false);
          data.isLoadingRef.current = false;
          data.hasStartedRef.current = false;
          setTimeout(() => {
            data.loadGitData(data.accountsRef.current, newRepoUrl);
          }, 300);
        }}
        projectName={currentWorkstation?.name}
      />

      <GitAccountPickerModal
        visible={actions.showAccountPicker}
        styles={styles}
        t={data.t}
        gitAccounts={data.gitAccounts}
        linkedAccount={data.linkedAccount}
        onClose={() => actions.setShowAccountPicker(false)}
        onSelectAccount={(account: GitAccount) => {
          data.setLinkedAccount(account);
          actions.setShowAccountPicker(false);
        }}
        onAddAccount={() => {
          actions.setShowAccountPicker(false);
          setShowAddAccountModal(true);
        }}
      />

      <GitCommitComposerModal
        visible={actions.showCommitModal}
        styles={styles}
        t={data.t}
        selectedFiles={actions.selectedFiles}
        commitMessage={actions.commitMessage}
        setCommitMessage={actions.setCommitMessage}
        commitDescription={actions.commitDescription}
        setCommitDescription={actions.setCommitDescription}
        actionLoading={actions.actionLoading}
        onClose={() => actions.setShowCommitModal(false)}
        onCommit={async () => {
          const success = await actions.handleCommit();
          if (success) actions.setShowCommitModal(false);
        }}
        onCommitAndPush={actions.handleCommitAndPush}
      />

      <GitCommitContextMenu
        visible={!!actions.commitContextMenu}
        styles={styles}
        commitContextMenu={actions.commitContextMenu}
        newBranchFromCommit={actions.newBranchFromCommit}
        branchFromName={actions.branchFromName}
        setBranchFromName={actions.setBranchFromName}
        actionLoading={actions.actionLoading}
        currentWorkstation={currentWorkstation}
        currentBranch={data.currentBranch}
        isDetachedHead={data.isDetachedHead}
        previousBranchRef={data.previousBranchRef}
        linkedAccount={data.linkedAccount}
        userId={data.userId}
        allChangedFiles={data.allChangedFiles}
        setActionLoading={actions.setActionLoading}
        setCommitContextMenu={actions.setCommitContextMenu}
        setNewBranchFromCommit={actions.setNewBranchFromCommit}
        setCommitFilesModal={actions.setCommitFilesModal}
        setExpandedCommitFile={actions.setExpandedCommitFile}
        setExpandedCommitDiff={actions.setExpandedCommitDiff}
        setCommitCollapsedFolders={actions.setCommitCollapsedFolders}
        fetchCommitFiles={data.fetchCommitFiles}
        handleRevertCommit={actions.handleRevertCommit}
        handleBranchFromCommit={actions.handleBranchFromCommit}
        loadGitData={data.loadGitData}
        t={data.t}
      />

      <GitPullModal
        visible={actions.showPullModal}
        styles={styles}
        branches={data.branches}
        pullRemote={actions.pullRemote}
        pullBranch={actions.pullBranch}
        setPullBranch={actions.setPullBranch}
        pullBranchPickerOpen={actions.pullBranchPickerOpen}
        setPullBranchPickerOpen={actions.setPullBranchPickerOpen}
        pullIntoBranch={actions.pullIntoBranch}
        setPullIntoBranch={actions.setPullIntoBranch}
        pullIntoPickerOpen={actions.pullIntoPickerOpen}
        setPullIntoPickerOpen={actions.setPullIntoPickerOpen}
        currentBranch={data.currentBranch}
        pullRebase={actions.pullRebase}
        setPullRebase={actions.setPullRebase}
        pullStash={actions.pullStash}
        setPullStash={actions.setPullStash}
        actionLoading={actions.actionLoading}
        onClose={() => actions.setShowPullModal(false)}
        onExecute={actions.executePull}
      />

      <GitPushModal
        visible={actions.showPushModal}
        styles={styles}
        branches={data.branches}
        currentBranch={data.currentBranch}
        pushDestBranch={actions.pushDestBranch}
        setPushDestBranch={actions.setPushDestBranch}
        pushDestPickerOpen={actions.pushDestPickerOpen}
        setPushDestPickerOpen={actions.setPushDestPickerOpen}
        actionLoading={actions.actionLoading}
        onClose={() => actions.setShowPushModal(false)}
        onExecute={actions.executePush}
      />
    </>
  );
};

