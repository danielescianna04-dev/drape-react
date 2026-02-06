import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppColors } from '../../../../shared/theme/colors';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { config } from '../../../../config/config';
import { getAuthHeaders } from '../../../../core/api/getAuthToken';
import { Tab } from '../../../../core/tabs/tabStore';
import { useSidebarOffset } from '../../context/SidebarContext';

interface Props {
  tab: Tab;
}

interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

const SIDEBAR_WIDTH = 30;

export const EnvVarsView = ({ tab }: Props) => {
  const insets = useSafeAreaInsets();
  const { currentWorkstation } = useTerminalStore();
  const { isSidebarHidden } = useSidebarOffset();

  const topPadding = insets.top + 38;
  const sidebarPadding = isSidebarHidden ? 0 : SIDEBAR_WIDTH;

  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  const projectId = currentWorkstation?.id;

  useEffect(() => {
    loadEnvVariables();
  }, [currentWorkstation]);

  const loadEnvVariables = async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${config.apiUrl}/fly/project/${projectId}/env`,
        { headers: authHeaders }
      );
      if (response.ok) {
        const data = await response.json();
        setEnvVars(data.variables || []);
      }
    } catch (error) {
      console.error('Error loading env vars:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const saveVariables = async (updatedVars: EnvVariable[]) => {
    if (!projectId) return false;
    try {
      const saveAuthHeaders = await getAuthHeaders();
      const response = await fetch(
        `${config.apiUrl}/fly/project/${projectId}/env`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...saveAuthHeaders },
          body: JSON.stringify({ variables: updatedVars }),
        }
      );

      if (response.ok) {
        setEnvVars(updatedVars);
        return true;
      }
    } catch (error) {
      console.error('Error saving variables:', error);
      Alert.alert('Errore', 'Impossibile salvare le modifiche');
    }
    return false;
  };

  const handleAddVariable = async () => {
    if (!newKey.trim() || !projectId) return;

    const newVar: EnvVariable = {
      key: newKey.trim(),
      value: newValue,
      isSecret: newKey.toLowerCase().includes('key') ||
        newKey.toLowerCase().includes('secret') ||
        newKey.toLowerCase().includes('token') ||
        newKey.toLowerCase().includes('password'),
    };

    const updatedVars = [...envVars, newVar];
    const success = await saveVariables(updatedVars);

    if (success) {
      setNewKey('');
      setNewValue('');
      setShowAddForm(false);
    }
  };

  const handleDeleteVariable = async (key: string) => {
    if (!projectId) return;

    Alert.alert(
      'Conferma eliminazione',
      `Sei sicuro di voler eliminare "${key}"?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            const updatedVars = envVars.filter(v => v.key !== key);
            await saveVariables(updatedVars);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding, paddingLeft: sidebarPadding }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="key" size={24} color={AppColors.primary} />
          <Text style={styles.headerTitle}>Variabili Ambiente</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={AppColors.primary} />
            <Text style={styles.loadingText}>Caricamento...</Text>
          </View>
        ) : !projectId ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="alert-circle-outline" size={32} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>Apri un progetto per gestire le variabili d'ambiente</Text>
          </View>
        ) : (
          <>
            {/* Current Variables */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Variabili Configurate</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => setShowAddForm(!showAddForm)}
                >
                  <Ionicons name={showAddForm ? 'close' : 'add'} size={20} color={AppColors.primary} />
                </TouchableOpacity>
              </View>

              {showAddForm && (
                <Animated.View entering={FadeIn} style={styles.addForm}>
                  <View style={styles.addFormInner}>
                    <TextInput
                      style={styles.input}
                      placeholder="Nome variabile (es. API_KEY)"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={newKey}
                      onChangeText={setNewKey}
                      autoCapitalize="characters"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Valore"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={newValue}
                      onChangeText={setNewValue}
                      secureTextEntry
                    />
                    <TouchableOpacity style={styles.saveButton} onPress={handleAddVariable}>
                      <Text style={styles.saveButtonText}>Aggiungi</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}

              {envVars.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="key-outline" size={28} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyText}>Nessuna variabile configurata</Text>
                  <Text style={styles.emptySubtext}>Premi + per aggiungere una variabile al file .env</Text>
                </View>
              ) : (
                envVars.map((variable) => (
                  <View key={variable.key} style={styles.variableItem}>
                    <View style={styles.variableInner}>
                      <View style={styles.variableHeader}>
                        <Text style={styles.variableKey} numberOfLines={1} ellipsizeMode="tail">{variable.key}</Text>
                        <View style={styles.variableActions}>
                          {variable.isSecret && (
                            <TouchableOpacity
                              onPress={() => toggleSecretVisibility(variable.key)}
                              style={styles.actionButton}
                            >
                              <Ionicons
                                name={visibleSecrets.has(variable.key) ? 'eye-off' : 'eye'}
                                size={18}
                                color="rgba(255,255,255,0.5)"
                              />
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => handleDeleteVariable(variable.key)}
                            style={styles.actionButton}
                          >
                            <Ionicons name="trash" size={18} color={AppColors.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Text style={styles.variableValue}>
                        {variable.isSecret && !visibleSecrets.has(variable.key)
                          ? '••••••••'
                          : variable.value || '(vuoto)'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingLeft: 20,
    paddingRight: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(155, 138, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addForm: {
    marginBottom: 16,
    borderRadius: 12,
  },
  addFormInner: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: AppColors.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12,
    textAlign: 'center',
  },
  variableItem: {
    marginBottom: 12,
    borderRadius: 12,
  },
  variableInner: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 16,
  },
  variableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  variableKey: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.primary,
    fontFamily: 'monospace',
    flexShrink: 1,
    maxWidth: '70%',
  },
  variableActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButton: {
    padding: 6,
  },
  variableValue: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'monospace',
  },
});
