import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { AppColors } from '../../../shared/theme/colors';
import { GitSheetBody } from './GitSheetBody';
import { GitSheetDialogs } from './GitSheetDialogs';
import { GitSheetModalShell } from './GitSheetModalShell';
import { useGitSheetData } from './hooks/useGitSheetData';
import { useGitSheetActions } from './hooks/useGitSheetActions';
import { useGitSheetLifecycle } from './hooks/useGitSheetLifecycle';
import { deriveGitSheetRepoMeta } from './hooks/gitSheetRepoMeta';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.65;

interface Props {
  visible: boolean;
  onClose: () => void;
  initialTab?: 'commits' | 'branches' | 'changes';
}

export const GitSheet = ({ visible, onClose, initialTab }: Props) => {
  const currentWorkstation = useWorkstationStore((state) => state.currentWorkstation);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);

  // ─── Data hook ────────────────────────────────────────────────────────
  const data = useGitSheetData(visible, currentWorkstation, initialTab);

  // Derived repo info
  const repoUrl = currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl;
  const { repoName, repoOwner, isOwnRepo } = deriveGitSheetRepoMeta(
    repoUrl,
    data.linkedAccount?.username,
  );

  // ─── Actions hook ─────────────────────────────────────────────────────
  const actions = useGitSheetActions({
    currentWorkstation,
    userId: data.userId,
    linkedAccount: data.linkedAccount,
    gitAccounts: data.gitAccounts,
    currentBranch: data.currentBranch,
    branches: data.branches,
    isDetachedHead: data.isDetachedHead,
    allChangedFiles: data.allChangedFiles,
    isOwnRepo,
    repoOwner,
    repoName,
    isLoadingRef: data.isLoadingRef,
    skipAutoFilterRef: data.skipAutoFilterRef,
    previousBranchRef: data.previousBranchRef,
    loadGitData: data.loadGitData,
    fetchDiff: data.fetchDiff,
    setSelectedBranchFilter: data.setSelectedBranchFilter,
    setShowAddAccountModal,
    t: data.t,
  });

  const lifecycle = useGitSheetLifecycle({
    visible,
    initialTab,
    actions,
    data,
    currentWorkstationName: currentWorkstation?.name,
    setShowAddAccountModal,
  });

  return (
    <GitSheetModalShell
      visible={visible}
      onClose={onClose}
      styles={styles}
      actionLoading={actions.actionLoading}
      repoName={repoName}
      repoOwner={repoOwner}
      aheadCount={data.aheadCount}
      behindCount={data.behindCount}
      onAction={actions.handleGitAction}
      activeSection={actions.activeSection}
      isGitRepo={data.isGitRepo}
      changesCount={data.allChangedFiles.length}
      t={data.t}
      onSelectSection={lifecycle.onSelectSection}
      refreshing={data.refreshing}
      onRefresh={data.handleRefresh}
      linkedAccount={data.linkedAccount}
      onOpenAccountPicker={() => actions.setShowAccountPicker(true)}
      fileContextMenu={actions.fileContextMenu}
      onCloseFileMenu={() => actions.setFileContextMenu(null)}
      onViewDiff={() => actions.handleFileMenuAction('viewDiff')}
      onDiscard={() => actions.handleFileMenuAction('discard')}
    >
      <GitSheetBody
        styles={styles}
        data={data}
        actions={actions}
        repoUrl={repoUrl}
        currentWorkstationName={lifecycle.currentWorkstationName}
        onOpenAddAccount={lifecycle.onOpenAddAccount}
        onOpenConnectRepo={lifecycle.onOpenConnectRepo}
      />
      <GitSheetDialogs
        styles={styles}
        data={data}
        actions={actions}
        currentWorkstation={currentWorkstation}
        showAddAccountModal={showAddAccountModal}
        setShowAddAccountModal={setShowAddAccountModal}
      />
    </GitSheetModalShell>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
    maxHeight: MODAL_HEIGHT,
    minHeight: 500,
    backgroundColor: 'rgba(18, 18, 22, 0.92)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    flexShrink: 1,
    marginRight: 10,
    overflow: 'hidden',
  },
  gitIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    gap: 2,
    flex: 1,
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  expandButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${AppColors.primary}15`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  branchText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.primary,
  },
  branchSwitcherDropdown: {
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  branchSwitcherOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  branchSwitcherOptionActive: {
    backgroundColor: `${AppColors.primary}10`,
  },
  branchSwitcherOptionText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  gitActions: {
    flexDirection: 'row',
    gap: 6,
  },
  gitActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  actionBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  tabTextActive: {
    color: '#fff',
  },
  changesBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  changesBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  branchFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  branchFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  branchFilterPillActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: 'rgba(139,92,246,0.5)',
  },
  branchFilterPillCurrent: {
    borderColor: 'rgba(255,255,255,0.25)',
  },
  branchFilterPillText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  branchFilterPillTextActive: {
    color: '#fff',
  },
  commitsList: {
    paddingLeft: 4,
  },
  commitItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 56,
  },
  commitMenuBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    alignSelf: 'center',
  },
  timeline: {
    width: 24,
    position: 'relative',
  },
  timelineLine: {
    width: 2,
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    position: 'absolute',
    left: 11,
  },
  timelineLineTop: {
    top: 0,
    height: '50%',
  },
  timelineLineBottom: {
    bottom: 0,
    height: '50%',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1a1a1c',
    borderWidth: 2,
    borderColor: 'rgba(139, 92, 246, 0.6)',
    position: 'absolute',
    left: 7,
    top: 8,
    zIndex: 1,
  },
  timelineDotHead: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: AppColors.primary,
    borderWidth: 0,
    position: 'absolute',
    left: 5,
    top: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1,
  },
  timelineDotInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },
  commitContent: {
    flex: 1,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 4,
    gap: 4,
  },
  commitBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 2,
  },
  branchBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  branchBadgeInlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  headBadgeInline: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  headBadgeInlineText: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  // Remote badge (origin/main)
  remoteBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  remoteBadgeInlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(34, 197, 94, 0.9)',
  },
  branchRefBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  branchRefBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(167, 139, 250, 0.9)',
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(34, 211, 238, 0.9)',
  },
  // Unpushed commit styles
  timelineDotUnpushed: {
    borderColor: 'rgba(251, 146, 60, 0.6)',
  },
  timelineLineUnpushed: {
    borderLeftColor: 'rgba(251, 146, 60, 0.3)',
  },
  commitMessageUnpushed: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  commitMessage: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 18,
  },
  commitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  commitAvatarSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  commitAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitAvatarTextSmall: {
    fontSize: 8,
    fontWeight: '600',
    color: '#fff',
  },
  commitHash: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.4)',
  },
  commitAuthor: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
  commitDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginLeft: 24,
    marginTop: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
  },
  showMoreText: {
    fontSize: 12,
    fontWeight: '500',
    color: AppColors.primary,
  },
  branchesList: {
    gap: 4,
  },
  branchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
  },
  branchItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  branchItemText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  branchItemTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  currentBadge: {
    backgroundColor: `${AppColors.primary}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
  },
  addBranchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    marginTop: 4,
  },
  addBranchText: {
    fontSize: 13,
    color: AppColors.primary,
    fontWeight: '500',
  },
  createBranchContainer: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  createBranchInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  createBranchActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  createBranchCancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  createBranchCancelText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  createBranchConfirmBtn: {
    backgroundColor: AppColors.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  createBranchConfirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  changesContainer: {
    paddingTop: 4,
    paddingBottom: 20,
  },
  changeSection: {
    marginBottom: 16,
  },
  changeSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  changeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
    marginBottom: 4,
  },
  changeFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  changeFileName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    flex: 1,
  },
  diffModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  diffModalContainer: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    minHeight: '50%',
  },
  diffModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  diffModalTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    fontFamily: 'monospace',
  },
  diffLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  diffScroll: {
    flex: 1,
  },
  diffLine: {
    flexDirection: 'row',
    paddingVertical: 1,
    paddingHorizontal: 4,
    minWidth: '100%',
  },
  diffLineAdd: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  diffLineDel: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  diffLineHeader: {
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
  },
  diffLineNum: {
    width: 36,
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'right',
    marginRight: 8,
    fontFamily: 'monospace',
  },
  diffLineText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'monospace',
  },
  diffLineTextAdd: {
    color: '#4ade80',
  },
  diffLineTextDel: {
    color: '#f87171',
  },
  diffLineTextHeader: {
    color: '#60a5fa',
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  connectGitIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  connectGitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  connectGitSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
    marginBottom: 16,
  },
  connectGitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  connectGitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  selectAllText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  selectedCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  discardSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    marginBottom: 12,
  },
  discardSelectedText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FF6B6B',
  },
  changeFolderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  changeFolderName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    flex: 1,
  },
  changeFolderCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  popoverBackdrop: {
    flex: 1,
  },
  popoverMenu: {
    position: 'absolute',
    minWidth: 180,
    backgroundColor: '#1c1c2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
    paddingVertical: 4,
  },
  popoverTitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  popoverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  popoverItemText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  popoverDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 2,
  },
  commitSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  commitInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  commitActions: {
    flexDirection: 'row',
    gap: 8,
  },
  commitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.primary,
    paddingVertical: 12,
    borderRadius: 8,
  },
  commitBtnDisabled: {
    opacity: 0.4,
  },
  commitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  pushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  pushBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  pushBtnWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  pushBtnTextWarning: {
    color: '#f59e0b',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  accountAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  accountName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6,
  },
  retryText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#1a1a1c',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: 400,
    paddingBottom: 30,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  pickerList: {
    maxHeight: 250,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  pickerItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  pickerItemContent: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  pickerItemProvider: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'capitalize',
  },
  pickerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 10,
  },
  pickerAddText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.primary,
  },
  createCommitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  createCommitBtnDisabled: {
    opacity: 0.35,
  },
  createCommitBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  authRequiredContainer: {
    marginTop: 16,
    gap: 12,
  },
  authRequiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.2)',
  },
  authRequiredText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFB800',
    textAlign: 'center',
  },
  authRequiredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 50,
  },
  authRequiredBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  commitModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commitModalContainer: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#1a1a1e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  commitModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  commitModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  commitModalFilesSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
  },
  commitModalFilesText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.primary,
  },
  commitModalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  commitModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  commitModalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  commitModalBtnDisabled: {
    opacity: 0.4,
  },
  commitModalBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  commitModalPushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  commitModalPushBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  commitModalDescInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 13,
    minHeight: 60,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  commitModalLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  // Ahead/behind pills
  aheadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  aheadPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.primary,
  },
  behindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  behindPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f59e0b',
  },
  // Remote separator
  remoteSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    paddingHorizontal: 8,
  },
  remoteSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  remoteSeparatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginHorizontal: 8,
  },
  remoteSeparatorText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  // Commit context menu
  contextMenuContainer: {
    width: '85%',
    maxWidth: 360,
    backgroundColor: '#1a1a1e',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  contextMenuHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 4,
  },
  contextMenuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  contextMenuHash: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.4)',
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  contextMenuItemText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  contextMenuBranchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  contextMenuInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contextMenuCreateBtn: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  contextMenuCreateBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  // Detached HEAD
  detachedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    alignSelf: 'flex-start',
    marginLeft: 28,
  },
  detachedBannerText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#f59e0b',
  },
  detachedPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  detachedPillText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#f59e0b',
  },
  detachedBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  detachedBadgeInlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f59e0b',
  },
  commitItemDetachedHere: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 8,
  },
  timelineDotDetached: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#f59e0b',
    borderWidth: 0,
    position: 'absolute',
    left: 5,
    top: 6,
  },
  timelineDotInnerDetached: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  commitFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  commitFileStatus: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitFileName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  commitFilePath: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },
  inlineDiffContainer: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    marginHorizontal: 8,
    marginBottom: 6,
    maxHeight: 300,
    overflow: 'hidden',
  },
  inlineDiffLine: {
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  inlineDiffText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.5)',
  },
  pushModalContainer: {
    width: '85%',
    maxWidth: 380,
    backgroundColor: 'rgba(28, 28, 32, 0.97)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 20,
  },
  pushModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pushModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  pushModalSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 18,
  },
  pushModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  pushModalLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    width: 60,
  },
  pushModalPicker: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pushModalPickerText: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  pushBranchDropdown: {
    marginLeft: 70,
    marginTop: -6,
    marginBottom: 10,
    backgroundColor: 'rgba(40, 40, 46, 0.98)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  pushBranchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pushBranchOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pushBranchOptionText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  pushModalOptions: {
    marginTop: 8,
    gap: 10,
    marginBottom: 18,
  },
  pushModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pushModalOptionText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  pushModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  pushModalCancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pushModalCancelText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  pushModalPushBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: AppColors.primary,
    minWidth: 70,
    alignItems: 'center',
  },
  pushModalPushText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
});
