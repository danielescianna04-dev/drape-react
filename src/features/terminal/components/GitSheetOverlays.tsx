import React from 'react';
import { ActivityIndicator, Alert, Animated, Image, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';

export const GitAccountPickerModal = ({
  visible,
  styles,
  t,
  gitAccounts,
  linkedAccount,
  onClose,
  onSelectAccount,
  onAddAccount,
}: any) => (
  <Modal
    visible={visible}
    transparent
    animationType="none"
    onRequestClose={onClose}
    statusBarTranslucent
  >
    <Reanimated.View
      style={styles.pickerBackdrop}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Reanimated.View
        style={styles.pickerContainer}
        entering={SlideInDown.duration(250)}
        exiting={SlideOutDown.duration(200)}
      >
        <Text style={styles.pickerTitle}>{t('git.selectAccount')}</Text>
        <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
          {gitAccounts.map((account: any) => (
            <TouchableOpacity
              key={account.id}
              style={[
                styles.pickerItem,
                linkedAccount?.id === account.id && styles.pickerItemActive
              ]}
              onPress={() => onSelectAccount(account)}
            >
              <Image source={{ uri: account.avatarUrl }} style={styles.pickerAvatar} />
              <View style={styles.pickerItemContent}>
                <Text style={styles.pickerItemName}>{account.username}</Text>
                <Text style={styles.pickerItemProvider}>{account.provider}</Text>
              </View>
              {linkedAccount?.id === account.id && (
                <Ionicons name="checkmark-circle" size={20} color={AppColors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.pickerAddBtn} onPress={onAddAccount}>
          <Ionicons name="add-circle-outline" size={20} color={AppColors.primary} />
          <Text style={styles.pickerAddText}>{t('git.linkAccount')}</Text>
        </TouchableOpacity>
      </Reanimated.View>
    </Reanimated.View>
  </Modal>
);

export const GitCommitComposerModal = ({
  visible,
  styles,
  t,
  selectedFiles,
  commitMessage,
  setCommitMessage,
  commitDescription,
  setCommitDescription,
  actionLoading,
  onClose,
  onCommit,
  onCommitAndPush,
}: any) => (
  <Modal
    visible={visible}
    transparent
    animationType="none"
    onRequestClose={onClose}
    statusBarTranslucent
  >
    <Reanimated.View
      style={styles.commitModalBackdrop}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Reanimated.View
        style={styles.commitModalContainer}
        entering={FadeIn.duration(250).springify()}
        exiting={FadeOut.duration(200)}
      >
        <View style={styles.commitModalHeader}>
          <Text style={styles.commitModalTitle}>{t('git.commit')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        <View style={styles.commitModalFilesSummary}>
          <Ionicons name="documents-outline" size={16} color={AppColors.primary} />
          <Text style={styles.commitModalFilesText}>
            {selectedFiles.size === 1 ? t('terminal:git.filesSelected', { count: selectedFiles.size }) : t('terminal:git.filesSelectedPlural', { count: selectedFiles.size })}
          </Text>
        </View>

        <Text style={styles.commitModalLabel}>Title</Text>
        <TextInput
          style={styles.commitModalInput}
          placeholder={t('terminal:git.commitMessagePlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={commitMessage}
          onChangeText={setCommitMessage}
          numberOfLines={1}
          returnKeyType="next"
        />

        <Text style={styles.commitModalLabel}>Description (optional)</Text>
        <TextInput
          style={styles.commitModalDescInput}
          placeholder="Add more details about this commit..."
          placeholderTextColor="rgba(255,255,255,0.2)"
          value={commitDescription}
          onChangeText={setCommitDescription}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <View style={styles.commitModalActions}>
          <TouchableOpacity
            style={[styles.commitModalBtn, !commitMessage.trim() && styles.commitModalBtnDisabled]}
            onPress={onCommit}
            disabled={!commitMessage.trim() || !!actionLoading}
          >
            {actionLoading === 'commit' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.commitModalBtnText}>Commit</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.commitModalPushBtn, !commitMessage.trim() && styles.commitModalBtnDisabled]}
            onPress={onCommitAndPush}
            disabled={!commitMessage.trim() || !!actionLoading}
          >
            {actionLoading === 'push' || actionLoading === 'commit' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />
                <Text style={styles.commitModalBtnText}>Commit & Push</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Reanimated.View>
    </Reanimated.View>
  </Modal>
);

export const GitCommitContextMenu = ({
  visible,
  styles,
  commitContextMenu,
  newBranchFromCommit,
  branchFromName,
  setBranchFromName,
  actionLoading,
  currentWorkstation,
  currentBranch,
  isDetachedHead,
  previousBranchRef,
  linkedAccount,
  userId,
  allChangedFiles,
  setActionLoading,
  setCommitContextMenu,
  setNewBranchFromCommit,
  setCommitFilesModal,
  setExpandedCommitFile,
  setExpandedCommitDiff,
  setCommitCollapsedFolders,
  fetchCommitFiles,
  handleRevertCommit,
  handleBranchFromCommit,
  loadGitData,
  t,
}: any) => {
  if (!visible || !commitContextMenu) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.commitModalBackdrop]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => { setCommitContextMenu(null); setNewBranchFromCommit(null); }} />
      <View style={styles.contextMenuContainer}>
        <View style={styles.contextMenuHeader}>
          <Text style={styles.contextMenuTitle} numberOfLines={1}>{commitContextMenu.message}</Text>
          <Text style={styles.contextMenuHash}>{commitContextMenu.shortHash}</Text>
        </View>

        <TouchableOpacity
          style={styles.contextMenuItem}
          onPress={() => {
            const info = { ...commitContextMenu };
            setCommitContextMenu(null);
            setCommitFilesModal(info);
            setExpandedCommitFile(null);
            setExpandedCommitDiff(null);
            setCommitCollapsedFolders(new Set());
            fetchCommitFiles(info.hash);
          }}
        >
          <Ionicons name="document-text-outline" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={styles.contextMenuItemText}>View Changed Files</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.contextMenuItem}
          onPress={async () => {
            const Clipboard = await import('expo-clipboard');
            await Clipboard.setStringAsync(commitContextMenu.hash);
            Alert.alert('Copied', `SHA ${commitContextMenu.shortHash} copied`);
            setCommitContextMenu(null);
          }}
        >
          <Ionicons name="copy-outline" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={styles.contextMenuItemText}>Copy Commit SHA</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.contextMenuItem}
          onPress={() => {
            const { hash, shortHash, message } = commitContextMenu;
            setCommitContextMenu(null);
            Alert.alert(
              'Checkout Commit',
              `Checkout ${shortHash} "${message}"?\n\nThis will put the repository in detached HEAD state.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Checkout',
                  onPress: async () => {
                    if (!currentWorkstation?.id) return;
                    if (currentBranch && !isDetachedHead) {
                      previousBranchRef.current = currentBranch;
                    }
                    setActionLoading('checkout');
                    let didStash = false;
                    try {
                      const { getAuthHeaders } = await import('../../../core/api/getAuthToken');
                      const { gitAccountService } = await import('../../../core/git/gitAccountService');
                      const { config } = await import('../../../config/config');
                      const authHeaders = await getAuthHeaders();
                      const token = linkedAccount ? await gitAccountService.getToken(linkedAccount, userId) : '';

                      if (allChangedFiles.length > 0) {
                        const stashRes = await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
                          body: JSON.stringify({ action: 'push', message: `Auto-stash before checkout ${shortHash}` }),
                        });
                        didStash = stashRes.ok;
                      }

                      const response = await fetch(`${config.apiUrl}/git/checkout/${currentWorkstation.id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders },
                        body: JSON.stringify({ branch: hash }),
                      });
                      const result = await response.json();
                      if (result.success) {
                        if (didStash) {
                          await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
                            body: JSON.stringify({ action: 'pop' }),
                          });
                        }
                        Alert.alert('Success', `Checked out ${shortHash}`);
                        const { useGitCacheStore } = await import('../../../core/cache/gitCacheStore');
                        const { useFileCacheStore } = await import('../../../core/cache/fileCacheStore');
                        useGitCacheStore.getState().clearCache(currentWorkstation.id);
                        useFileCacheStore.getState().clearCache(currentWorkstation.id);
                        await loadGitData();
                      } else {
                        if (didStash) {
                          await fetch(`${config.apiUrl}/git/stash/${currentWorkstation.id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...authHeaders, 'X-Git-Token': token || '' },
                            body: JSON.stringify({ action: 'pop' }),
                          });
                        }
                        Alert.alert('Error', result.output || 'Checkout failed');
                      }
                    } catch (e: any) {
                      Alert.alert('Error', e.message || 'Checkout failed');
                    } finally {
                      setActionLoading(null);
                    }
                  },
                },
              ],
            );
          }}
          disabled={!!actionLoading}
        >
          <Ionicons name="log-out-outline" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={styles.contextMenuItemText}>Checkout Commit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.contextMenuItem}
          onPress={() => {
            const hash = commitContextMenu.hash;
            const message = commitContextMenu.message;
            setCommitContextMenu(null);
            Alert.alert(
              'Revert Commit',
              `Revert "${message}"?\nThis creates a new commit that undoes the changes.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Revert', style: 'destructive', onPress: () => handleRevertCommit(hash) },
              ],
            );
          }}
          disabled={!!actionLoading}
        >
          <Ionicons name="arrow-undo-outline" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={styles.contextMenuItemText}>Revert Commit</Text>
        </TouchableOpacity>

        {!newBranchFromCommit ? (
          <TouchableOpacity
            style={styles.contextMenuItem}
            onPress={() => setNewBranchFromCommit(commitContextMenu.hash)}
            disabled={!!actionLoading}
          >
            <Ionicons name="git-branch-outline" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={styles.contextMenuItemText}>New Branch from Here</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.contextMenuBranchInput}>
            <TextInput
              style={styles.contextMenuInput}
              placeholder="Branch name..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={branchFromName}
              onChangeText={setBranchFromName}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.contextMenuCreateBtn, !branchFromName.trim() && { opacity: 0.4 }]}
              onPress={() => {
                if (branchFromName.trim() && newBranchFromCommit) {
                  handleBranchFromCommit(newBranchFromCommit, branchFromName.trim());
                  setCommitContextMenu(null);
                }
              }}
              disabled={!branchFromName.trim() || !!actionLoading}
            >
              {actionLoading === 'branch-from' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.contextMenuCreateBtnText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const BranchPickerList = ({ items, selected, icon, styles, onSelect, formatLabel }: any) => (
  <View style={styles.pushBranchDropdown}>
    <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
      {items.map((item: any) => {
        const name = item.name ?? item;
        const label = formatLabel ? formatLabel(item) : name;
        return (
          <TouchableOpacity
            key={name}
            style={[styles.pushBranchOption, name === selected && styles.pushBranchOptionActive]}
            onPress={() => onSelect(name)}
          >
            <Ionicons name={icon} size={14} color={name === selected ? AppColors.primary : 'rgba(255,255,255,0.5)'} />
            <Text style={[styles.pushBranchOptionText, name === selected && { color: AppColors.primary }]}>{label}</Text>
            {name === selected && <Ionicons name="checkmark" size={16} color={AppColors.primary} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

export const GitPullModal = ({
  visible,
  styles,
  branches,
  pullRemote,
  pullBranch,
  setPullBranch,
  pullBranchPickerOpen,
  setPullBranchPickerOpen,
  pullIntoBranch,
  setPullIntoBranch,
  pullIntoPickerOpen,
  setPullIntoPickerOpen,
  currentBranch,
  pullRebase,
  setPullRebase,
  pullStash,
  setPullStash,
  actionLoading,
  onClose,
  onExecute,
}: any) => {
  if (!visible) return null;

  const branchItems = (() => {
    const seen = new Set<string>();
    const items: { name: string; display: string }[] = [];
    branches.filter((b: any) => !b.isRemote).forEach((b: any) => {
      if (!seen.has(b.name)) { seen.add(b.name); items.push({ name: b.name, display: b.name }); }
    });
    branches.filter((b: any) => b.isRemote).forEach((b: any) => {
      const short = b.name.replace(/^origin\//, '');
      if (!seen.has(short)) { seen.add(short); items.push({ name: short, display: short }); }
    });
    return items;
  })();
  const intoItems = branches.filter((b: any) => !b.isRemote && !b.name.startsWith('origin/'));

  return (
    <View style={[StyleSheet.absoluteFill, styles.commitModalBackdrop]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.pushModalContainer}>
        <View style={styles.pushModalHeader}>
          <Ionicons name="cloud-download-outline" size={22} color="#fff" />
          <Text style={styles.pushModalTitle}>Pull</Text>
        </View>
        <Text style={styles.pushModalSubtitle}>Pull remote changes and merge into your local branch</Text>

        <View style={styles.pushModalRow}>
          <Text style={styles.pushModalLabel}>Remote:</Text>
          <View style={[styles.pushModalPicker, { opacity: 0.6 }]}>
            <Ionicons name="server-outline" size={14} color="rgba(255,255,255,0.5)" />
            <Text style={styles.pushModalPickerText} numberOfLines={1}>{pullRemote}</Text>
          </View>
        </View>

        <View style={styles.pushModalRow}>
          <Text style={styles.pushModalLabel}>Branch:</Text>
          <TouchableOpacity
            style={styles.pushModalPicker}
            onPress={() => { setPullBranchPickerOpen(!pullBranchPickerOpen); setPullIntoPickerOpen(false); }}
          >
            <Ionicons name="git-branch-outline" size={14} color={AppColors.primary} />
            <Text style={styles.pushModalPickerText} numberOfLines={1}>{pullBranch}</Text>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>

        {pullBranchPickerOpen && (
          <BranchPickerList
            items={branchItems}
            selected={pullBranch}
            icon="git-branch-outline"
            styles={styles}
            onSelect={(name: string) => { setPullBranch(name); setPullBranchPickerOpen(false); }}
            formatLabel={(item: any) => item.display}
          />
        )}

        <View style={styles.pushModalRow}>
          <Text style={styles.pushModalLabel}>Into:</Text>
          <TouchableOpacity
            style={styles.pushModalPicker}
            onPress={() => { setPullIntoPickerOpen(!pullIntoPickerOpen); setPullBranchPickerOpen(false); }}
          >
            <Ionicons name="git-branch-outline" size={14} color={AppColors.primary} />
            <Text style={styles.pushModalPickerText} numberOfLines={1}>{pullIntoBranch || currentBranch}</Text>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>

        {pullIntoPickerOpen && (
          <BranchPickerList
            items={intoItems}
            selected={pullIntoBranch || currentBranch}
            icon="git-branch-outline"
            styles={styles}
            onSelect={(name: string) => { setPullIntoBranch(name); setPullIntoPickerOpen(false); }}
          />
        )}

        <View style={styles.pushModalOptions}>
          <TouchableOpacity style={styles.pushModalOption} onPress={() => setPullRebase(!pullRebase)}>
            <Ionicons name={pullRebase ? 'checkbox' : 'square-outline'} size={20} color={pullRebase ? AppColors.primary : 'rgba(255,255,255,0.4)'} />
            <Text style={styles.pushModalOptionText}>Rebase instead of merge</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pushModalOption} onPress={() => setPullStash(!pullStash)}>
            <Ionicons name={pullStash ? 'checkbox' : 'square-outline'} size={20} color={pullStash ? AppColors.primary : 'rgba(255,255,255,0.4)'} />
            <Text style={styles.pushModalOptionText}>Stash and reapply local changes</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pushModalActions}>
          <TouchableOpacity style={styles.pushModalCancelBtn} onPress={onClose}>
            <Text style={styles.pushModalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pushModalPushBtn, { backgroundColor: '#3b82f6' }]} onPress={onExecute} disabled={!!actionLoading}>
            {actionLoading === 'pull' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pushModalPushText}>Pull</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export const GitPushModal = ({
  visible,
  styles,
  branches,
  currentBranch,
  pushDestBranch,
  setPushDestBranch,
  pushDestPickerOpen,
  setPushDestPickerOpen,
  actionLoading,
  onClose,
  onExecute,
}: any) => {
  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.commitModalBackdrop]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.pushModalContainer}>
        <View style={styles.pushModalHeader}>
          <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
          <Text style={styles.pushModalTitle}>Push</Text>
        </View>

        <View style={styles.pushModalRow}>
          <Text style={styles.pushModalLabel}>Branch:</Text>
          <View style={[styles.pushModalPicker, { opacity: 0.6 }]}>
            <Ionicons name="git-branch-outline" size={14} color={AppColors.primary} />
            <Text style={styles.pushModalPickerText} numberOfLines={1}>{currentBranch}</Text>
          </View>
        </View>

        <View style={styles.pushModalRow}>
          <Text style={styles.pushModalLabel}>To:</Text>
          <TouchableOpacity style={styles.pushModalPicker} onPress={() => setPushDestPickerOpen(!pushDestPickerOpen)}>
            <Ionicons name="cloud-outline" size={14} color={AppColors.primary} />
            <Text style={styles.pushModalPickerText} numberOfLines={1}>origin/{pushDestBranch}</Text>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>

        {pushDestPickerOpen && (
          <BranchPickerList
            items={branches.filter((b: any) => !b.isRemote)}
            selected={pushDestBranch}
            icon="cloud-outline"
            styles={styles}
            onSelect={(name: string) => { setPushDestBranch(name); setPushDestPickerOpen(false); }}
            formatLabel={(item: any) => `origin/${item.name}`}
          />
        )}

        <View style={styles.pushModalActions}>
          <TouchableOpacity style={styles.pushModalCancelBtn} onPress={onClose}>
            <Text style={styles.pushModalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pushModalPushBtn} onPress={onExecute} disabled={!!actionLoading}>
            {actionLoading === 'push' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pushModalPushText}>Push</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
