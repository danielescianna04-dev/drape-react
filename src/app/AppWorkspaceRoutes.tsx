import React from 'react';
import { View } from 'react-native';
import Animated, { FadeOut, SlideInRight } from 'react-native-reanimated';
import { NavigationContainer } from '@react-navigation/native';
import { ProjectsHomeScreen } from '../features/projects/ProjectsHomeScreen';
import { CreateProjectScreen } from '../features/projects/CreateProjectScreen';
import { AllProjectsScreen } from '../features/projects/AllProjectsScreen';
import { WorkspaceScreen } from './WorkspaceScreen';
import { SettingsOverlay } from './SettingsOverlay';
import type { WorkstationInfo } from '../shared/types';

type Screen = 'home' | 'create' | 'terminal' | 'allProjects' | 'settings' | 'plans';

interface Props {
  currentScreen: Screen | string;
  previousScreen: Screen | string | null | undefined;
  createKey: number;
  isFirstCreate: boolean;
  shouldShowHomeShell: boolean;
  shouldShowWorkspaceShell: boolean;
  initialPlanIndex?: number;
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
  onSettings: () => void;
  onOpenPlans: () => void;
  onOpenProject: (workstation: WorkstationInfo, options?: { fromAllProjects?: boolean }) => void;
  onCreateBack: () => void;
  onCreateOpenPlans: () => void;
  onCreateComplete: (workstation: WorkstationInfo) => Promise<void>;
  onExitWorkspace: () => void;
  onCloseAllProjects: () => void;
  onCloseSettings: () => void;
  onClosePlans: () => void;
}

export const AppWorkspaceRoutes: React.FC<Props> = ({
  currentScreen,
  createKey,
  isFirstCreate,
  shouldShowHomeShell,
  shouldShowWorkspaceShell,
  initialPlanIndex = 1,
  previousScreen,
  onCreateProject,
  onImportProject,
  onMyProjects,
  onSettings,
  onOpenPlans,
  onOpenProject,
  onCreateBack,
  onCreateOpenPlans,
  onCreateComplete,
  onExitWorkspace,
  onCloseAllProjects,
  onCloseSettings,
  onClosePlans,
}) => {
  return (
    <>
      {shouldShowHomeShell && (
        <View key="home-screen" style={{ flex: 1 }}>
          <NavigationContainer>
            <ProjectsHomeScreen
              onCreateProject={onCreateProject}
              onImportProject={onImportProject}
              onMyProjects={onMyProjects}
              onSettings={onSettings}
              onOpenPlans={onOpenPlans}
              onOpenProject={(workstation) => onOpenProject(workstation)}
            />
          </NavigationContainer>
        </View>
      )}

      {currentScreen === 'create' && (
        <View
          key={`create-screen-${createKey}`}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
        >
          <CreateProjectScreen
            progressOffset={isFirstCreate ? 5 : 0}
            progressTotal={isFirstCreate ? 8 : 3}
            onBack={onCreateBack}
            onOpenPlans={onCreateOpenPlans}
            onCreate={onCreateComplete}
          />
        </View>
      )}

      {shouldShowWorkspaceShell && (
        <WorkspaceScreen onExit={onExitWorkspace} />
      )}

      {currentScreen === 'allProjects' && (
        <Animated.View
          key="all-projects-screen"
          entering={SlideInRight.duration(300)}
          exiting={FadeOut.duration(200)}
          style={{ flex: 1 }}
        >
          <AllProjectsScreen
            onClose={onCloseAllProjects}
            onOpenProject={(workstation) => onOpenProject(workstation, { fromAllProjects: true })}
          />
        </Animated.View>
      )}

      {currentScreen === 'settings' && (
        <SettingsOverlay onClose={onCloseSettings} />
      )}

      {currentScreen === 'plans' && (
        <SettingsOverlay
          onClose={onClosePlans}
          initialShowPlans={true}
          initialPlanIndex={initialPlanIndex}
        />
      )}
    </>
  );
};
