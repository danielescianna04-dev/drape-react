import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword } from 'firebase/auth';
import { auth } from '../../../config/firebase';
import { AppColors } from '../../../shared/theme/colors';
import { useToastStore } from '../../../core/toast/toastStore';

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  t: (key: string) => string;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  visible,
  onClose,
  t,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setIsLoading(false);
    }
  }, [visible]);

  const handleSave = async () => {
    setError(null);

    if (newPassword.length < 6) {
      setError(t('security.passwordTooWeak'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('security.passwordsNoMatch'));
      return;
    }

    setIsLoading(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || !firebaseUser.email) throw new Error('no-user');

      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);

      useToastStore.getState().showToast({
        message: t('security.passwordUpdated'),
        icon: 'checkmark-circle',
        type: 'success',
      });
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError(t('security.wrongPassword'));
      } else if (err.code === 'auth/weak-password') {
        setError(t('security.passwordTooWeak'));
      } else {
        setError(err.message || t('common:error'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => (
    <View style={styles.inner}>
      <Ionicons name="lock-closed-outline" size={36} color={AppColors.primary} style={{ marginBottom: 8 }} />
      <Text style={styles.title}>{t('security.changePassword')}</Text>
      <Text style={styles.subtitle}>{t('security.changePasswordDesc')}</Text>

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder={t('security.currentPassword')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          secureTextEntry
          autoFocus
          selectionColor={AppColors.primary}
        />
      </View>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder={t('security.newPassword')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          secureTextEntry
          selectionColor={AppColors.primary}
        />
      </View>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t('security.confirmPassword')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          secureTextEntry
          selectionColor={AppColors.primary}
        />
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.btnCancel} onPress={onClose} disabled={isLoading}>
          <Text style={styles.btnCancelText}>{t('common:cancel')}</Text>
        </TouchableOpacity>
        <LinearGradient colors={[AppColors.primary, AppColors.primaryShade]} style={styles.btnConfirm}>
          <TouchableOpacity
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            onPress={handleSave}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnConfirmText}>{t('common:save')}</Text>
            )}
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        {isLiquidGlassSupported ? (
          <LiquidGlassView style={styles.card} interactive={true} effect="regular" colorScheme="dark">
            {renderContent()}
          </LiquidGlassView>
        ) : (
          <View style={[styles.card, { backgroundColor: '#1C1C1E' }]}>
            {renderContent()}
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { width: 310, borderRadius: 20, overflow: 'hidden' },
  inner: { padding: 24, alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4, letterSpacing: -0.3 },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    width: '100%',
  },
  errorText: { color: '#EF4444', fontSize: 13, flex: 1 },
  inputWrap: { width: '100%', marginBottom: 10 },
  input: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  buttons: { flexDirection: 'row', width: '100%', gap: 10, marginTop: 6 },
  btnCancel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btnConfirm: { flex: 1, borderRadius: 12, height: 46 },
  btnCancelText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600' },
  btnConfirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
