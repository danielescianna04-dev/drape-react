import React from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GitSheetAccountRow, GitSheetContainer, GitSheetFileContextMenu, GitSheetHeader, GitSheetTabs } from './GitSheetSections';
import type { GitSheetStyles } from './gitSheetTypes';
import type { GitAccount } from '../../../core/git/gitAccountService';

interface GitSheetModalShellProps {
  visible: boolean;
  onClose: () => void;
  styles: GitSheetStyles;
  actionLoading: string | null;
  repoName: string;
  repoOwner: string;
  aheadCount: number;
  behindCount: number;
  onAction: (action: 'pull' | 'push' | 'fetch') => void;
  activeSection: 'commits' | 'branches' | 'changes';
  isGitRepo: boolean;
  changesCount: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onSelectSection: (section: 'commits' | 'branches' | 'changes') => void;
  refreshing: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
  linkedAccount: GitAccount | null;
  onOpenAccountPicker: () => void;
  fileContextMenu: { y: number; file: string; type: string } | null;
  onCloseFileMenu: () => void;
  onViewDiff: () => void;
  onDiscard: () => void;
}

export const GitSheetModalShell = ({
  visible,
  onClose,
  styles,
  actionLoading,
  repoName,
  repoOwner,
  aheadCount,
  behindCount,
  onAction,
  activeSection,
  isGitRepo,
  changesCount,
  t,
  onSelectSection,
  refreshing,
  onRefresh,
  children,
  linkedAccount,
  onOpenAccountPicker,
  fileContextMenu,
  onCloseFileMenu,
  onViewDiff,
  onDiscard,
}: GitSheetModalShellProps) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
    statusBarTranslucent
  >
    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
    <View style={styles.backdrop} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <GitSheetContainer styles={styles}>
        <GitSheetHeader
          styles={styles}
          repoName={repoName}
          repoOwner={repoOwner}
          onClose={onClose}
          actionLoading={actionLoading}
          aheadCount={aheadCount}
          behindCount={behindCount}
          onAction={onAction}
        />
        <GitSheetTabs
          styles={styles}
          activeSection={activeSection}
          isGitRepo={isGitRepo}
          changesCount={changesCount}
          t={t}
          onSelect={onSelectSection}
        />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          }
        >
          {children}
        </ScrollView>

        {linkedAccount && (
          <GitSheetAccountRow
            styles={styles}
            linkedAccount={linkedAccount}
            onOpen={onOpenAccountPicker}
          />
        )}
      </GitSheetContainer>
    </View>

    {fileContextMenu && (
      <GitSheetFileContextMenu
        styles={styles}
        title={fileContextMenu.file.split('/').pop() || fileContextMenu.file}
        y={fileContextMenu.y}
        viewDiffLabel={t('terminal:git.viewDiff')}
        discardLabel={t('terminal:git.discardChanges')}
        onClose={onCloseFileMenu}
        onViewDiff={onViewDiff}
        onDiscard={onDiscard}
      />
    )}
  </Modal>
);
