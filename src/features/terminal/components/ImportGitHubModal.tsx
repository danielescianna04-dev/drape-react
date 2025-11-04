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

export const ImportGitHubModal = ({ visible, onClose, onImport, isLoading = false }: Props) => {
  const [repoUrl, setRepoUrl] = useState('');

  useEffect(() => {
    if (visible) {
      checkClipboard();
    }
  }, [visible]);

  const checkClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && typeof text === 'string' && text.includes('github.com')) {
        setRepoUrl(text);
      }
    } catch (error) {
      console.log('Clipboard error:', error);
    }
  };

  const handleImport = () => {
    const url = String(repoUrl || '').trim();
    if (url) {
      onImport(url);
      setRepoUrl('');
    }
  };

  const isValidUrl = String(repoUrl || '').trim().length > 0;

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
            value={String(repoUrl || '')}
            onChangeText={(text) => setRepoUrl(String(text || ''))}
            placeholder="https://github.com/username/repository"
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
            keyboardAppearance="dark"
          />

          <View style={styles.buttons}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={onClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.importButton, (!isValidUrl || isLoading) && styles.importButtonDisabled]} 
              onPress={handleImport}
              disabled={!isValidUrl || isLoading}
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
