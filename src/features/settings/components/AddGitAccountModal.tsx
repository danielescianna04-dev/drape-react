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
import { BlurView } from 'expo-blur';
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
    <ScrollView
      style={styles.providerGrid}
      contentContainerStyle={styles.providerGridContent}
      showsVerticalScrollIndicator={false}
    >
      {GIT_PROVIDERS.map((provider) => (
        <TouchableOpacity
          key={provider.id}
          style={styles.providerItem}
          onPress={() => handleSelectProvider(provider.id)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={provider.icon as any}
            size={32}
            color={provider.color === '#24292e' ? '#fff' : provider.color}
            style={{ marginBottom: 10 }}
          />
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
          <View style={[styles.providerIconSmall, { backgroundColor: `${getProviderColor(selectedProvider!)}20` }]}>
            <Ionicons
              name={getProviderIcon(selectedProvider!) as any}
              size={18}
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
        <BlurView intensity={40} tint="dark" style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 'select-provider' ? 'Aggiungi Account' : 'Autenticazione'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <View style={styles.closeBtnInner}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.contentWrapper}>
            {step === 'select-provider' ? renderProviderSelection() : renderCredentialsForm()}
          </View>
        </BlurView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(28,28,30,0.7)',
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
  },
  contentWrapper: {
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
  },
  closeBtn: {
    padding: 2,
  },
  closeBtnInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerGrid: {
    maxHeight: 340,
  },
  providerGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingBottom: 12,
    justifyContent: 'center',
  },
  providerItem: {
    width: '29%',
    margin: '1.5%',
    aspectRatio: 0.88,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  providerName: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  credentialsForm: {
    padding: 20,
    paddingTop: 0,
  },
  selectedProviderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  providerIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedProviderName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 8,
    lineHeight: 16,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    paddingBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  loginBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  loginBtnDisabled: {
    opacity: 0.3,
  },
  loginBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
});
