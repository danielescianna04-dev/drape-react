import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const modalOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      checkClipboard();
    }
  }, [visible]);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  useEffect(() => {
    Animated.spring(modalOffset, {
      toValue: keyboardVisible ? -150 : 0,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [keyboardVisible]);

  const isGitUrl = (url: string): boolean => {
    if (!url || typeof url !== 'string') return false;
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.includes('github.com') ||
      lowerUrl.includes('gitlab.com') ||
      lowerUrl.includes('bitbucket.org') ||
      lowerUrl.includes('gitea.') ||
      lowerUrl.endsWith('.git') ||
      /git[@:]/.test(lowerUrl)
    );
  };

  const checkClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && isGitUrl(text)) {
        setRepoUrl(text);
      }
    } catch (error) {
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          {/* Backdrop blur */}
          <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />

          {/* Modal card - moves up when keyboard is visible */}
          <Animated.View style={[styles.modalWrapper, { transform: [{ translateY: modalOffset }] }]}>
            {isLiquidGlassSupported ? (
              <LiquidGlassView style={styles.liquidGlassContainer} interactive={true} effect="clear" colorScheme="dark">
                <View style={styles.modalContentInner}>
                  {/* Header with icon */}
                  <View style={styles.header}>
                    <View style={styles.iconCircle}>
                      <LinearGradient
                        colors={[AppColors.primary, AppColors.purpleMedium]}
                        style={styles.iconGradient}
                      >
                        <Ionicons name="logo-github" size={24} color={AppColors.white.full} />
                      </LinearGradient>
                    </View>
                    <Text style={styles.title}>Import from GitHub</Text>
                  </View>

                  {/* Input section */}
                  <View style={styles.inputSection}>
                    <Text style={styles.label}>GitHub URL</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.input}
                        value={String(repoUrl || '')}
                        onChangeText={(text) => setRepoUrl(String(text || ''))}
                        placeholder="https://github.com/username/repository"
                        placeholderTextColor={AppColors.white.w35}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!isLoading}
                        keyboardAppearance="dark"
                        returnKeyType="done"
                        onSubmitEditing={handleImport}
                      />
                      {repoUrl.length > 0 && !isLoading && (
                        <TouchableOpacity
                          style={styles.clearButton}
                          onPress={() => setRepoUrl('')}
                        >
                          <Ionicons name="close-circle" size={18} color={AppColors.white.w40} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Buttons */}
                  <View style={styles.buttons}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={onClose}
                      disabled={isLoading}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.importButtonContainer}
                      onPress={handleImport}
                      disabled={!isValidUrl || isLoading}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={
                          !isValidUrl || isLoading
                            ? [AppColors.primaryAlpha.a40, AppColors.primaryAlpha.a40]
                            : [AppColors.primary, AppColors.purpleMedium]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.importButton}
                      >
                        {isLoading ? (
                          <ActivityIndicator color={AppColors.white.full} />
                        ) : (
                          <Text style={styles.importText}>Import</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              </LiquidGlassView>
            ) : (
              <View style={styles.modalContainer}>
                <LinearGradient
                  colors={[AppColors.white.w08, AppColors.white.w04]}
                  style={styles.modalGradient}
                >
                  {/* Header with icon */}
                  <View style={styles.header}>
                    <View style={styles.iconCircle}>
                      <LinearGradient
                        colors={[AppColors.primary, AppColors.purpleMedium]}
                        style={styles.iconGradient}
                      >
                        <Ionicons name="logo-github" size={24} color={AppColors.white.full} />
                      </LinearGradient>
                    </View>
                    <Text style={styles.title}>Import from GitHub</Text>
                  </View>

                  {/* Input section */}
                  <View style={styles.inputSection}>
                    <Text style={styles.label}>GitHub URL</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.input}
                        value={String(repoUrl || '')}
                        onChangeText={(text) => setRepoUrl(String(text || ''))}
                        placeholder="https://github.com/username/repository"
                        placeholderTextColor={AppColors.white.w35}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!isLoading}
                        keyboardAppearance="dark"
                        returnKeyType="done"
                        onSubmitEditing={handleImport}
                      />
                      {repoUrl.length > 0 && !isLoading && (
                        <TouchableOpacity
                          style={styles.clearButton}
                          onPress={() => setRepoUrl('')}
                        >
                          <Ionicons name="close-circle" size={18} color={AppColors.white.w40} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Buttons */}
                  <View style={styles.buttons}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={onClose}
                      disabled={isLoading}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.importButtonContainer}
                      onPress={handleImport}
                      disabled={!isValidUrl || isLoading}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={
                          !isValidUrl || isLoading
                            ? [AppColors.primaryAlpha.a40, AppColors.primaryAlpha.a40]
                            : [AppColors.primary, AppColors.purpleMedium]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.importButton}
                      >
                        {isLoading ? (
                          <ActivityIndicator color={AppColors.white.full} />
                        ) : (
                          <Text style={styles.importText}>Import</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>

                {/* Border glow */}
                <View style={styles.borderGlow} />
              </View>
            )}
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: AppColors.black.b80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalWrapper: {
    width: '100%',
    paddingHorizontal: 20,
    maxWidth: 440,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  liquidGlassContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 28,
    overflow: 'hidden',
  },
  modalContentInner: {
    padding: 24,
    paddingBottom: 28,
  },
  modalGradient: {
    backgroundColor: AppColors.dark.backgroundAlt,
    borderRadius: 20,
    padding: 24,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a20,
  },
  borderGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a15,
    pointerEvents: 'none',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  iconGradient: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.white.full,
    letterSpacing: -0.5,
  },
  inputSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.white.w60,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: AppColors.white.w04,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 14,
    color: AppColors.white.full,
    fontWeight: '500',
  },
  clearButton: {
    position: 'absolute',
    right: 12,
    top: 13,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: AppColors.white.w04,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: AppColors.white.w80,
    fontSize: 15,
    fontWeight: '600',
  },
  importButtonContainer: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  importButton: {
    paddingVertical: 14,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importText: {
    color: AppColors.white.full,
    fontSize: 15,
    fontWeight: '700',
  },
});
