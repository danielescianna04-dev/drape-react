import { useEffect, useMemo } from 'react';
import { tracciaAccountGitCollegato, tracciaConnettiRepo, tracciaTabGitCambiato } from '../../../../core/services/analyticsService';

export function useGitSheetLifecycle({
  visible,
  initialTab,
  actions,
  data,
  currentWorkstationName,
  setShowAddAccountModal,
}: {
  visible: boolean;
  initialTab?: 'commits' | 'branches' | 'changes';
  actions: any;
  data: any;
  currentWorkstationName?: string;
  setShowAddAccountModal: (value: boolean) => void;
}) {
  useEffect(() => {
    if (visible && initialTab) actions.setActiveSection(initialTab);
  }, [visible, initialTab, actions]);

  useEffect(() => {
    if (!visible) {
      actions.resetActionState();
      data.setDiffFile(null);
      data.setDiffContent(null);
    }
  }, [visible, actions, data]);

  const callbacks = useMemo(() => ({
    onSelectSection: (section: 'commits' | 'branches' | 'changes') => {
      actions.setActiveSection(section);
      tracciaTabGitCambiato(section);
      if (section === 'changes') data.fetchBackendStatus(data.currentBranch);
    },
    onOpenAddAccount: () => {
      setShowAddAccountModal(true);
      tracciaAccountGitCollegato('github');
    },
    onOpenConnectRepo: () => {
      actions.setShowConnectModal(true);
      tracciaConnettiRepo();
    },
    currentWorkstationName,
  }), [actions, data, setShowAddAccountModal, currentWorkstationName]);

  return callbacks;
}
