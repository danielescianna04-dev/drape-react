/**
 * PreviewStateEnvRequired — Missing env vars screen.
 * Renders a form to fill env vars or redirects to env configuration.
 * Pure component: no hooks that fetch data, no direct store access.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../../shared/theme/colors';

// ── Props ──────────────────────────────────────────────────

export interface EnvVarDef {
  key: string;
  defaultValue?: string;
  description?: string;
  required: boolean;
}

export interface PreviewStateEnvRequiredProps {
  requiredEnvVars: EnvVarDef[];
  envVarValues: Record<string, string>;
  onChangeEnvVar: (key: string, value: string) => void;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  topInset: number;
  bottomInset: number;
}

// ── Component ──────────────────────────────────────────────

export const PreviewStateEnvRequired: React.FC<PreviewStateEnvRequiredProps> = ({
  requiredEnvVars,
  envVarValues,
  onChangeEnvVar,
  isSaving,
  onSave,
  onCancel,
  topInset,
  bottomInset,
}) => {
  const allRequiredFilled = requiredEnvVars
    .filter((v) => v.required)
    .every((v) => (envVarValues[v.key] || '').trim().length > 0);

  return (
    <View style={[s.root, { paddingTop: topInset + 16 }]}>
      <LinearGradient
        colors={['#0D0B1A', '#110E22', '#0A0818']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="key-outline" size={28} color="#F59E0B" />
        </View>
        <Text style={s.headerTitle}>Variabili d'ambiente richieste</Text>
        <Text style={s.headerSubtitle}>
          Questo progetto necessita delle seguenti variabili per funzionare.
        </Text>
      </View>

      {/* Form */}
      <ScrollView
        style={s.scrollArea}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomInset + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        {requiredEnvVars.map((envVar) => (
          <View key={envVar.key} style={s.fieldCard}>
            <View style={s.fieldHeader}>
              <Text style={s.fieldKey}>{envVar.key}</Text>
              {envVar.required && <Text style={s.requiredBadge}>Richiesto</Text>}
            </View>
            {envVar.description ? (
              <Text style={s.fieldDesc}>{envVar.description}</Text>
            ) : null}
            <TextInput
              style={s.fieldInput}
              value={envVarValues[envVar.key] || ''}
              onChangeText={(v) => onChangeEnvVar(envVar.key, v)}
              placeholder={envVar.defaultValue || `Inserisci ${envVar.key}`}
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={envVar.key.toLowerCase().includes('secret') || envVar.key.toLowerCase().includes('password')}
            />
          </View>
        ))}
      </ScrollView>

      {/* Footer buttons */}
      <View style={[s.footer, { paddingBottom: bottomInset + 16 }]}>
        <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={s.cancelBtnText}>Annulla</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.saveBtn, !allRequiredFilled && s.saveBtnDisabled]}
          onPress={onSave}
          activeOpacity={0.7}
          disabled={!allRequiredFilled || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={s.saveBtnText}>Salva e avvia</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0B1A' },
  header: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 20 },
  headerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 8, textAlign: 'center' },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, gap: 12 },
  fieldCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
  },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  fieldKey: { fontSize: 13, fontWeight: '700', color: '#C4B5FD', fontFamily: 'Courier New' },
  requiredBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  fieldDesc: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 },
  fieldInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#fff',
    fontFamily: 'Courier New',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: AppColors.primary,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
