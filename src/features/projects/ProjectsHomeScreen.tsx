import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LoadingModal } from '../../shared/components/molecules/LoadingModal';
import { ProjectLoadingOverlay } from '../../shared/components/molecules/ProjectLoadingOverlay';
import type { WorkstationInfo } from '../../shared/types';
import { tracciaImportGitAvviato, tracciaEsploraFile } from '../../core/services/analyticsService';
import {
  ProjectCommitsOverlay,
  ProjectMenuSheet,
  ProjectsHomeContent,
  ProjectsHomeHeader,
  RenameProjectModal,
} from './projectsHomeParts';
import { styles } from './projectsHomeStyles';
import { useProjectsData } from './useProjectsData';
import { useProjectActions } from './useProjectActions';


interface Props {
  onCreateProject: () => void;
  onImportProject: () => void;
  onMyProjects: () => void;
  onOpenProject: (workstation: WorkstationInfo) => void;
  onSettings?: () => void;
  onOpenPlans?: () => void;
}

export const ProjectsHomeScreen = ({ onCreateProject, onImportProject, onMyProjects, onOpenProject, onSettings, onOpenPlans }: Props) => {
  const data = useProjectsData();
  const actions = useProjectActions({
    onOpenProject,
    t: data.t,
    user: data.user,
    sheetAnim: data.sheetAnim,
    progressTimerRef: data.progressTimerRef,
    currentProgressRef: data.currentProgressRef,
    animateProgressTo: data.animateProgressTo,
    setIsLoadingProject: data.setIsLoadingProject,
    setLoadingProjectName: data.setLoadingProjectName,
    setLoadingProgress: data.setLoadingProgress,
    setLoadingStep: data.setLoadingStep,
    loadingProjectName: data.loadingProjectName,
    loadRecentProjects: data.loadRecentProjects,
    setRecentProjects: data.setRecentProjects,
    resetLoadingState: data.resetLoadingState,
  });

  const handleNewProject = () => {
    onCreateProject();
  };

  return (
    <View style={styles.container}>
      {/* Branded gradient background — matching Create screen atmosphere */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
        />
        <LinearGradient
          colors={['#0C0816', '#1E1040', '#0C0816']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
        />
      </View>

      <ProjectsHomeHeader
        styles={styles}
        userAvatar={data.userAvatar}
        userName={data.userName}
        greeting={data.greeting}
        currentPlan={data.currentPlan}
        onSettings={onSettings}
      />

      <ProjectsHomeContent
        styles={styles}
        refreshing={data.refreshing}
        onRefresh={data.onRefresh}
        currentPlan={data.currentPlan}
        showUpgradeCta={data.showUpgradeCta}
        setShowUpgradeCta={data.setShowUpgradeCta}
        onOpenPlans={onOpenPlans}
        projectCounts={data.projectCounts}
        onCreateProject={handleNewProject}
        onImportProject={() => { tracciaImportGitAvviato(); onImportProject(); }}
        onBrowseFiles={() => { tracciaEsploraFile(); actions.handleBrowseFiles(); }}
        focusKey={data.focusKey}
        t={data.t}
        loading={data.loading}
        recentProjects={data.recentProjects}
        shimmerOpacity={data.shimmerOpacity}
        onMyProjects={onMyProjects}
        onProjectOpen={actions.handleProjectOpen}
        onOpenMenu={actions.handleOpenMenu}
        getTimeAgo={data.getTimeAgo}
      />

      <ProjectMenuSheet
        styles={styles}
        menuVisible={actions.menuVisible}
        sheetAnim={data.sheetAnim}
        focusKey={data.focusKey}
        selectedProject={actions.selectedProject}
        repoVisibility={actions.repoVisibility}
        t={data.t}
        onCloseMenu={actions.handleCloseMenu}
        onCopyRepository={async () => {
          const url = actions.selectedProject?.repositoryUrl || actions.selectedProject?.githubUrl;
          if (!url) return;
          const Clipboard = await import('expo-clipboard');
          await Clipboard.setStringAsync(url);
          Alert.alert(data.t('common:copied'), data.t('file.linkCopied'));
        }}
        onOpenProject={() => {
          if (!actions.selectedProject) return;
          actions.handleCloseMenu();
          setTimeout(() => actions.handleProjectOpen(actions.selectedProject), 300);
        }}
        onOpenCommits={() => {
          actions.handleCloseMenu();
          setTimeout(() => actions.setShowCommits(true), 300);
        }}
        onDuplicateProject={actions.handleDuplicateProject}
        isDuplicating={actions.isDuplicating}
        onShareProject={actions.handleShareProject}
        onOpenRename={actions.handleOpenRename}
        onDeleteProject={actions.handleDeleteProject}
      />

      <ProjectCommitsOverlay
        selectedProject={actions.selectedProject}
        showCommits={actions.showCommits}
        onClose={() => {
          actions.setShowCommits(false);
          actions.setSelectedProject(null);
        }}
      />

      <RenameProjectModal
        styles={styles}
        visible={actions.showRenameModal}
        t={data.t}
        newProjectName={actions.newProjectName}
        setNewProjectName={actions.setNewProjectName}
        onClose={() => actions.setShowRenameModal(false)}
        onConfirm={actions.handleConfirmRename}
      />

      <LoadingModal
        visible={actions.isDuplicating}
        message={data.t('actions.deleting')}
      />

      {/* Project Loading Overlay - shows until VM is ready */}
      <ProjectLoadingOverlay
        visible={data.isLoadingProject}
        projectName={data.loadingProjectName}
        message={data.t('actions.startingEnv')}
        progress={data.loadingProgress}
        currentStep={data.loadingStep}
        showTips={true}
      />

    </View>
  );
};
