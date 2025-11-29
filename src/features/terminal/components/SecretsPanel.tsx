import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { config } from '../../../config/config';
import { PanelHeader, EmptyState } from '../../../shared/components/organisms';
import { IconButton } from '../../../shared/components/atoms';

interface Props {
  onClose: () => void;
}

interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
  description?: string;
}

export const SecretsPanel = ({ onClose }: Props) => {
  const { currentWorkstation } = useTerminalStore();
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasEnvExample, setHasEnvExample] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    loadEnvVariables();
  }, [currentWorkstation]);

  const loadEnvVariables = async () => {
    if (!currentWorkstation?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(
        `${config.apiUrl}/workstation/${currentWorkstation.id}/env-variables`
      );

      if (!response.ok) {
        throw new Error(`Failed to load env variables: ${response.status}`);
      }

      const data = await response.json();
      setEnvVars(data.variables || []);
      setHasEnvExample(data.hasEnvExample || false);
    } catch (error) {
      console.error('Failed to load env variables:', error);
      Alert.alert('Errore', 'Impossibile caricare le variabili d\'ambiente');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentWorkstation?.id) return;

    try {
      setIsSaving(true);
      const response = await fetch(
        `${config.apiUrl}/workstation/${currentWorkstation.id}/env-variables`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            variables: envVars,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to save env variables: ${response.status}`);
      }

      Alert.alert('Successo', 'Variabili d\'ambiente salvate correttamente');
    } catch (error) {
      console.error('Failed to save env variables:', error);
      Alert.alert('Errore', 'Impossibile salvare le variabili d\'ambiente');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddVariable = () => {
    if (!newKey.trim()) {
      Alert.alert('Errore', 'Inserisci il nome della variabile');
      return;
    }

    const existingVar = envVars.find(v => v.key === newKey);
    if (existingVar) {
      Alert.alert('Errore', 'Una variabile con questo nome esiste già');
      return;
    }

    setEnvVars([...envVars, { key: newKey, value: newValue, isSecret: true }]);
    setNewKey('');
    setNewValue('');
    setShowAddForm(false);
  };

  const handleUpdateVariable = (key: string, value: string) => {
    setEnvVars(envVars.map(v => v.key === key ? { ...v, value } : v));
  };

  const handleDeleteVariable = (key: string) => {
    Alert.alert(
      'Conferma',
      `Vuoi eliminare la variabile ${key}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => setEnvVars(envVars.filter(v => v.key !== key))
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0a0a', '#000000']}
        style={StyleSheet.absoluteFill}
      />

      <PanelHeader
        title="Secrets & Variables"
        icon="key"
        onClose={onClose}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AppColors.primary} />
          <Text style={styles.loadingText}>Caricamento variabili...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Info Banner */}
          <View style={styles.infoBanner}>
            <View style={styles.infoBannerIcon}>
              <Ionicons name="information-circle" size={20} color="#00D9FF" />
            </View>
            <View style={styles.infoBannerContent}>
              <Text style={styles.infoBannerTitle}>Gestisci le tue variabili d'ambiente</Text>
              <Text style={styles.infoBannerText}>
                {hasEnvExample
                  ? 'Trovato .env.example nel progetto. Le variabili sono state caricate automaticamente.'
                  : 'Aggiungi manualmente le variabili d\'ambiente necessarie per il progetto.'}
              </Text>
            </View>
          </View>

          {/* Environment Variables List */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Variabili d'Ambiente</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddForm(!showAddForm)}
                activeOpacity={0.7}
              >
                <Ionicons name={showAddForm ? "close" : "add-circle"} size={20} color={AppColors.primary} />
                <Text style={styles.addButtonText}>{showAddForm ? 'Annulla' : 'Aggiungi'}</Text>
              </TouchableOpacity>
            </View>

            {/* Add Variable Form */}
            {showAddForm && (
              <View style={styles.addForm}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nome Variabile</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="es. API_KEY"
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    value={newKey}
                    onChangeText={setNewKey}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Valore</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Inserisci il valore"
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    value={newValue}
                    onChangeText={setNewValue}
                    secureTextEntry={true}
                  />
                </View>
                <TouchableOpacity
                  style={styles.addFormButton}
                  onPress={handleAddVariable}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[AppColors.primary, '#7C5DFA']}
                    style={styles.addFormButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.addFormButtonText}>Aggiungi Variabile</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* Variables List */}
            {envVars.length === 0 ? (
              <EmptyState
                icon="file-tray-outline"
                title="Nessuna variabile d'ambiente configurata"
                subtitle="Clicca su 'Aggiungi' per creare la tua prima variabile"
              />
            ) : (
              envVars.map((envVar) => (
                <View key={envVar.key} style={styles.variableItem}>
                  <View style={styles.variableHeader}>
                    <View style={styles.variableIcon}>
                      <Ionicons
                        name={envVar.isSecret ? "lock-closed" : "document-text"}
                        size={16}
                        color={envVar.isSecret ? "#FFA500" : AppColors.primary}
                      />
                    </View>
                    <Text style={styles.variableKey}>{envVar.key}</Text>
                    <TouchableOpacity
                      onPress={() => handleDeleteVariable(envVar.key)}
                      style={styles.deleteButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#FF4444" />
                    </TouchableOpacity>
                  </View>
                  {envVar.description && (
                    <Text style={styles.variableDescription}>{envVar.description}</Text>
                  )}
                  <TextInput
                    style={styles.variableInput}
                    value={envVar.value}
                    onChangeText={(value) => handleUpdateVariable(envVar.key, value)}
                    placeholder="Inserisci il valore"
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    secureTextEntry={envVar.isSecret}
                  />
                </View>
              ))
            )}
          </View>

          {/* Save Button */}
          {envVars.length > 0 && (
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={isSaving ? ['#555', '#444'] : [AppColors.primary, '#7C5DFA']}
                style={styles.saveButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="save" size={20} color="#FFFFFF" />
                )}
                <Text style={styles.saveButtonText}>
                  {isSaving ? 'Salvataggio...' : 'Salva Modifiche'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Warning */}
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={18} color="#FFA500" />
            <Text style={styles.warningText}>
              Le variabili vengono salvate nel file .env del progetto. Non condividere mai i valori sensibili.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 44,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  infoBannerIcon: {
    marginTop: 2,
  },
  infoBannerContent: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#00D9FF',
    marginBottom: 4,
  },
  infoBannerText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
  },
  section: {
    marginTop: 24,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(139, 124, 246, 0.12)',
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
  },
  addForm: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#FFFFFF',
  },
  addFormButton: {
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  addFormButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  addFormButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  variableItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  variableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  variableIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  variableKey: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  deleteButton: {
    padding: 4,
  },
  variableDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 8,
    marginLeft: 38,
  },
  variableInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  saveButton: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 165, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.3)',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginBottom: 24,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 16,
  },
});
