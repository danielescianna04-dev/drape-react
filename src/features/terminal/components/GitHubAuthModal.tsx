import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';

interface Props {
  visible: boolean;
  repositoryUrl: string;
  onAuthenticate: (token: string) => void;
  onCancel: () => void;
}

export const GitHubAuthModal = ({ visible, repositoryUrl, onAuthenticate, onCancel }: Props) => {
  const [token, setToken] = useState('');

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Ionicons name="lock-closed" size={32} color="#FFA500" />
            <Text style={styles.title}>Repository Privata</Text>
          </View>

          <Text style={styles.message}>
            Questa repository richiede autenticazione.{'\n'}
            Inserisci un GitHub Personal Access Token.
          </Text>

          <Text style={styles.repoUrl}>{repositoryUrl}</Text>

          <TextInput
            style={styles.input}
            placeholder="ghp_xxxxxxxxxxxx"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              Linking.openURL('https://github.com/settings/tokens/new?scopes=repo&description=Drape%20IDE');
            }}
          >
            <Text style={styles.linkText}>Crea un token su GitHub →</Text>
          </TouchableOpacity>

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Annulla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.authButton, !token && styles.authButtonDisabled]}
              onPress={() => token && onAuthenticate(token)}
              disabled={!token}
            >
              <Text style={styles.authText}>Autentica</Text>
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
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(28, 28, 30, 0.98)',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.3)',
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
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
    marginBottom: 16,
  },
  repoUrl: {
    fontSize: 12,
    color: AppColors.primary,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  authTypeTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: AppColors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  linkButton: {
    marginBottom: 24,
  },
  linkText: {
    fontSize: 13,
    color: AppColors.primary,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '500',
  },
  authButton: {
    flex: 1,
    backgroundColor: AppColors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  authButtonDisabled: {
    opacity: 0.5,
  },
  authText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
