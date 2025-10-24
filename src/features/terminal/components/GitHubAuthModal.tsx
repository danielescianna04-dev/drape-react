import * as Clipboard from 'expo-clipboard';
import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import axios from 'axios';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAuthenticated: (token: string) => void;
}

type AuthStep = 'options' | 'pat' | 'device-flow';

interface DeviceFlowData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export const GitHubAuthModal = ({ visible, onClose, onAuthenticated }: Props) => {
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
            client_id: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID,
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

  const handleStartDeviceFlow = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/github/device-flow`, {
        client_id: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID,
        scope: 'repo,user',
      });
      setDeviceFlow(response.data);
      setStep('device-flow');
    } catch (err) {
      setError('Failed to start GitHub authentication. Please check your connection.');
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
    if(deviceFlow?.verification_uri) {
        Linking.openURL(deviceFlow.verification_uri);
    }
  }

  const renderOptions = () => (
    <>
      <Text style={styles.title}>Authentication Required</Text>
      <Text style={styles.subtitle}>This repository is private. Choose an authentication method.</Text>
      <TouchableOpacity style={styles.optionButton} onPress={handleStartDeviceFlow}>
        <Ionicons name="logo-github" size={24} color="#FFFFFF" />
        <Text style={styles.optionButtonText}>Authenticate with GitHub</Text>
        {isLoading && <ActivityIndicator color="#FFFFFF" />}
      </TouchableOpacity>
      <TouchableOpacity style={styles.optionButton} onPress={() => setStep('pat')}>
        <Ionicons name="key-outline" size={24} color="#FFFFFF" />
        <Text style={styles.optionButtonText}>Use a Personal Access Token</Text>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  const renderPatInput = () => (
    <>
      <TouchableOpacity onPress={() => setStep('options')} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color="rgba(255, 255, 255, 0.6)" />
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Personal Access Token</Text>
      <Text style={styles.subtitle}>Generate a token from your GitHub settings and paste it below.</Text>
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
        <Text style={styles.submitButtonText}>Authenticate</Text>
      </TouchableOpacity>
    </>
  );

  const renderDeviceFlow = () => (
    <>
      <TouchableOpacity onPress={() => setStep('options')} style={styles.backButton}>
        <Ionicons name="arrow-back" size={20} color="rgba(255, 255, 255, 0.6)" />
      </TouchableOpacity>
      <Text style={styles.title}>Authorize on GitHub</Text>
      <Text style={styles.subtitle}>Enter the code below on the GitHub website to grant access.</Text>
      
      <View style={styles.deviceCodeContainer}>
        <Text style={styles.deviceCode}>{deviceFlow?.user_code}</Text>
        <TouchableOpacity style={styles.copyButton} onPress={() => Clipboard.setStringAsync(deviceFlow?.user_code || '')}>
          <Ionicons name="copy-outline" size={20} color="#FFFFFF" />
          <Text style={styles.copyButtonText}>Copy Code</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.linkButton} onPress={handleOpenVerification}>
        <Ionicons name="open-outline" size={16} color={AppColors.primary} />
        <Text style={styles.linkText}>Open GitHub and Authorize</Text>
      </TouchableOpacity>

      <View style={styles.pollingIndicator}>
        <ActivityIndicator color={AppColors.primary} />
        <Text style={styles.pollingText}>Waiting for authorization...</Text>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="rgba(255, 255, 255, 0.6)" />
            </TouchableOpacity>
          </View>

          {step === 'options' && renderOptions()}
          {step === 'pat' && renderPatInput()}
          {step === 'device-flow' && renderDeviceFlow()}
        </View>
      </View>
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
  modal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#121212',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    height: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  optionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
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