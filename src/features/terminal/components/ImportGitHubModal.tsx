import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import * as Clipboard from 'expo-clipboard';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImport: (url: string) => void;
  isLoading?: boolean;
}

export const ImportGitHubModal = ({ visible, onClose, onImport, isLoading }: Props) => {
  const [repoUrl, setRepoUrl] = useState('');

  useEffect(() => {
    if (visible) {
      checkClipboard();
    }
  }, [visible]);

  const checkClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (text && text.includes('github.com')) {
      setRepoUrl(text);
    }
  };

  const handleImport = () => {
    if (repoUrl.trim()) {
      onImport(repoUrl.trim());
      setRepoUrl('');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Ionicons name="logo-github" size={24} color={AppColors.primary} />
            <Text style={styles.title}>Import from GitHub</Text>
          </View>

          <Text style={styles.label}>GitHub URL</Text>
          <TextInput
            style={styles.input}
            value={repoUrl}
            onChangeText={setRepoUrl}
            placeholder="https://github.com/username/repository"
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <View style={styles.buttons}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={onClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.importButton, (!repoUrl.trim() || isLoading) && styles.importButtonDisabled]} 
              onPress={handleImport}
              disabled={!repoUrl.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.importText}>Import</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.2)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  cancelText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
  importButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
});
