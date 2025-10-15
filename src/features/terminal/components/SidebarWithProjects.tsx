import React, { useState } from 'react';
import { Modal } from 'react-native';
import { Sidebar } from './Sidebar';
import { AllProjectsScreen } from '../../projects/AllProjectsScreen';

interface Props {
  onClose: () => void;
}

export const SidebarWithProjects = ({ onClose }: Props) => {
  const [showAllProjects, setShowAllProjects] = useState(false);

  if (showAllProjects) {
    return (
      <Modal visible={true} animationType="slide">
        <AllProjectsScreen onClose={() => setShowAllProjects(false)} />
      </Modal>
    );
  }

  return <Sidebar onClose={onClose} onOpenAllProjects={() => setShowAllProjects(true)} />;
};
