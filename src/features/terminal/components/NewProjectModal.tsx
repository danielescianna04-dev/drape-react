import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/components/atoms/Button';
import { Input } from '../../../shared/components/atoms/Input';
import { AppColors } from '../../../shared/theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (name: string, language: string) => void;
}

export const NewProjectModal = ({ visible, onClose, onConfirm }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const [projectName, setProjectName] = useState('');
  const [language, setLanguage] = useState('');

  const handleConfirm = () => {
    if (projectName.trim()) {
      onConfirm(projectName.trim(), language.trim());
      setProjectName('');
      setLanguage('');
      onClose();
    }
  };

  const renderModalContent = () => (
    <View style={styles.modalInner}>
        <View style={styles.header}>
          <Ionicons name="folder-outline" size={24} color={AppColors.primary} />
          <Text style={styles.title}>{t('terminal:newProjectModal.title')}</Text>
        </View>

      <Input
        value={projectName}
        onChangeText={setProjectName}
        placeholder={t('terminal:newProjectModal.namePlaceholder')}
        autoFocus
        style={{ marginBottom: 12 }}
      />

      <Input
        value={language}
        onChangeText={setLanguage}
        placeholder={t('terminal:newProjectModal.languagePlaceholder')}
        style={{ marginBottom: 20 }}
      />

      <View style={styles.buttons}>
        <Button
          label={t('common:cancel')}
          onPress={onClose}
          variant="secondary"
          style={{ flex: 1 }}
        />
        <Button
          label={t('common:create')}
          onPress={handleConfirm}
          variant="primary"
          disabled={!projectName.trim()}
          style={{ flex: 1 }}
        />
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
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalWrapper} onPress={(e) => e.stopPropagation()}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={[styles.modal, { backgroundColor: 'transparent', overflow: 'hidden' }]}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              {renderModalContent()}
            </LiquidGlassView>
          ) : (
            <View style={styles.modal}>
              {renderModalContent()}
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    borderColor: 'rgba(0, 255, 136, 0.2)',
  },
  modalInner: {
    padding: 24,
    backgroundColor: 'rgba(26, 26, 26, 0.4)',
    borderRadius: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
});
