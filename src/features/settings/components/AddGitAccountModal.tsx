import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import {
  GitProvider,
  GIT_PROVIDERS,
  gitAccountService,
} from '../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAccountAdded: () => void;
}

type Step = 'select-provider' | 'enter-credentials';

export const AddGitAccountModal = ({ visible, onClose, onAccountAdded }: Props) => {
  const [step, setStep] = useState<Step>('select-provider');
  const [selectedProvider, setSelectedProvider] = useState<GitProvider | null>(null);
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const { userId } = useTerminalStore();

  const handleSelectProvider = (provider: GitProvider) => {
    setSelectedProvider(provider);
    setStep('enter-credentials');
  };

  const handleBack = () => {
    setStep('select-provider');
    setSelectedProvider(null);
    setToken('');
    setServerUrl('');
  };

  const handleClose = () => {
    setStep('select-provider');
    setSelectedProvider(null);
    setToken('');
    setServerUrl('');
    onClose();
  };

  const handleLogin = async () => {
    if (!selectedProvider || !token.trim()) return;

    const providerConfig = GIT_PROVIDERS.find(p => p.id === selectedProvider);
    if (providerConfig?.requiresServerUrl && !serverUrl.trim()) {
      Alert.alert('Errore', 'Inserisci l\'URL del server');
      return;
    }

    setLoading(true);
    try {
      await gitAccountService.saveAccount(
        selectedProvider,
        token.trim(),
        userId || 'anonymous',
        providerConfig?.requiresServerUrl ? serverUrl.trim() : undefined
      );

      Alert.alert('Successo', 'Account collegato con successo!');
      onAccountAdded();
      handleClose();
    } catch (error: any) {
      console.error('Error adding account:', error);
      Alert.alert('Errore', 'Token non valido o errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const getProviderIcon = (provider: GitProvider): string => {
    const config = GIT_PROVIDERS.find(p => p.id === provider);
    return config?.icon || 'git-branch';
  };

  const getProviderColor = (provider: GitProvider): string => {
    const config = GIT_PROVIDERS.find(p => p.id === provider);
    return config?.color || '#fff';
  };

  const renderProviderSelection = () => (
    <ScrollView style={styles.providerGrid} contentContainerStyle={styles.providerGridContent}>
      {GIT_PROVIDERS.map((provider) => (
        <TouchableOpacity
          key={provider.id}
          style={styles.providerItem}
          onPress={() => handleSelectProvider(provider.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.providerIcon, { backgroundColor: `${provider.color}15` }]}>
            <Ionicons
              name={provider.icon as any}
              size={28}
              color={provider.color}
            />
          </View>
          <Text style={styles.providerName}>{provider.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderCredentialsForm = () => {
    const providerConfig = GIT_PROVIDERS.find(p => p.id === selectedProvider);

    return (
      <View style={styles.credentialsForm}>
        <View style={styles.selectedProviderHeader}>
          <View style={[styles.providerIconSmall, { backgroundColor: `${getProviderColor(selectedProvider!)}15` }]}>
            <Ionicons
              name={getProviderIcon(selectedProvider!) as any}
              size={20}
              color={getProviderColor(selectedProvider!)}
            />
          </View>
          <Text style={styles.selectedProviderName}>{providerConfig?.name}</Text>
        </View>

        {providerConfig?.requiresServerUrl && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Server URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://gitlab.mycompany.com"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Personal Access Token</Text>
          <TextInput
            style={styles.input}
            placeholder="ghp_xxxxxxxxxxxx"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.inputHint}>
            {selectedProvider === 'github' || selectedProvider === 'github-enterprise'
              ? 'Crea un token su GitHub > Settings > Developer settings > Personal access tokens'
              : selectedProvider === 'gitlab' || selectedProvider === 'gitlab-server'
              ? 'Crea un token su GitLab > Preferences > Access Tokens'
              : selectedProvider === 'bitbucket' || selectedProvider === 'bitbucket-server'
              ? 'Crea un App Password su Bitbucket > Settings > App passwords'
              : 'Crea un access token nelle impostazioni del tuo account'}
          </Text>
        </View>

        <View style={styles.formButtons}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleBack}
          >
            <Text style={styles.cancelBtnText}>Indietro</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginBtn, (!token.trim() || loading) && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={!token.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Collega</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 'select-provider' ? 'Aggiungi Account' : 'Autenticazione'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {step === 'select-provider' ? renderProviderSelection() : renderCredentialsForm()}
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
    backgroundColor: '#1a1a1c',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  closeBtn: {
    padding: 4,
  },
  providerGrid: {
    maxHeight: 350,
  },
  providerGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  providerItem: {
    width: '30%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
  },
  providerIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  providerName: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  credentialsForm: {
    padding: 20,
  },
  selectedProviderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  providerIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedProviderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inputHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 8,
    lineHeight: 16,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  loginBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
  },
  loginBtnDisabled: {
    opacity: 0.5,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
