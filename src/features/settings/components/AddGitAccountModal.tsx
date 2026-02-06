import React, { useState, useEffect } from 'react';
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
  Linking,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { AppColors } from '../../../shared/theme/colors';
import {
  GitProvider,
  GIT_PROVIDERS,
  gitAccountService,
} from '../../../core/git/gitAccountService';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { config } from '../../../config/config';

WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL = config.apiUrl;
const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || 'Ov23likDO7phRcPUBcrk';

// Providers that support OAuth login (only GitHub for now)
const OAUTH_PROVIDERS = ['github'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onAccountAdded: () => void;
}

type Step = 'select-provider' | 'auth-method' | 'enter-credentials' | 'device-flow';

interface DeviceFlowData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export const AddGitAccountModal = ({ visible, onClose, onAccountAdded }: Props) => {
  const { t } = useTranslation(['settings', 'common']);
  const [step, setStep] = useState<Step>('select-provider');
  const [selectedProvider, setSelectedProvider] = useState<GitProvider | null>(null);
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { userId } = useTerminalStore();

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setStep('select-provider');
      setSelectedProvider(null);
      setUsername('');
      setToken('');
      setServerUrl('');
      setDeviceFlow(null);
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  // Poll for device flow completion
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (step === 'device-flow' && deviceFlow && selectedProvider) {
      intervalId = setInterval(async () => {
        try {
          let pollEndpoint = '';
          let pollBody: any = {};

          if (selectedProvider === 'github') {
            pollEndpoint = `${API_BASE_URL}/github/poll-device`;
            pollBody = { device_code: deviceFlow.device_code, client_id: GITHUB_CLIENT_ID };
          } else if (selectedProvider === 'gitlab') {
            pollEndpoint = `${API_BASE_URL}/oauth/gitlab/poll-device`;
            pollBody = { device_code: deviceFlow.device_code };
          } else if (selectedProvider === 'bitbucket') {
            pollEndpoint = `${API_BASE_URL}/oauth/bitbucket/poll-device`;
            pollBody = { device_code: deviceFlow.device_code };
          }

          const response = await axios.post(pollEndpoint, pollBody);

          if (response.data.access_token) {
            if (intervalId) clearInterval(intervalId);
            handleOAuthSuccess(response.data.access_token);
          } else if (response.data.error === 'authorization_pending' || response.data.error === 'slow_down') {
            // Expected, continue polling
          } else if (response.data.error) {
            setError(`Errore: ${response.data.error_description || response.data.error}`);
            if (intervalId) clearInterval(intervalId);
            setLoading(false);
          }
        } catch (err: any) {
          console.error('Poll error:', err);
          // Don't show error for network issues during polling
        }
      }, (deviceFlow.interval || 5) * 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [step, deviceFlow, selectedProvider]);

  const handleOAuthSuccess = async (accessToken: string) => {
    if (!selectedProvider) return;

    setLoading(true);
    try {
      await gitAccountService.saveAccount(
        selectedProvider,
        accessToken,
        userId || 'anonymous'
      );

      Alert.alert(t('common:success'), t('settings:gitAccounts.accountConnected'));
      onAccountAdded();
      handleClose();
    } catch (error: any) {
      console.error('Error saving OAuth account:', error);
      setError('Impossibile salvare l\'account');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProvider = (provider: GitProvider) => {
    setSelectedProvider(provider);

    // For cloud providers that support OAuth, show auth method selection
    if (OAUTH_PROVIDERS.includes(provider)) {
      setStep('auth-method');
    } else {
      // For self-hosted providers, go directly to credentials
      setStep('enter-credentials');
    }
  };

  const handleStartOAuth = async () => {
    if (!selectedProvider) return;

    setLoading(true);
    setError(null);

    try {
      if (selectedProvider === 'github') {
        await startGitHubDeviceFlow();
      } else if (selectedProvider === 'gitlab') {
        await startGitLabOAuth();
      } else if (selectedProvider === 'bitbucket') {
        await startBitbucketOAuth();
      }
    } catch (err: any) {
      console.error('OAuth error:', err);
      setError(`Autenticazione fallita: ${err.message}`);
      setLoading(false);
    }
  };

  const startGitHubDeviceFlow = async () => {
    console.log('Starting GitHub Device Flow...');

    const response = await axios.post(`${API_BASE_URL}/github/device-flow`, {
      client_id: GITHUB_CLIENT_ID,
      scope: 'repo,user',
    });

    setDeviceFlow(response.data);
    setStep('device-flow');
    setLoading(false);
  };

  const startGitLabOAuth = async () => {
    // GitLab supports standard OAuth flow via browser
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'drape', path: 'auth/callback' });

    const response = await axios.post(`${API_BASE_URL}/oauth/gitlab/authorize`, {
      redirect_uri: redirectUri,
    });

    if (response.data.auth_url) {
      const result = await WebBrowser.openAuthSessionAsync(response.data.auth_url, redirectUri);

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');

        if (code) {
          const tokenResponse = await axios.post(`${API_BASE_URL}/oauth/gitlab/callback`, {
            code,
            redirect_uri: redirectUri,
          });

          if (tokenResponse.data.access_token) {
            await handleOAuthSuccess(tokenResponse.data.access_token);
          }
        }
      }
    }
    setLoading(false);
  };

