import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export const NewProjectModal = ({ visible, onClose, onConfirm }: Props) => {
  const [projectName, setProjectName] = useState('');

  const handleConfirm = () => {
    if (projectName.trim()) {
      onConfirm(projectName.trim());
      setProjectName('');
      onClose();
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
            <Ionicons name="folder-outline" size={24} color={AppColors.primary} />
            <Text style={styles.title}>Nuovo Progetto</Text>
          </View>

          <TextInput
            style={styles.input}
            value={projectName}
            onChangeText={setProjectName}
            placeholder="Nome del progetto"
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            autoFocus
          />

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.confirmButton, !projectName.trim() && styles.confirmButtonDisabled]} 
              onPress={handleConfirm}
              disabled={!projectName.trim()}
            >
              <Text style={styles.confirmText}>Crea</Text>
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
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
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
  confirmButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
});
