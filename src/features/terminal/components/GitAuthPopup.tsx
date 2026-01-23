import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  Image,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { AppColors } from '../../../shared/theme/colors';
import { useGitAuthStore } from '../../../core/github/gitAuthStore';
import { githubTokenService } from '../../../core/github/githubTokenService';
import { gitAccountService, GitAccount } from '../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';

WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || 'Ov23likDO7phRcPUBcrk';

type AuthStep = 'select-account' | 'options' | 'pat' | 'device-flow';

interface DeviceFlowData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export const GitAuthPopup = React.memo(() => {
  // Usa selettori specifici per evitare re-render non necessari
  const showAuthPopup = useGitAuthStore((state) => state.showAuthPopup);
  const currentRequest = useGitAuthStore((state) => state.currentRequest);
  const completeAuth = useGitAuthStore((state) => state.completeAuth);
  const cancelAuth = useGitAuthStore((state) => state.cancelAuth);
  const [step, setStep] = useState<AuthStep>('select-account');

  const [accounts, setAccounts] = useState<GitAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [pat, setPat] = useState('');
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const userId = useTerminalStore.getState().userId || 'anonymous';

  useEffect(() => {
    if (showAuthPopup) {
      loadAccounts();
      setStep('select-account');
      setPat('');
      setDeviceFlow(null);
      setIsLoading(false);
      setError(null);
      setCopied(false);
    }
  }, [showAuthPopup]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (step === 'device-flow' && deviceFlow) {
      console.log('🔄 Starting device flow polling, interval:', deviceFlow.interval, 'seconds');

      intervalId = setInterval(async () => {
        try {
          console.log('🔄 Polling for token...');
          const response = await axios.post(`${API_BASE_URL}/github/poll-device`, {
            device_code: deviceFlow.device_code,
            client_id: GITHUB_CLIENT_ID,
          });

          console.log('🔄 Poll response:', response.data);

          if (response.data.access_token) {
            console.log('✅ Token received!');
            if (intervalId) clearInterval(intervalId);
            handleAuthSuccess(response.data.access_token);
          } else if (response.data.error === 'authorization_pending') {
            console.log('⏳ Authorization pending, continuing to poll...');
            // Continue polling
          } else if (response.data.error) {
            console.log('❌ Error:', response.data.error);
            setError(`Errore: ${response.data.error_description || response.data.error}`);
            if (intervalId) clearInterval(intervalId);
            setIsLoading(false);
          }
        } catch (err: any) {
          console.error('❌ Poll error:', err.message);
          setError('Errore durante l\'autenticazione. Riprova.');
          if (intervalId) clearInterval(intervalId);
          setIsLoading(false);
        }
      }, (deviceFlow.interval || 5) * 1000);
    }

    return () => {
      if (intervalId) {
        console.log('🛑 Stopping polling');
        clearInterval(intervalId);
      }
    };
  }, [step, deviceFlow]);

  const loadAccounts = async () => {
    try {
      setLoadingAccounts(true);
      // Use getAllAccounts to get both local and shared accounts from Firebase
      const accs = await gitAccountService.getAllAccounts(userId);
      setAccounts(accs);
      console.log('🔐 [GitAuthPopup] Loaded accounts (local + shared):', accs.length);

      // If no accounts, go directly to options
      if (accs.length === 0) {
        setStep('options');
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      setStep('options');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSelectAccount = async (account: GitAccount) => {
    try {
      setIsLoading(true);
      // Use gitAccountService to get token
      const token = await gitAccountService.getToken(account, userId);
      if (token) {
        completeAuth(token);
      } else {
        setError('Token non trovato. Aggiungi un nuovo account.');
        setStep('options');
      }
    } catch (error) {
      setError('Errore nel recupero del token');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = async (token: string) => {
    try {
      console.log('✅ [handleAuthSuccess] Token received, validating...');
      // Save the token
      const validation = await githubTokenService.validateToken(token);
      console.log('✅ [handleAuthSuccess] Validation result:', validation);
      if (validation.valid && validation.username) {
        console.log('✅ [handleAuthSuccess] Saving token for user:', validation.username);
        // Save to githubTokenService (for auth flow)
        await githubTokenService.saveToken(validation.username, token, userId);
        console.log('✅ [handleAuthSuccess] Token saved to githubTokenService');

        // ALSO save to gitAccountService (for Settings screen)
        try {
          await gitAccountService.saveAccount('github', token, userId);
          console.log('✅ [handleAuthSuccess] Token saved to gitAccountService (for Settings)');
        } catch (syncErr) {
          console.warn('⚠️ [handleAuthSuccess] Could not sync to gitAccountService:', syncErr);
        }
      }
      console.log('✅ [handleAuthSuccess] Calling completeAuth...');
      completeAuth(token);
      console.log('✅ [handleAuthSuccess] completeAuth called - popup should close now');
    } catch (error) {
      console.error('❌ [handleAuthSuccess] Error:', error);
      setError('Errore nel salvataggio del token');
    }
  };

  const handleWebBrowserAuth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'drape',
        path: 'auth/callback',
      });

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');

        if (code) {
          const response = await axios.post(`${API_BASE_URL}/github/exchange-code`, {
            code,
            redirect_uri: redirectUri,
          });

          if (response.data.access_token) {
            await handleAuthSuccess(response.data.access_token);
          } else {
            throw new Error('Nessun token nella risposta');
          }
        }
      } else if (result.type === 'cancel') {
        setError('Autenticazione annullata');
      }
    } catch (err: any) {
      setError(`Autenticazione fallita: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartDeviceFlow = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/github/device-flow`, {
        client_id: GITHUB_CLIENT_ID,
        scope: 'repo,user',
      });

      setDeviceFlow(response.data);
      setStep('device-flow');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message;
      setError(`Errore: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePatSubmit = async () => {
    if (pat.trim()) {
      setIsLoading(true);
      try {
        const validation = await githubTokenService.validateToken(pat.trim());
        if (validation.valid) {
          await handleAuthSuccess(pat.trim());
        } else {
          setError('Token non valido');
        }
      } catch (error) {
        setError('Errore nella verifica del token');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const renderSelectAccount = () => (
    <>
      <Text style={styles.title}>Autenticazione Git</Text>
      <Text style={styles.subtitle}>
        {currentRequest?.reason || 'Seleziona un account o aggiungine uno nuovo'}
      </Text>

      {currentRequest?.repositoryUrl && (
        <View style={styles.repoUrlContainer}>
          <Ionicons name="git-branch" size={14} color="rgba(255,255,255,0.4)" />
          <Text style={styles.repoUrlText} numberOfLines={1}>
            {currentRequest.repositoryUrl.replace('https://github.com/', '')}
          </Text>
        </View>
      )}

      {loadingAccounts ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={AppColors.primary} />
        </View>
      ) : (
        <>
          {accounts.map((account) => {
            const isShared = account.id.startsWith('shared-');
            return (
              <TouchableOpacity
                key={account.id}
                style={styles.accountOption}
                onPress={() => handleSelectAccount(account)}
                disabled={isLoading}
              >
                {account.avatarUrl ? (
                  <Image source={{ uri: account.avatarUrl }} style={styles.accountAvatar} />
                ) : (
                  <View style={[styles.accountAvatar, styles.avatarPlaceholder]}>
                    <Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" />
                  </View>
                )}
                <View style={styles.accountOptionInfo}>
                  <Text style={styles.accountOptionName}>{account.username}</Text>
                  <Text style={styles.accountOptionMeta}>
                    {account.provider === 'github' ? 'GitHub' : account.provider}
                    {isShared && ' • Condiviso'}
                  </Text>
                </View>
                {isLoading ? (
                  <ActivityIndicator size="small" color={AppColors.primary} />
                ) : isShared ? (
                  <Ionicons name="people" size={18} color="rgba(255,255,255,0.3)" />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={styles.addAccountOption}
            onPress={() => setStep('options')}
          >
            <View style={styles.addAccountIcon}>
              <Ionicons name="add" size={20} color={AppColors.primary} />
            </View>
            <Text style={styles.addAccountText}>Aggiungi nuovo account</Text>
          </TouchableOpacity>
        </>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  // On mobile, use Device Flow; on web/PC use WebBrowser OAuth
  const handleGitHubAuth = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      handleStartDeviceFlow();
    } else {
      handleWebBrowserAuth();
    }
  };

  const renderOptions = () => (
    <>
      {accounts.length > 0 && (
        <TouchableOpacity onPress={() => setStep('select-account')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.6)" />
          <Text style={styles.backButtonText}>Indietro</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.title}>Aggiungi Account</Text>
      <Text style={styles.subtitle}>Scegli come autenticarti con GitHub</Text>

      <TouchableOpacity
        style={styles.optionButton}
        onPress={handleGitHubAuth}
        disabled={isLoading}
      >
        <Ionicons name="logo-github" size={24} color="#FFFFFF" />
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionButtonText}>Accedi con GitHub</Text>
          {(Platform.OS === 'ios' || Platform.OS === 'android') && (
            <Text style={styles.optionSubtext}>Via Device Flow</Text>
          )}
        </View>
        {isLoading && <ActivityIndicator color="#FFFFFF" />}
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionButton} onPress={() => setStep('pat')}>
        <Ionicons name="key-outline" size={24} color="#FFFFFF" />
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionButtonText}>Usa Personal Access Token</Text>
          <Text style={styles.optionSubtext}>Genera un token da GitHub</Text>
        </View>
      </TouchableOpacity>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  const renderPatInput = () => (
    <>
      <TouchableOpacity onPress={() => setStep('options')} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.6)" />
        <Text style={styles.backButtonText}>Indietro</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Personal Access Token</Text>
      <Text style={styles.subtitle}>
        Genera un token dalle impostazioni di GitHub e incollalo qui.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
        placeholderTextColor="rgba(255,255,255,0.3)"
        value={pat}
        onChangeText={setPat}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={[styles.submitButton, (!pat.trim() || isLoading) && styles.submitButtonDisabled]}
        onPress={handlePatSubmit}
        disabled={!pat.trim() || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitButtonText}>Verifica e Salva</Text>
        )}
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  const renderDeviceFlow = () => (
    <>
      <TouchableOpacity onPress={() => setStep('options')} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>
      <Text style={styles.title}>Autorizza su GitHub</Text>
      <Text style={styles.subtitle}>
        Inserisci questo codice sul sito GitHub per autorizzare l'accesso.
      </Text>

      <View style={styles.deviceCodeContainer}>
        <Text style={styles.deviceCode}>{deviceFlow?.user_code}</Text>
        <TouchableOpacity
          style={[styles.copyButton, copied && styles.copyButtonSuccess]}
          onPress={async () => {
            await Clipboard.setStringAsync(deviceFlow?.user_code || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
          }}
        >
          <Ionicons
            name={copied ? "checkmark-circle" : "copy-outline"}
            size={20}
            color={copied ? "#4CAF50" : "#FFFFFF"}
          />
          <Text style={[styles.copyButtonText, copied && styles.copyButtonTextSuccess]}>
            {copied ? 'Copiato!' : 'Copia Codice'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => deviceFlow?.verification_uri && Linking.openURL(deviceFlow.verification_uri)}
      >
        <Ionicons name="open-outline" size={16} color="#fff" />
        <Text style={styles.linkText}>Apri GitHub</Text>
      </TouchableOpacity>

      <View style={styles.pollingIndicator}>
        <ActivityIndicator color={AppColors.primary} />
        <Text style={styles.pollingText}>In attesa di autorizzazione...</Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  return (
    <Modal visible={showAuthPopup} transparent animationType="fade" onRequestClose={cancelAuth}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <TouchableOpacity onPress={cancelAuth} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>

          {step === 'select-account' && renderSelectAccount()}
          {step === 'options' && renderOptions()}
          {step === 'pat' && renderPatInput()}
          {step === 'device-flow' && renderDeviceFlow()}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#121214',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  repoUrlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    marginBottom: 20,
  },
  repoUrlText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  // Account selection
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    marginBottom: 10,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountOptionInfo: {
    flex: 1,
  },
  accountOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  accountOptionMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  addAccountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${AppColors.primary}40`,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addAccountIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${AppColors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addAccountText: {
    fontSize: 15,
    fontWeight: '500',
    color: AppColors.primary,
  },
  // Options
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 68,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  optionSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 2,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  // PAT input
  input: {
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  submitButton: {
    height: 50,
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Device flow
  deviceCodeContainer: {
    paddingVertical: 20,
    paddingHorizontal: 30,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  deviceCode: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
  },
  copyButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  copyButtonSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  copyButtonTextSuccess: {
    color: '#4CAF50',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    marginBottom: 20,
  },
  linkText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pollingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pollingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  errorText: {
    color: '#ff4d4d',
    textAlign: 'center',
    marginTop: 12,
    fontSize: 13,
  },
});
