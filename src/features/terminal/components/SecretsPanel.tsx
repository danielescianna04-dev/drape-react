import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { config } from '../../../config/config';
import { getAuthHeaders } from '../../../core/api/getAuthToken';
import { useSidebarOffset } from '../context/SidebarContext';

interface Props {
  onClose: () => void;
}

interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
  description?: string;
  isUserConfigured?: boolean; // true if user has explicitly configured this
}

interface AIVariable {
  key: string;
  description?: string;
  isSecret: boolean;
  defaultValue?: string;
  existingValue?: string; // Value from existing .env file
}

type AIStatus = 'not_started' | 'analyzing' | 'complete' | 'error';

export const SecretsPanel = ({ onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const { currentWorkstation } = useWorkstationStore();
  const { sidebarTranslateX } = useSidebarOffset();
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showAllAIVars, setShowAllAIVars] = useState(false);
  const [showAllProjectVars, setShowAllProjectVars] = useState(false);

  // AI Analysis state
  const [aiVariables, setAiVariables] = useState<AIVariable[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus>('not_started');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const envVarsRef = useRef<EnvVariable[]>([]);
  const aiStatusRef = useRef<AIStatus>('not_started');

  useEffect(() => {
    envVarsRef.current = envVars;
  }, [envVars]);

  // Filtra aiVariables quando envVars o aiVariables cambiano
  // Rimuove suggerimenti AI per variabili già presenti in envVars
  useEffect(() => {
    if (envVars.length > 0 && aiVariables.length > 0) {
      const existingKeys = new Set(envVars.map(v => v.key));
      const filteredAiVars = aiVariables.filter(v => !existingKeys.has(v.key));
      if (filteredAiVars.length !== aiVariables.length) {
        setAiVariables(filteredAiVars);
      }
    }
  }, [envVars, aiVariables.length]); // Usa .length per evitare loop infiniti

  // Animated progress
  const progressWidth = useSharedValue(0);
  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  // Container animated style for sidebar offset
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    left: 44 + sidebarTranslateX.value,
  }));

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (isMounted) {
        await loadEnvVariables();
      }
      if (isMounted) {
        await startAIAnalysis();
      }
    };

    init();

    return () => {
      isMounted = false;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [currentWorkstation]);

  useEffect(() => {
    let isMounted = true;

    if (aiStatus === 'analyzing') {
      // Start polling for real progress updates
      pollingRef.current = setInterval(() => {
        if (isMounted) {
          checkAIStatus();
        }
      }, 1000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (aiStatus === 'complete' && isMounted) {
        progressWidth.value = withTiming(100, { duration: 300 });
      }
    }

    return () => {
      isMounted = false;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [aiStatus]);

  const loadEnvVariables = async (isMountedRef?: { current: boolean }) => {
    if (!currentWorkstation?.id) {
      setIsLoading(false);
      return;
    }
    try {
      if (!isMountedRef || isMountedRef.current) {
        setIsLoading(true);
      }
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${config.apiUrl}/workstation/${currentWorkstation.id}/env-variables`,
        { headers: authHeaders }
      );
      if (!response.ok) throw new Error('Failed to load');
      const data = await response.json();

      if (!isMountedRef || isMountedRef.current) {
        // Le variabili dal .env esistente vanno in "Configurate" subito
        // ma marcate come "dal progetto" (isUserConfigured = false)
        const existingEnvVars = (data.variables || []).filter(
          (v: EnvVariable, index: number, self: EnvVariable[]) =>
            index === self.findIndex((t) => t.key === v.key)
        );

        // Mostra le variabili esistenti subito nella sezione configurate
        // con un flag che indica che vengono dal .env originale
        const varsWithFlag = existingEnvVars.map((v: EnvVariable) => ({
          ...v,
          isUserConfigured: false, // viene dal .env originale, non configurata dall'utente
        }));
        setEnvVars(varsWithFlag);
      }
    } catch (error) {
      if (!isMountedRef || isMountedRef.current) {
        console.error('Failed to load env variables:', error);
      }
    } finally {
      if (!isMountedRef || isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Ricarica solo le variabili dal progetto (senza mostrare lo spinner di caricamento)
  // Usata quando l'AI completa e vogliamo aggiungere le variabili dal .env
  const reloadProjectVars = async () => {
    if (!currentWorkstation?.id) return;
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${config.apiUrl}/workstation/${currentWorkstation.id}/env-variables`,
        { headers: authHeaders }
      );
      if (!response.ok) return;
      const data = await response.json();

      const existingEnvVars = (data.variables || []).filter(
        (v: EnvVariable, index: number, self: EnvVariable[]) =>
          index === self.findIndex((t) => t.key === v.key)
      );

      if (existingEnvVars.length > 0) {
        // Mantieni le variabili user-configured e aggiungi quelle dal progetto
        setEnvVars(prevVars => {
          const userVars = prevVars.filter(v => v.isUserConfigured === true);
          const newProjectVars = existingEnvVars.map((v: EnvVariable) => ({
            ...v,
            isUserConfigured: false,
          }));
          // Evita duplicati
          const userKeys = new Set(userVars.map(v => v.key));
          const filteredProjectVars = newProjectVars.filter((v: EnvVariable) => !userKeys.has(v.key));
          return [...userVars, ...filteredProjectVars];
        });
      }
    } catch (error) {
      console.error('Failed to reload project vars:', error);
    }
  };

  const startAIAnalysis = async (isMountedRef?: { current: boolean }) => {
    if (!currentWorkstation?.id) return;
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${config.apiUrl}/workstation/${currentWorkstation.id}/env-analyze`,
        { method: 'POST', headers: authHeaders }
      );
      if (response.ok) {
        const data = await response.json();
        if (!isMountedRef || isMountedRef.current) {
          setAiStatus(data.status);
          aiStatusRef.current = data.status;
          if (data.variables) {
            // Filtra le variabili già presenti in envVars
            const existingKeys = new Set(envVarsRef.current.map(v => v.key));
            const filteredVars = data.variables.filter((v: AIVariable) => !existingKeys.has(v.key));
            setAiVariables(filteredVars);
          }
          // Se l'AI è già complete (dalla cache) e non abbiamo variabili dal progetto, ricarichiamole
          if (data.status === 'complete') {
            const projectVars = envVarsRef.current.filter(v => v.isUserConfigured === false);
            if (projectVars.length === 0) {
              setTimeout(() => {
                if (!isMountedRef || isMountedRef.current) {
                  reloadProjectVars();
                }
              }, 500);
            }
          }
        }
      }
    } catch (error) {
      if (!isMountedRef || isMountedRef.current) {
        console.error('Failed to start AI analysis:', error);
      }
    }
  };

  const checkAIStatus = async (isMountedRef?: { current: boolean }) => {
    if (!currentWorkstation?.id) return;
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${config.apiUrl}/workstation/${currentWorkstation.id}/env-analyze/status`,
        { headers: authHeaders }
      );
      if (response.ok) {
        const data = await response.json();
        if (!isMountedRef || isMountedRef.current) {
          const previousStatus = aiStatusRef.current;
          setAiStatus(data.status);
          aiStatusRef.current = data.status;
          // Update progress bar with real progress from backend
          if (data.progress !== undefined) {
            progressWidth.value = withTiming(data.progress, { duration: 300, easing: Easing.out(Easing.ease) });
          }
          if (data.variables) {
            const existingKeys = new Set(envVarsRef.current.map(v => v.key));
            const newAiVars = data.variables.filter((v: AIVariable) => !existingKeys.has(v.key));
            setAiVariables(newAiVars);
          }
          // Quando l'AI completa e non abbiamo variabili dal progetto, ricarichiamole
          // (ora il repo dovrebbe essere clonato e il .env disponibile)
          // Usiamo un delay per assicurarci che il clone sia completato
          if (data.status === 'complete' && previousStatus === 'analyzing') {
            const projectVars = envVarsRef.current.filter(v => v.isUserConfigured === false);
            if (projectVars.length === 0) {
              setTimeout(() => {
                if (!isMountedRef || isMountedRef.current) {
                  reloadProjectVars();
                }
              }, 500);
            }
          }
        }
      }
    } catch (error) {
      if (!isMountedRef || isMountedRef.current) {
        console.error('Failed to check AI status:', error);
      }
    }
  };

  const handleSave = async () => {
    if (!currentWorkstation?.id) return;
    try {
      setIsSaving(true);
      const authHeaders = await getAuthHeaders();
      const response = await fetch(
        `${config.apiUrl}/workstation/${currentWorkstation.id}/env-variables`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ variables: envVars }),
        }
      );
      if (!response.ok) throw new Error('Failed to save');
      Alert.alert('Salvato', 'Variabili salvate nel file .env');
    } catch (error) {
      Alert.alert('Errore', 'Impossibile salvare le variabili');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddVariable = () => {
    if (!newKey.trim()) return;
    if (envVars.find(v => v.key === newKey)) {
      Alert.alert('Errore', 'Variabile gia esistente');
      return;
    }
    setEnvVars([...envVars, { key: newKey, value: newValue, isSecret: true, isUserConfigured: true }]);
    setNewKey('');
    setNewValue('');
    setShowAddForm(false);
  };

  const handleUpdateVariable = (key: string, value: string) => {
    // Quando l'utente modifica una variabile, diventa "user configured"
    setEnvVars(envVars.map(v => v.key === key ? { ...v, value, isUserConfigured: true } : v));
  };

  const handleDeleteVariable = (key: string) => {
    setEnvVars(envVars.filter(v => v.key !== key));
  };

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  };

  const handleAddAIVariable = (aiVar: AIVariable) => {
    if (envVars.find(v => v.key === aiVar.key)) return;
    setEnvVars([...envVars, {
      key: aiVar.key,
      value: aiVar.defaultValue || '',
      isSecret: aiVar.isSecret,
      description: aiVar.description,
      isUserConfigured: true, // Aggiunta dall'utente
    }]);
    setAiVariables(aiVariables.filter(v => v.key !== aiVar.key));
  };

  const handleAddAllAIVariables = () => {
    const existingKeys = new Set(envVars.map(v => v.key));
    const newVars = aiVariables
      .filter(v => !existingKeys.has(v.key))
      .map(v => ({
        key: v.key,
        value: v.defaultValue || '',
        isSecret: v.isSecret,
        description: v.description,
        isUserConfigured: true, // Aggiunta dall'utente
      }));
    setEnvVars([...envVars, ...newVars]);
    setAiVariables([]);
  };

  const totalVars = envVars.length + aiVariables.length;

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <LinearGradient
        colors={['#0a0a0a', '#121212', '#1a1a1a', '#0f0f0f']}
        style={StyleSheet.absoluteFill}
      />
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Secrets</Text>
        <View style={styles.headerRight}>
          {envVars.length > 0 && (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Salva</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Add New Variable - TOP */}
          {showAddForm ? (
            <View style={styles.addForm}>
              <TextInput
                style={styles.addFormInput}
                placeholder="NOME_VARIABILE"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={newKey}
                onChangeText={setNewKey}
                autoCapitalize="characters"
                autoFocus
              />
              <TextInput
                style={styles.addFormInput}
                placeholder="valore"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={newValue}
                onChangeText={setNewValue}
                secureTextEntry
              />
              <View style={styles.addFormActions}>
                <TouchableOpacity
                  style={styles.addFormCancel}
                  onPress={() => {
                    setShowAddForm(false);
                    setNewKey('');
                    setNewValue('');
                  }}
                >
                  <Text style={styles.addFormCancelText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addFormSubmit}
                  onPress={handleAddVariable}
                >
                  <Text style={styles.addFormSubmitText}>Aggiungi</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddForm(true)}
            >
              <Ionicons name="add" size={18} color="rgba(255,255,255,0.4)" />
              <Text style={styles.addButtonText}>Aggiungi variabile</Text>
            </TouchableOpacity>
          )}

          {/* AI Scan Banner */}
          {aiStatus === 'analyzing' && (
            <View style={styles.scanBanner}>
              <View style={styles.scanBannerContent}>
                <ActivityIndicator size="small" color={AppColors.primary} />
                <Text style={styles.scanBannerText}>Scansione codice...</Text>
              </View>
              <View style={styles.scanProgress}>
                <Animated.View style={[styles.scanProgressBar, progressAnimatedStyle]} />
              </View>
            </View>
          )}

          {/* AI Suggestions */}
          {aiVariables.length > 0 && (
            <View style={styles.suggestionsSection}>
              <View style={styles.suggestionHeader}>
                <View style={styles.suggestionTitleRow}>
                  <View style={styles.aiIconBadge}>
                    <Ionicons name="sparkles" size={12} color="#fff" />
                  </View>
                  <Text style={styles.suggestionTitle}>
                    Suggerimenti AI
                  </Text>
                  <View style={styles.suggestionCountBadge}>
                    <Text style={styles.suggestionCountText}>{aiVariables.length}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleAddAllAIVariables}>
                  <Text style={styles.addAllText}>Aggiungi tutte</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.aiSuggestionSubtitle}>
                Variabili rilevate dall'analisi del codice
              </Text>
              {aiVariables.slice(0, 4).map((aiVar) => (
                <TouchableOpacity
                  key={aiVar.key}
                  style={styles.suggestionItem}
                  onPress={() => handleAddAIVariable(aiVar)}
                  activeOpacity={0.6}
                >
                  <View style={styles.suggestionInfo}>
                    <Text style={styles.suggestionKey}>{aiVar.key}</Text>
                    {aiVar.description && (
                      <Text style={styles.suggestionDesc} numberOfLines={1}>{aiVar.description}</Text>
                    )}
                  </View>
                  <Ionicons name="add" size={18} color={AppColors.primary} />
                </TouchableOpacity>
              ))}
              {aiVariables.length > 4 && (
                <TouchableOpacity
                  style={styles.showAllButton}
                  onPress={() => setShowAllAIVars(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.showAllText}>
                    Mostra tutte ({aiVariables.length - 4} altre)
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={AppColors.primary} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* User's Variables (isUserConfigured: true) - Always show first */}
          {envVars.filter(v => v.isUserConfigured === true).length > 0 && (
            <View style={styles.configuredSection}>
              <Text style={styles.sectionTitle}>Le mie variabili</Text>
              {envVars.filter(v => v.isUserConfigured === true).map((envVar) => (
                <View key={envVar.key} style={styles.variableItem}>
                  <View style={styles.variableHeader}>
                    <View style={styles.variableKeyRow}>
                      <Text style={styles.variableKey} numberOfLines={1}>{envVar.key}</Text>
                    </View>
                    <View style={styles.variableActions}>
                      <TouchableOpacity
                        onPress={() => toggleSecretVisibility(envVar.key)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={visibleSecrets.has(envVar.key) ? "eye" : "eye-off"}
                          size={16}
                          color="rgba(255,255,255,0.3)"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteVariable(envVar.key)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.3)" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {envVar.description && (
                    <Text style={styles.variableDesc}>{envVar.description}</Text>
                  )}
                  <TextInput
                    style={styles.variableInput}
                    value={envVar.value}
                    onChangeText={(value) => handleUpdateVariable(envVar.key, value)}
                    placeholder="Inserisci valore..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    secureTextEntry={envVar.isSecret && !visibleSecrets.has(envVar.key)}
                  />
                </View>
              ))}
            </View>
          )}

          {/* Project Variables (isUserConfigured: false) - From .env file */}
          {(() => {
            const projectVars = envVars.filter(v => v.isUserConfigured === false);
            if (projectVars.length === 0) return null;
            return (
              <View style={styles.configuredSection}>
                <View style={styles.suggestionHeader}>
                  <Text style={styles.sectionTitle}>Dal progetto</Text>
                  {projectVars.length > 4 && (
                    <Text style={styles.projectVarsCount}>{projectVars.length} variabili</Text>
                  )}
                </View>
                {projectVars.slice(0, 4).map((envVar) => (
                  <View
                    key={envVar.key}
                    style={[styles.variableItem, styles.variableItemFromProject]}
                  >
                    <View style={styles.variableHeader}>
                      <View style={styles.variableKeyRow}>
                        <Text style={styles.variableKey} numberOfLines={1}>{envVar.key}</Text>
                        <View style={styles.existingBadge}>
                          <Text style={styles.existingBadgeText}>.env</Text>
                        </View>
                      </View>
                      <View style={styles.variableActions}>
                        <TouchableOpacity
                          onPress={() => toggleSecretVisibility(envVar.key)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons
                            name={visibleSecrets.has(envVar.key) ? "eye" : "eye-off"}
                            size={16}
                            color="rgba(255,255,255,0.3)"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteVariable(envVar.key)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.3)" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {envVar.description && (
                      <Text style={styles.variableDesc}>{envVar.description}</Text>
                    )}
                    <TextInput
                      style={styles.variableInput}
                      value={envVar.value}
                      onChangeText={(value) => handleUpdateVariable(envVar.key, value)}
                      placeholder="Inserisci valore..."
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      secureTextEntry={envVar.isSecret && !visibleSecrets.has(envVar.key)}
                    />
                  </View>
                ))}
                {projectVars.length > 4 && (
                  <TouchableOpacity
                    style={styles.showAllButton}
                    onPress={() => setShowAllProjectVars(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.showAllText}>
                      Mostra tutte ({projectVars.length - 4} altre)
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={AppColors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}

          {/* Empty State */}
          {envVars.length === 0 && aiVariables.length === 0 && aiStatus !== 'analyzing' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.emptyState}>
              <Text style={styles.emptyText}>Nessuna variabile trovata</Text>
              <Text style={styles.emptySubtext}>
                Aggiungi manualmente o attendi la scansione AI
              </Text>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* Modal for all AI variables */}
      <Modal
        visible={showAllAIVars}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAllAIVars(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { paddingTop: 16 }]}>
              <Text style={styles.modalTitle}>
                {aiVariables.length} Variabili Trovate
              </Text>
              <TouchableOpacity
                onPress={() => setShowAllAIVars(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + 80 }]}
              showsVerticalScrollIndicator={true}
            >
              {aiVariables.map((aiVar) => (
                <TouchableOpacity
                  key={aiVar.key}
                  style={styles.modalItem}
                  onPress={() => {
                    handleAddAIVariable(aiVar);
                  }}
                  activeOpacity={0.6}
                >
                  <View style={styles.modalItemInfo}>
                    <Text style={styles.modalItemKey}>{aiVar.key}</Text>
                    {aiVar.description && (
                      <Text style={styles.modalItemDesc} numberOfLines={2}>{aiVar.description}</Text>
                    )}
                  </View>
                  <Ionicons name="add-circle" size={22} color={AppColors.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.modalActions, { paddingBottom: insets.bottom + 16 }]}>
              <TouchableOpacity
                style={styles.modalAddAllButton}
                onPress={() => {
                  handleAddAllAIVariables();
                  setShowAllAIVars(false);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-done" size={18} color="#fff" />
                <Text style={styles.modalAddAllText}>Aggiungi tutte</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal for all Project variables */}
      <Modal
        visible={showAllProjectVars}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAllProjectVars(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { paddingTop: 16 }]}>
              <Text style={styles.modalTitle}>
                Variabili dal Progetto
              </Text>
              <TouchableOpacity
                onPress={() => setShowAllProjectVars(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + 20 }]}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {envVars.filter(v => v.isUserConfigured === false).map((envVar) => (
                <View
                  key={envVar.key}
                  style={[styles.variableItem, styles.variableItemFromProject]}
                >
                  <View style={styles.variableHeader}>
                    <View style={styles.variableKeyRow}>
                      <Text style={styles.variableKey} numberOfLines={1}>{envVar.key}</Text>
                      <View style={styles.existingBadge}>
                        <Text style={styles.existingBadgeText}>.env</Text>
                      </View>
                    </View>
                    <View style={styles.variableActions}>
                      <TouchableOpacity
                        onPress={() => toggleSecretVisibility(envVar.key)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={visibleSecrets.has(envVar.key) ? "eye" : "eye-off"}
                          size={16}
                          color="rgba(255,255,255,0.3)"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteVariable(envVar.key)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.3)" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {envVar.description && (
                    <Text style={styles.variableDesc}>{envVar.description}</Text>
                  )}
                  <TextInput
                    style={styles.variableInput}
                    value={envVar.value}
                    onChangeText={(value) => handleUpdateVariable(envVar.key, value)}
                    placeholder="Inserisci valore..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    secureTextEntry={envVar.isSecret && !visibleSecrets.has(envVar.key)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  saveButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: AppColors.primary,
    borderRadius: 6,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // Scan Banner
  scanBanner: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  scanBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanBannerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  scanProgress: {
    height: 2,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 1,
    marginTop: 10,
    overflow: 'hidden',
  },
  scanProgressBar: {
    height: '100%',
    backgroundColor: AppColors.primary,
    borderRadius: 1,
  },
  // Suggestions
  suggestionsSection: {
    marginBottom: 20,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  suggestionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  suggestionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiIconBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
  suggestionCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  aiSuggestionSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 10,
  },
  addAllText: {
    fontSize: 12,
    fontWeight: '500',
    color: AppColors.primary,
  },
  projectVarsCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  suggestionInfo: {
    flex: 1,
    marginRight: 12,
  },
  suggestionKey: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
    fontFamily: 'monospace',
  },
  suggestionDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  suggestionItemExisting: {
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
  },
  suggestionKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  existingBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  existingBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
    textTransform: 'uppercase',
  },
  existingValue: {
    fontSize: 10,
    color: 'rgba(139, 92, 246, 0.7)',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  // Configured Variables
  configuredSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  variableItem: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  variableItemFromProject: {
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    backgroundColor: 'rgba(139, 92, 246, 0.03)',
  },
  variableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  variableKeyRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
  },
  variableKey: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  variableActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  variableDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 8,
  },
  variableInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#fff',
    fontFamily: 'monospace',
  },
  // Add Form
  addForm: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  addFormInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    color: '#fff',
    marginBottom: 8,
  },
  addFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  addFormCancel: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addFormCancelText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  addFormSubmit: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: AppColors.primary,
    borderRadius: 6,
  },
  addFormSubmitText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  // Add Button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
  },
  // Show All Button
  showAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginTop: 4,
  },
  showAllText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.primary,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0f0f0f',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    gap: 8,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 14,
  },
  modalItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  modalItemKey: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    fontFamily: 'monospace',
  },
  modalItemDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 4,
  },
  modalItemExisting: {
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
  },
  modalActions: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  modalAddAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 10,
  },
  modalAddAllText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
