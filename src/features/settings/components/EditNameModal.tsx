import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../../shared/theme/colors';

interface EditNameModalProps {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (newName: string) => void;
  t: (key: string) => string;
}

export const EditNameModal: React.FC<EditNameModalProps> = ({
  visible,
  currentName,
  onClose,
  onSave,
  t,
}) => {
  const [editNameValue, setEditNameValue] = useState('');

  useEffect(() => {
    if (visible) {
      setEditNameValue(currentName);
    }
  }, [visible, currentName]);

  const handleSave = () => {
    if (editNameValue.trim()) {
      onSave(editNameValue.trim());
    }
    onClose();
  };

  const renderContent = () => (
    <View style={styles.editNameInner}>
      <Ionicons name="person-circle-outline" size={36} color={AppColors.primary} style={{ marginBottom: 8 }} />
      <Text style={styles.editNameTitle}>{t('profile.editName')}</Text>
      <Text style={styles.editNameSubtitle}>{t('profile.enterName')}</Text>
      <View style={styles.editNameInputWrap}>
        <TextInput
          style={styles.editNameInput}
          value={editNameValue}
          onChangeText={setEditNameValue}
          placeholder={t('profile.defaultName')}
          placeholderTextColor="rgba(255,255,255,0.3)"
          autoFocus
          selectionColor={AppColors.primary}
        />
      </View>
      <View style={styles.editNameButtons}>
        <TouchableOpacity
          style={styles.editNameBtn}
          onPress={onClose}
        >
          <Text style={styles.editNameBtnTextCancel}>{t('common:cancel')}</Text>
        </TouchableOpacity>
        <LinearGradient
          colors={[AppColors.primary, AppColors.primaryShade]}
          style={styles.editNameBtnConfirm}
        >
          <TouchableOpacity
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            onPress={handleSave}
          >
            <Text style={styles.editNameBtnTextConfirm}>{t('common:save')}</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.editNameOverlay}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={styles.editNameCard}
            interactive={true}
            effect="regular"
            colorScheme="dark"
          >
            {renderContent()}
          </LiquidGlassView>
        ) : (
          <View style={[styles.editNameCard, { backgroundColor: '#1C1C1E' }]}>
            {renderContent()}
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  editNameOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editNameCard: {
    width: 310,
    borderRadius: 20,
    overflow: 'hidden',
  },
  editNameInner: {
    padding: 24,
    alignItems: 'center',
  },
  editNameTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  editNameSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    marginBottom: 20,
  },
  editNameInputWrap: {
    width: '100%',
    marginBottom: 20,
  },
  editNameInput: {
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
  editNameButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  editNameBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editNameBtnConfirm: {
    flex: 1,
    borderRadius: 12,
    height: 46,
  },
  editNameBtnTextCancel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
  },
  editNameBtnTextConfirm: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
