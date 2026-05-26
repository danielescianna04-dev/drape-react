import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { supabase } from '../../../lib/supabase/client';
import { AppColors } from '../../../shared/theme/colors';
import { tracciaEmailCambiata, tracciaErroreCambioEmail } from '../../../core/services/analyticsService';

interface ChangeEmailModalProps {
  visible: boolean;
  currentEmail: string;
  onClose: () => void;
  t: (key: string) => string;
}

export const ChangeEmailModal: React.FC<ChangeEmailModalProps> = ({
  visible,
  currentEmail,
  onClose,
  t,
}) => {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (visible) {
      setNewEmail('');
      setPassword('');
      setError(null);
      setSuccess(false);
      setIsLoading(false);
    }
  }, [visible]);

  const handleSave = async () => {
    setError(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setError(t('security.invalidEmail'));
      return;
    }

    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentEmail = userData.user?.email;
      if (!currentEmail) throw new Error('no-user');

      // Re-authenticate by signing in with the provided password
      const { error: signinError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password,
      });
      if (signinError) throw signinError;

      // Update email — Supabase sends a verification link to the new address
      const { error: updateError } = await supabase.auth.updateUser({ email: newEmail });
      if (updateError) throw updateError;

      tracciaEmailCambiata();
      setSuccess(true);
    } catch (err: any) {
      tracciaErroreCambioEmail(err.message || 'unknown');
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('invalid login') || msg.includes('invalid_credentials')) {
        setError(t('security.wrongPassword'));
      } else if (msg.includes('already') && msg.includes('registered')) {
        setError(t('security.emailInUse'));
      } else if (msg.includes('invalid email')) {
        setError(t('security.invalidEmail'));
      } else {
        setError(err.message || t('common:error'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (success) {
      return (
        <View style={styles.inner}>
          <View style={styles.successIcon}>
            <Ionicons name="mail-outline" size={36} color="#10B981" />
          </View>
          <Text style={styles.title}>{t('security.changeEmail')}</Text>
          <Text style={styles.successText}>{t('security.emailVerificationSent')}</Text>
          <TouchableOpacity
            style={styles.okButton}
            onPress={onClose}
          >
            <Text style={styles.okButtonText}>{t('common:ok')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.inner}>
        <Ionicons name="mail-outline" size={36} color="#F59E0B" style={{ marginBottom: 8 }} />
        <Text style={styles.title}>{t('security.changeEmail')}</Text>
        <Text style={styles.subtitle}>{currentEmail}</Text>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder={t('security.newEmail')}
            placeholderTextColor="rgba(255,255,255,0.3)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
            selectionColor={AppColors.primary}
          />
        </View>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t('security.enterPasswordToChange')}
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
  };

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
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 16 },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  okButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  okButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
    borderRadius: 24,
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
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btnConfirm: { flex: 1, borderRadius: 24, height: 46 },
  btnCancelText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600' },
  btnConfirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
