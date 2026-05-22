import React, { useEffect } from 'react';
import { WorkspaceScreen } from '../../app/WorkspaceScreen';
import { useWorkstationStore } from '../../core/terminal/workstationStore';
import type { WorkstationInfo } from '../../shared/types';

interface Props {
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
  onOpenProject: (workstation: WorkstationInfo) => void;
  onSettings?: () => void;
  onOpenPlans?: () => void;
}

export const ProjectsHomeScreen = (_props: Props) => {
  const setWorkstation = useWorkstationStore((s) => s.setWorkstation);

  // Home = no project selected. Ensure sidebar shows only the Progetti section.
  useEffect(() => {
    setWorkstation(null);
  }, [setWorkstation]);

  return <WorkspaceScreen onExit={() => {}} />;
};
