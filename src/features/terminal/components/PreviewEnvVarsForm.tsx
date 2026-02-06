import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../../shared/theme/colors';

interface EnvVar {
  key: string;
  defaultValue: string;
  description: string;
  required: boolean;
}

export interface PreviewEnvVarsFormProps {
  requiredEnvVars: EnvVar[];
  envVarValues: Record<string, string>;
  onChangeEnvVar: (key: string, value: string) => void;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  topInset: number;
  bottomInset: number;
}

export const PreviewEnvVarsForm: React.FC<PreviewEnvVarsFormProps> = ({
  requiredEnvVars,
  envVarValues,
  onChangeEnvVar,
  isSaving,
  onSave,
  onCancel,
  topInset,
  bottomInset,
}) => {
  const { t } = useTranslation(['terminal']);

  return (
    <View style={styles.envVarsScreen}>
      <ScrollView
        style={[styles.envVarsContainer, { marginTop: topInset + 44 }]}
        contentContainerStyle={styles.envVarsScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.envVarsHeader}>
          <Text style={styles.envVarsTitle}>{t('terminal:preview.envVarsTitle')}</Text>
          <Text style={styles.envVarsSubtitle}>
            {t('terminal:preview.envVarsSubtitle')}
          </Text>
        </View>

        <View style={styles.envVarsList}>
          {requiredEnvVars.map((envVar) => (
            <View key={envVar.key} style={styles.envVarItem}>
              <View style={styles.envVarLabelRow}>
                <Text style={styles.envVarKey}>{envVar.key}</Text>
                {envVar.required && (
                  <Text style={styles.envVarRequired}>*</Text>
                )}
              </View>
              {envVar.description && (
                <Text style={styles.envVarDescription}>{envVar.description}</Text>
              )}
              <TextInput
                style={styles.envVarInput}
                value={envVarValues[envVar.key] || ''}
                onChangeText={(text) => onChangeEnvVar(envVar.key, text)}
                placeholder={envVar.defaultValue || t('terminal:preview.enterValue')}
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.envVarsActions, { paddingBottom: bottomInset + 16 }]}>
        <TouchableOpacity
          style={[styles.envVarsSaveButton, isSaving && styles.envVarsSaveButtonDisabled]}
          onPress={onSave}
          disabled={isSaving}
          activeOpacity={0.7}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={styles.envVarsSaveText}>Avvia</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.envVarsSkipButton}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={styles.envVarsSkipText}>Annulla</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  envVarsScreen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  envVarsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  envVarsScrollContent: {
    paddingBottom: 20,
  },
  envVarsHeader: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 4,
  },
  envVarsTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  envVarsSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
  envVarsList: {
    gap: 12,
  },
  envVarItem: {
    gap: 4,
  },
  envVarLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  envVarKey: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  envVarRequired: {
    fontSize: 11,
    color: AppColors.primary,
    fontWeight: '600',
  },
  envVarDescription: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 2,
  },
  envVarInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  envVarsActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    alignItems: 'center',
  },
  envVarsSaveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  envVarsSaveButtonDisabled: {
    opacity: 0.6,
  },
  envVarsSaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  envVarsSkipButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  envVarsSkipText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
