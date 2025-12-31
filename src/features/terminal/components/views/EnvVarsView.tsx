import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { AppColors } from '../../../../shared/theme/colors';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { config } from '../../../../config/config';
import { Tab } from '../../../../core/tabs/tabStore';
import { useSidebarOffset } from '../../context/SidebarContext';

interface Props {
  tab: Tab;
}

interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
  description?: string;
  isUserConfigured?: boolean;
}

interface AIVariable {
  key: string;
  description?: string;
  isSecret: boolean;
  defaultValue?: string;
  existingValue?: string;
}

type AIStatus = 'not_started' | 'analyzing' | 'complete' | 'error';

const SIDEBAR_WIDTH = 30;

export const EnvVarsView = ({ tab }: Props) => {
  const insets = useSafeAreaInsets();
  const { currentWorkstation } = useTerminalStore();
  const { isSidebarHidden } = useSidebarOffset();

  // Padding per TabBar e safe area
  const topPadding = insets.top + 38;
  const sidebarPadding = isSidebarHidden ? 0 : SIDEBAR_WIDTH;

  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // AI Analysis state
  const [aiVariables, setAiVariables] = useState<AIVariable[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus>('not_started');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const envVarsRef = useRef<EnvVariable[]>([]);

  useEffect(() => {
    envVarsRef.current = envVars;
  }, [envVars]);

  useEffect(() => {
    if (envVars.length > 0 && aiVariables.length > 0) {
      const existingKeys = new Set(envVars.map(v => v.key));
      const filteredAiVars = aiVariables.filter(v => !existingKeys.has(v.key));
      if (filteredAiVars.length !== aiVariables.length) {
        setAiVariables(filteredAiVars);
      }
    }
  }, [envVars, aiVariables.length]);

  const progressWidth = useSharedValue(0);
  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  useEffect(() => {
    loadEnvVariables();
    startAIAnalysis();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [currentWorkstation]);



  const loadEnvVariables = async () => {
    if (!currentWorkstation?.projectId) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${config.apiUrl}/fly/project/${currentWorkstation.projectId}/env`
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

  const startAIAnalysis = async () => {
    if (!currentWorkstation?.projectId) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      setAiStatus('analyzing');
      progressWidth.value = 0;
      // Animate slowly to 95% over 15 seconds to show activity
      progressWidth.value = withTiming(95, { duration: 15000 });

      const response = await fetch(
        `${config.apiUrl}/fly/project/${currentWorkstation.projectId}/env/analyze`,
        {
          method: 'POST',
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        progressWidth.value = withTiming(100, { duration: 300 });
        const data = await response.json();
        const existingKeys = new Set(envVarsRef.current.map(v => v.key));
        const newAiVars = (data.variables || []).filter(
          (v: AIVariable) => !existingKeys.has(v.key)
        );
        setAiVariables(newAiVars);
        setAiStatus('complete');
      } else {
        setAiStatus('error');
        Alert.alert('Errore AI', 'Analisi fallita. Riprova.');
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        Alert.alert('Timeout', 'L\'analisi AI sta impiegando troppo tempo.');
      } else {
        console.error('Error starting AI analysis:', error);
      }
      setAiStatus('error');
    } finally {
      clearTimeout(timeoutId);
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
    try {
      const response = await fetch(
        `${config.apiUrl}/fly/project/${currentWorkstation?.projectId}/env`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    if (!newKey.trim() || !currentWorkstation?.projectId) return;

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
    if (!currentWorkstation?.projectId) return;

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

  const handleAddAIVariable = async (aiVar: AIVariable) => {
    if (!currentWorkstation?.projectId) return;

    const newVar: EnvVariable = {
      key: aiVar.key,
      value: aiVar.existingValue || aiVar.defaultValue || '',
      isSecret: aiVar.isSecret,
      description: aiVar.description,
    };

    const updatedVars = [...envVars, newVar];
    const success = await saveVariables(updatedVars);

    if (success) {
      setAiVariables(prev => prev.filter(v => v.key !== aiVar.key));
    }
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

      {/* AI Analysis Progress */}
      {aiStatus === 'analyzing' && (
        <View style={styles.aiProgress}>
          <View style={styles.aiProgressBar}>
            <Animated.View style={[styles.aiProgressFill, progressAnimatedStyle]} />
          </View>
          <Text style={styles.aiProgressText}>Analisi AI in corso...</Text>
        </View>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={AppColors.primary} />
            <Text style={styles.loadingText}>Caricamento...</Text>
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
                </Animated.View>
              )}

              {envVars.length === 0 ? (
                <Text style={styles.emptyText}>Nessuna variabile configurata</Text>
              ) : (
                envVars.map((variable) => (
                  <View key={variable.key} style={styles.variableItem}>
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
                ))
              )}
            </View>

            {/* AI Suggested Variables */}
            {aiVariables.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.aiSectionTitle}>
                    <Ionicons name="sparkles" size={16} color={AppColors.primary} />
                    <Text style={styles.sectionTitle}>Suggerimenti AI</Text>
                  </View>
                  <Text style={styles.aiCount}>{aiVariables.length}</Text>
                </View>

                {aiVariables.slice(0, 5).map((variable) => (
                  <TouchableOpacity
                    key={variable.key}
                    style={styles.aiVariableItem}
                    onPress={() => handleAddAIVariable(variable)}
                  >
                    <View style={styles.aiVariableContent}>
                      <Text style={styles.aiVariableKey}>{variable.key}</Text>
                      {variable.description && (
                        <Text style={styles.aiVariableDesc}>{variable.description}</Text>
                      )}
                    </View>
                    <Ionicons name="add-circle" size={24} color={AppColors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
  aiProgress: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  aiProgressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  aiProgressFill: {
    height: '100%',
    backgroundColor: AppColors.primary,
    borderRadius: 2,
  },
  aiProgressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
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
  aiSectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiCount: {
    fontSize: 12,
    color: AppColors.primary,
    backgroundColor: 'rgba(155, 138, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  variableItem: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
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
  aiVariableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(155, 138, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(155, 138, 255, 0.1)',
  },
  aiVariableContent: {
    flex: 1,
  },
  aiVariableKey: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  aiVariableDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
});