  const startBitbucketOAuth = async () => {
    // Bitbucket supports standard OAuth flow via browser
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'drape', path: 'auth/callback' });

    const response = await axios.post(`${API_BASE_URL}/oauth/bitbucket/authorize`, {
      redirect_uri: redirectUri,
    });

    if (response.data.auth_url) {
      const result = await WebBrowser.openAuthSessionAsync(response.data.auth_url, redirectUri);

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');

        if (code) {
          const tokenResponse = await axios.post(`${API_BASE_URL}/oauth/bitbucket/callback`, {
            code,
            redirect_uri: redirectUri,
          });

          if (tokenResponse.data.access_token) {
            await handleOAuthSuccess(tokenResponse.data.access_token);
          }
        }
      }
    }
    setLoading(false);
  };

  const handleBack = () => {
    if (step === 'device-flow') {
      setStep('auth-method');
      setDeviceFlow(null);
    } else if (step === 'enter-credentials' || step === 'auth-method') {
      setStep('select-provider');
      setSelectedProvider(null);
    }
    setUsername('');
    setToken('');
    setServerUrl('');
    setError(null);
  };

  const handleClose = () => {
    setStep('select-provider');
    setSelectedProvider(null);
    setUsername('');
    setToken('');
    setServerUrl('');
    setDeviceFlow(null);
    setError(null);
    onClose();
  };

  const handleLogin = async () => {
    if (!selectedProvider || !token.trim()) return;

    const providerConfig = GIT_PROVIDERS.find(p => p.id === selectedProvider);
    if (providerConfig?.requiresServerUrl && !serverUrl.trim()) {
      Alert.alert(t('common:error'), t('settings:gitAccounts.enterServerUrl'));
      return;
    }
    if (providerConfig?.requiresUsername && !username.trim()) {
      Alert.alert(t('common:error'), t('settings:gitAccounts.enterUsername'));
      return;
    }

    setLoading(true);
    try {
      // For Bitbucket, combine username:password for Basic Auth
      const finalToken = providerConfig?.requiresUsername
        ? `${username.trim()}:${token.trim()}`
        : token.trim();

      await gitAccountService.saveAccount(
        selectedProvider,
        finalToken,
        userId || 'anonymous',
        providerConfig?.requiresServerUrl ? serverUrl.trim() : undefined
      );

      Alert.alert(t('common:success'), t('settings:gitAccounts.accountConnected'));
      onAccountAdded();
      handleClose();
    } catch (error: any) {
      console.error('Error adding account:', error);
      Alert.alert(t('common:error'), t('settings:gitAccounts.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenVerification = () => {
    if (deviceFlow?.verification_uri) {
      Linking.openURL(deviceFlow.verification_uri);
    }
  };

  const handleCopyCode = () => {
    if (deviceFlow?.user_code) {
      Clipboard.setStringAsync(deviceFlow.user_code);
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

  const getProviderDisplayName = (provider: GitProvider): string => {
    const config = GIT_PROVIDERS.find(p => p.id === provider);
    return config?.name || provider;
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

  const renderAuthMethodSelection = () => {
    const providerConfig = GIT_PROVIDERS.find(p => p.id === selectedProvider);

    return (
      <View style={styles.authMethodContainer}>
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

        <Text style={styles.authMethodTitle}>Scegli come accedere</Text>

        <TouchableOpacity
          style={styles.authMethodButton}
          onPress={handleStartOAuth}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Ionicons name="globe-outline" size={24} color="#fff" />
          <View style={styles.authMethodTextContainer}>
            <Text style={styles.authMethodButtonText}>
              Accedi con {getProviderDisplayName(selectedProvider!)}
            </Text>
            <Text style={styles.authMethodSubtext}>
              {Platform.OS === 'ios' || Platform.OS === 'android' ? 'Via Device Flow' : 'Apre il browser'}
            </Text>
          </View>
          {loading && <ActivityIndicator color="#fff" />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.authMethodButton}
          onPress={() => setStep('enter-credentials')}
          activeOpacity={0.7}
        >
          <Ionicons name="key-outline" size={24} color="#fff" />
          <View style={styles.authMethodTextContainer}>
            <Text style={styles.authMethodButtonText}>Usa Token Personale</Text>
            <Text style={styles.authMethodSubtext}>Inserisci manualmente un PAT</Text>
          </View>
        </TouchableOpacity>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity style={styles.backButtonSmall} onPress={handleBack}>
          <Ionicons name="arrow-back" size={16} color="rgba(255,255,255,0.5)" />
          <Text style={styles.backButtonSmallText}>Indietro</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderDeviceFlow = () => (
    <View style={styles.deviceFlowContainer}>
      <TouchableOpacity onPress={handleBack} style={styles.backButtonTop}>
        <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>

      <Text style={styles.deviceFlowTitle}>Autorizza su {getProviderDisplayName(selectedProvider!)}</Text>
      <Text style={styles.deviceFlowSubtitle}>
        Copia il codice e incollalo nella pagina che si aprirà
      </Text>

      <View style={styles.deviceCodeContainer}>
        <Text style={styles.deviceCode}>{deviceFlow?.user_code}</Text>
        <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode}>
          <Ionicons name="copy-outline" size={18} color="#fff" />
          <Text style={styles.copyButtonText}>Copia</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.openBrowserButton} onPress={handleOpenVerification}>
        <Ionicons name="open-outline" size={18} color="#fff" />
        <Text style={styles.openBrowserButtonText}>Apri {getProviderDisplayName(selectedProvider!)}</Text>
      </TouchableOpacity>

      <View style={styles.pollingIndicator}>
        <ActivityIndicator color={AppColors.primary} size="small" />
        <Text style={styles.pollingText}>In attesa di autorizzazione...</Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
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
            <Text style={styles.inputLabel}>{t('settings:gitAccounts.serverUrl')}</Text>
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

        {providerConfig?.requiresUsername && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('settings:gitAccounts.username')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('settings:gitAccounts.usernamePlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            {providerConfig?.requiresUsername ? t('settings:gitAccounts.appPassword') : t('settings:gitAccounts.personalAccessToken')}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={providerConfig?.requiresUsername ? t('settings:gitAccounts.appPasswordPlaceholder') : 'ghp_xxxxxxxxxxxx'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.inputHint}>
            {selectedProvider === 'github' || selectedProvider === 'github-enterprise'
              ? t('settings:gitAccounts.tokenHints.github')
              : selectedProvider === 'gitlab' || selectedProvider === 'gitlab-server'
                ? t('settings:gitAccounts.tokenHints.gitlab')
                : selectedProvider === 'bitbucket' || selectedProvider === 'bitbucket-server'
                  ? t('settings:gitAccounts.tokenHints.bitbucket')
                  : t('settings:gitAccounts.tokenHints.generic')}
          </Text>
        </View>

        <View style={styles.formButtons}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleBack}
          >
            <Text style={styles.cancelBtnText}>{t('settings:gitAccounts.back')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginBtn, (!token.trim() || loading || (providerConfig?.requiresUsername && !username.trim())) && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={!token.trim() || loading || (providerConfig?.requiresUsername && !username.trim())}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>{t('settings:gitAccounts.connect')}</Text>
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
      <BlurView intensity={50} tint="dark" style={styles.blurOverlay}>
        <View style={styles.overlay}>
          <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 'select-provider' ? t('settings:gitAccounts.addAccountTitle') :
               step === 'auth-method' ? 'Metodo di Accesso' :
               step === 'device-flow' ? 'Autorizzazione' :
               t('settings:gitAccounts.authentication')}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <View style={styles.closeBtnInner}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.contentWrapper}>
            {step === 'select-provider' && renderProviderSelection()}
            {step === 'auth-method' && renderAuthMethodSelection()}
            {step === 'device-flow' && renderDeviceFlow()}
            {step === 'enter-credentials' && renderCredentialsForm()}
          </View>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  blurOverlay: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(28,28,30,0.85)',
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
    backgroundColor: 'transparent',
    borderRadius: 16,
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
  // Auth Method Selection
  authMethodContainer: {
    padding: 20,
    paddingTop: 0,
  },
  authMethodTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 16,
    textAlign: 'center',
  },
  authMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  authMethodTextContainer: {
    flex: 1,
  },
  authMethodButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  authMethodSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  backButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
  },
  backButtonSmallText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  // Device Flow
  deviceFlowContainer: {
    padding: 20,
    paddingTop: 0,
  },
  backButtonTop: {
    alignSelf: 'flex-start',
    padding: 4,
    marginBottom: 12,
  },
  deviceFlowTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  deviceFlowSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 20,
  },
  deviceCodeContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  deviceCode: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 4,
    marginBottom: 12,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  openBrowserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: AppColors.primary,
    borderRadius: 14,
    marginBottom: 20,
  },
  openBrowserButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  pollingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  pollingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  // Credentials Form
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
