import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, Linking, ActivityIndicator, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../../shared/theme/colors';
import axios from 'axios';
import { config } from '../../../config/config';

WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL = config.apiUrl;
const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || 'Ov23likDO7phRcPUBcrk';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAuthenticated: (token: string) => void;
  repositoryUrl?: string; // Optional repository name/URL
}

type AuthStep = 'options' | 'pat' | 'device-flow';

interface DeviceFlowData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export const GitHubAuthModal = ({ visible, onClose, onAuthenticated, repositoryUrl }: Props) => {
  const [step, setStep] = useState<AuthStep>('options');
  const [pat, setPat] = useState('');
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset state when modal becomes visible
    if (visible) {
      setStep('options');
      setPat('');
      setDeviceFlow(null);
      setIsLoading(false);
      setError(null);
    }
  }, [visible]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (step === 'device-flow' && deviceFlow) {
      intervalId = setInterval(async () => {
        try {
          const response = await axios.post(`${API_BASE_URL}/github/poll-device`, {
            device_code: deviceFlow.device_code,
            client_id: GITHUB_CLIENT_ID,
          });

          if (response.data.access_token) {
            if (intervalId) clearInterval(intervalId);
            onAuthenticated(response.data.access_token);
          } else if (response.data.error === 'authorization_pending') {
            // This is expected, continue polling
          } else if (response.data.error) {
            setError(`Error: ${response.data.error_description}`);
            if (intervalId) clearInterval(intervalId);
            setIsLoading(false);
          }
        } catch (err) {
          setError('Failed to poll for authentication. Please try again.');
          if (intervalId) clearInterval(intervalId);
          setIsLoading(false);
        }
      }, deviceFlow.interval * 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [step, deviceFlow, onAuthenticated]);

  const handleWebBrowserAuth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🌐 Starting GitHub Web Browser OAuth...');

      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'drape',
        path: 'auth/callback'
      });

      console.log('Redirect URI:', redirectUri);

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user`;

      console.log('Opening browser with URL:', authUrl);

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      console.log('Browser result:', result);

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');

        if (code) {
          console.log('✅ Got authorization code, exchanging for token...');

          const response = await axios.post(`${API_BASE_URL}/github/exchange-code`, {
            code,
            redirect_uri: redirectUri,
          });

          if (response.data.access_token) {
            console.log('✅ Token received successfully');
            onAuthenticated(response.data.access_token);
          } else {
            throw new Error('No access token in response');
          }
        } else {
          throw new Error('No code in callback URL');
        }
      } else if (result.type === 'cancel') {
        setError('Authentication cancelled');
      }
    } catch (err: any) {
      console.error('❌ Web Browser OAuth error:', err);
      setError(`Authentication failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartDeviceFlow = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔐 Starting GitHub device flow...');
      console.log('API URL:', API_BASE_URL);
      console.log('Client ID:', GITHUB_CLIENT_ID);

      const response = await axios.post(`${API_BASE_URL}/github/device-flow`, {
        client_id: GITHUB_CLIENT_ID,
        scope: 'repo,user',
      });

      console.log('✅ Device flow started:', response.data);
      setDeviceFlow(response.data);
      setStep('device-flow');
    } catch (err: any) {
      console.error('❌ Device flow error:', err);
      console.error('Response:', err.response?.data);

      const errorMessage = err.response?.data?.error || err.message || 'Failed to start GitHub authentication';
      setError(`Failed to start GitHub authentication: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePatSubmit = () => {
    if (pat.trim()) {
      onAuthenticated(pat.trim());
    }
  };

  const handleOpenVerification = () => {
    if (deviceFlow?.verification_uri) {
      Linking.openURL(deviceFlow.verification_uri);
    }
  }

  // On mobile, use Device Flow; on web/PC use WebBrowser OAuth
  const handleGitHubAuth = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // Mobile: use Device Flow
      handleStartDeviceFlow();
    } else {
      // Web/PC: use WebBrowser OAuth
      handleWebBrowserAuth();
    }
  };

  const renderOptions = () => (
    <>
      <Text style={styles.title}>Autenticazione richiesta</Text>
      <Text style={styles.subtitle}>
        {repositoryUrl ? `Il repository "${repositoryUrl.split('/').pop()?.replace('.git', '')}" è privato.` : 'Questo repository è privato.'}
        {' '}Scegli un metodo di autenticazione.
      </Text>
      <TouchableOpacity
        style={styles.optionButton}
        onPress={handleGitHubAuth}
        disabled={isLoading}
      >
        <Ionicons name="logo-github" size={24} color="#FFFFFF" />
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionButtonText}>Autentica con GitHub</Text>
          {(Platform.OS === 'ios' || Platform.OS === 'android') && (
            <Text style={styles.optionSubtext}>Via Device Flow</Text>
          )}
        </View>
        {isLoading && <ActivityIndicator color="#FFFFFF" />}
      </TouchableOpacity>
      <TouchableOpacity style={styles.optionButton} onPress={() => setStep('pat')}>
        <Ionicons name="key-outline" size={24} color="#FFFFFF" />
        <View style={styles.optionTextContainer}>
          <Text style={styles.optionButtonText}>Usa un Personal Access Token</Text>
          <Text style={styles.optionSubtext}>Genera un token da GitHub</Text>
        </View>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  const renderPatInput = () => (
    <>
      <TouchableOpacity onPress={() => setStep('options')} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color="rgba(255, 255, 255, 0.6)" />
        <Text style={styles.backButtonText}>Indietro</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Personal Access Token</Text>
      <Text style={styles.subtitle}>Genera un token dalle impostazioni di GitHub e incollalo qui sotto.</Text>
      <TextInput
        style={styles.input}
        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
        placeholderTextColor="rgba(255, 255, 255, 0.3)"
        value={pat}
        onChangeText={setPat}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={[styles.submitButton, !pat.trim() && styles.submitButtonDisabled]}
        onPress={handlePatSubmit}
        disabled={!pat.trim()}
      >
        <Text style={styles.submitButtonText}>Autentica</Text>
      </TouchableOpacity>
    </>
  );

  const renderDeviceFlow = () => (
    <>
      <TouchableOpacity onPress={() => setStep('options')} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color="rgba(255, 255, 255, 0.6)" />
      </TouchableOpacity>
      <Text style={styles.title}>Autorizza su GitHub</Text>
      <Text style={styles.subtitle}>Inserisci il codice qui sotto sul sito di GitHub per concedere l'accesso.</Text>

      <View style={styles.deviceCodeContainer}>
        <Text style={styles.deviceCode}>{deviceFlow?.user_code}</Text>
        <TouchableOpacity style={styles.copyButton} onPress={() => Clipboard.setStringAsync(deviceFlow?.user_code || '')}>
          <Ionicons name="copy-outline" size={20} color="#FFFFFF" />
          <Text style={styles.copyButtonText}>Copia Codice</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.linkButton} onPress={handleOpenVerification}>
        <Ionicons name="open-outline" size={16} color="#FFFFFF" />
        <Text style={styles.linkText}>Apri GitHub e Autorizza</Text>
      </TouchableOpacity>

      <View style={styles.pollingIndicator}>
        <ActivityIndicator color={AppColors.primary} />
        <Text style={styles.pollingText}>In attesa dell'autorizzazione...</Text>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  const renderContent = () => (
    <View style={styles.modalInner}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="rgba(255, 255, 255, 0.6)" />
        </TouchableOpacity>
      </View>

      {step === 'options' && renderOptions()}
      {step === 'pat' && renderPatInput()}
      {step === 'device-flow' && renderDeviceFlow()}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalWrapper} onPress={e => e.stopPropagation()}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={[styles.modal, { backgroundColor: 'transparent', overflow: 'hidden' }]}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              {renderContent()}
            </LiquidGlassView>
          ) : (
            <View style={styles.modal}>
              {renderContent()}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 400,
  },
  modal: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalInner: {
    padding: 24,
    backgroundColor: 'rgba(26, 26, 26, 0.4)',
    borderRadius: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
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
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 20,
  },
  submitButton: {
    height: 48,
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
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 68,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
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
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  errorText: {
    color: '#ff4d4d',
    textAlign: 'center',
    marginTop: 10,
  },
  deviceCodeContainer: {
    paddingVertical: 20,
    paddingHorizontal: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  deviceCode: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    marginBottom: 24,
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
    color: 'rgba(255, 255, 255, 0.6)',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  copyButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});