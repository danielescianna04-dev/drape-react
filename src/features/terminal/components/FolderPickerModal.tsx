import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../../shared/theme/colors';
import { useChatStore } from '../../../core/terminal/chatStore';
import { ChatFolder } from '../../../shared/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectFolder: (folderId: string) => void;
  currentFolderId?: string;
}

export const FolderPickerModal = ({ visible, onClose, onSelectFolder, currentFolderId }: Props) => {
  const { t } = useTranslation(['terminal']);
  const { chatFolders, addFolder } = useChatStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    addFolder(name);
    setNewFolderName('');
    setIsCreating(false);
    // Select the newly created folder (it'll be the last one added)
    const folders = useChatStore.getState().chatFolders;
    const created = folders[folders.length - 1];
    if (created) onSelectFolder(created.id);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.container}>
            <Text style={styles.title}>{t('chat.moveToFolder')}</Text>

            {chatFolders.map((folder) => (
              <TouchableOpacity
                key={folder.id}
                style={[styles.folderItem, currentFolderId === folder.id && styles.folderItemActive]}
                onPress={() => {
                  onSelectFolder(folder.id);
                  onClose();
                }}
              >
                <Ionicons name="folder" size={18} color={folder.color || AppColors.primary} />
                <Text style={styles.folderName}>{folder.name}</Text>
                {currentFolderId === folder.id && (
                  <Ionicons name="checkmark" size={16} color={AppColors.primary} />
                )}
              </TouchableOpacity>
            ))}

            {isCreating ? (
              <View style={styles.createRow}>
                <TextInput
                  style={styles.createInput}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder={t('chat.folderName')}
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  autoFocus
                  onSubmitEditing={handleCreateFolder}
                />
                <TouchableOpacity onPress={handleCreateFolder} style={styles.createAction}>
                  <Ionicons name="checkmark" size={18} color={AppColors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setIsCreating(false); setNewFolderName(''); }} style={styles.createAction}>
                  <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.createButton} onPress={() => setIsCreating(true)}>
                <Ionicons name="add-circle-outline" size={18} color={AppColors.primary} />
                <Text style={styles.createButtonText}>{t('chat.createFolder')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: 260,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  folderItemActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  folderName: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  createButtonText: {
    fontSize: 14,
    color: AppColors.primary,
    fontWeight: '500',
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  createInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.primary,
    paddingBottom: 4,
  },
  createAction: {
    padding: 4,
  },
});
