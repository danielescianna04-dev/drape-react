import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../shared/theme/colors';
import { config } from '../../../config/config';
import { getAuthHeaders } from '../../../core/api/getAuthToken';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { tracciaImportGitAnnullato, tracciaImportGitConfermato } from '../../../core/services/analyticsService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImport: (url: string, branch?: string) => void;
  isLoading?: boolean;
}

export const ImportGitHubModal = ({ visible, onClose, onImport, isLoading = false }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const [repoUrl, setRepoUrl] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const modalOffset = useRef(new Animated.Value(0)).current;

  // Branch selection state
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (visible) {
      const loadClipboard = async () => {
        try {
          const text = await Clipboard.getStringAsync();
          if (isMounted && text && isGitUrl(text)) {
            setRepoUrl(text);
          }
        } catch (error) {
          if (isMounted) {
            console.warn('[ImportGitHubModal] Clipboard check failed:', error);
          }
        }
      };
      loadClipboard();
    } else {
      // Reset state when closed
      setBranches([]);
      setSelectedBranch('');
      setLoadingBranches(false);
    }

    return () => { isMounted = false; };
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

  // Debounced fetch of remote branches when URL changes
  useEffect(() => {
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);

    const url = String(repoUrl || '').trim();
    if (!url || !isGitUrl(url)) {
      setBranches([]);
      setSelectedBranch('');
      return;
    }

    fetchTimerRef.current = setTimeout(() => {
      fetchRemoteBranches(url);
    }, 600);

    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    };
  }, [repoUrl]);

  const fetchRemoteBranches = async (url: string) => {
    setLoadingBranches(true);
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/git/remote-branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ repositoryUrl: url }),
      });
      const data = await response.json();
      if (data.success && data.branches?.length > 0) {
        setBranches(data.branches);
        setSelectedBranch(''); // empty = default branch
      } else {
        setBranches([]);
      }
    } catch {
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

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

  const handleImport = () => {
    const url = String(repoUrl || '').trim();
    if (url) {
      tracciaImportGitConfermato(url);
      onImport(url, selectedBranch || undefined);
      setRepoUrl('');
      setBranches([]);
      setSelectedBranch('');
    }
  };

  const isValidUrl = String(repoUrl || '').trim().length > 0;

  const renderBranchSelector = () => {
    if (loadingBranches) {
      return (
        <View style={styles.branchSection}>
          <View style={styles.branchLoadingRow}>
            <ActivityIndicator size="small" color={AppColors.primary} />
            <Text style={styles.branchLoadingText}>{t('git.loadingBranches')}</Text>
          </View>
        </View>
      );
    }

    if (branches.length <= 1) return null;

    return (
      <View style={styles.branchSection}>
        <Text style={styles.label}>{t('git.selectBranch')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchChipsRow}>
          {branches.map((branch) => {
            const isSelected = selectedBranch === branch || (!selectedBranch && branches.indexOf(branch) === 0);
            return (
              <TouchableOpacity
                key={branch}
                style={[styles.branchChip, isSelected && styles.branchChipActive]}
                onPress={() => setSelectedBranch(branches.indexOf(branch) === 0 ? '' : branch)}
                activeOpacity={0.7}
              >
                <Ionicons name="git-branch-outline" size={12} color={isSelected ? '#fff' : AppColors.white.w60} />
                <Text style={[styles.branchChipText, isSelected && styles.branchChipTextActive]}>
                  {branch}
                </Text>
                {!selectedBranch && branches.indexOf(branch) === 0 && (
                  <Text style={styles.branchDefaultBadge}>{t('git.defaultBranch')}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const modalContent = (
    <>
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
        <Text style={styles.title}>{t('terminal:connectRepo.connectToGitHub')}</Text>
      </View>

      {/* Input section */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>{t('terminal:connectRepo.enterUrl')}</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={String(repoUrl || '')}
            onChangeText={(text) => setRepoUrl(String(text || ''))}
            placeholder={t('terminal:connectRepo.urlPlaceholder')}
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

      {/* Branch selector */}
      {renderBranchSelector()}

      {/* Buttons */}
      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => { tracciaImportGitAnnullato(); onClose(); }}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelText}>{t('common:cancel')}</Text>
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
              <Text style={styles.importText}>{t('common:create', { defaultValue: 'Import' })}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </>
  );

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
          <BlurView intensity={55} style={StyleSheet.absoluteFill} tint="dark" />

          {/* Modal card - moves up when keyboard is visible */}
          <Animated.View style={[styles.modalWrapper, { transform: [{ translateY: modalOffset }] }]}>
            {isLiquidGlassSupported ? (
              <LiquidGlassView style={styles.liquidGlassContainer} interactive={true} effect="clear" colorScheme="dark">
                <View style={styles.modalContentInner}>
                  {modalContent}
                </View>
              </LiquidGlassView>
            ) : (
              <View style={styles.modalContainer}>
                <LinearGradient
                  colors={[AppColors.white.w08, AppColors.white.w04]}
                  style={styles.modalGradient}
                >
                  {modalContent}
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
    backgroundColor: 'rgba(4, 2, 10, 0.88)',
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
    marginBottom: 16,
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
  branchSection: {
    marginBottom: 16,
  },
  branchLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  branchLoadingText: {
    fontSize: 12,
    color: AppColors.white.w40,
  },
  branchChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: AppColors.white.w04,
    borderWidth: 1,
    borderColor: AppColors.white.w08,
  },
  branchChipActive: {
    backgroundColor: `${AppColors.primary}25`,
    borderColor: AppColors.primary,
  },
  branchChipText: {
    fontSize: 12,
    color: AppColors.white.w60,
    fontWeight: '500',
  },
  branchChipTextActive: {
    color: '#fff',
  },
  branchDefaultBadge: {
    fontSize: 9,
    color: AppColors.primary,
    fontWeight: '600',
    marginLeft: 2,
    textTransform: 'uppercase',
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
