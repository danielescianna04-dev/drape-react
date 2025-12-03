import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { config } from '../../../config/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const insets = useSafeAreaInsets();
  const { currentWorkstation } = useTerminalStore();
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasEnvExample, setHasEnvExample] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

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
      const uniqueVars = (data.variables || []).filter(
        (v: EnvVariable, index: number, self: EnvVariable[]) =>
          index === self.findIndex((t) => t.key === v.key)
      );
      setEnvVars(uniqueVars);
      setHasEnvExample(data.hasEnvExample || false);
    } catch (error) {
      console.error('Failed to load env variables:', error);
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variables: envVars }),
        }
      );

      if (!response.ok) throw new Error('Failed to save');
      Alert.alert('Salvato', 'Variabili aggiornate con successo');
    } catch (error) {
      Alert.alert('Errore', 'Impossibile salvare le variabili');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddVariable = () => {
    if (!newKey.trim()) return;
    if (envVars.find(v => v.key === newKey)) {
      Alert.alert('Errore', 'Variabile già esistente');
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
    Alert.alert('Elimina', `Eliminare ${key}?`, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: () => setEnvVars(envVars.filter(v => v.key !== key)) }
    ]);
  };

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0d0d0d', '#000000']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconContainer}>
            <LinearGradient
              colors={['#8B5CF6', '#6366F1']}
              style={styles.headerIconGradient}
            >
              <Ionicons name="key" size={18} color="#fff" />
            </LinearGradient>
          </View>
          <View>
            <Text style={styles.headerTitle}>Environment</Text>
            <Text style={styles.headerSubtitle}>{envVars.length} variabili</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AppColors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.actionButton, showAddForm && styles.actionButtonActive]}
              onPress={() => setShowAddForm(!showAddForm)}
              activeOpacity={0.7}
            >
              <Ionicons name={showAddForm ? "close" : "add"} size={18} color={showAddForm ? "#fff" : AppColors.primary} />
              <Text style={[styles.actionButtonText, showAddForm && styles.actionButtonTextActive]}>
                {showAddForm ? 'Annulla' : 'Nuova'}
              </Text>
            </TouchableOpacity>

            {envVars.length > 0 && (
              <TouchableOpacity
                style={[styles.actionButton, styles.saveActionButton]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.7}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color="#fff" />
                    <Text style={[styles.actionButtonText, styles.actionButtonTextActive]}>Salva</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Add Form */}
          {showAddForm && (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.addForm}>
              <View style={styles.addFormHeader}>
                <Ionicons name="add-circle" size={20} color={AppColors.primary} />
                <Text style={styles.addFormTitle}>Nuova Variabile</Text>
              </View>
              <TextInput
                style={styles.addFormInput}
                placeholder="NOME_VARIABILE"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={newKey}
                onChangeText={setNewKey}
                autoCapitalize="characters"
              />
              <TextInput
                style={styles.addFormInput}
                placeholder="valore"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={newValue}
                onChangeText={setNewValue}
                secureTextEntry
              />
              <TouchableOpacity style={styles.addFormSubmit} onPress={handleAddVariable} activeOpacity={0.8}>
                <LinearGradient colors={['#8B5CF6', '#6366F1']} style={styles.addFormSubmitGradient}>
                  <Text style={styles.addFormSubmitText}>Aggiungi</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Variables List */}
          {envVars.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="folder-open-outline" size={40} color="rgba(255,255,255,0.15)" />
              </View>
              <Text style={styles.emptyTitle}>Nessuna variabile</Text>
              <Text style={styles.emptySubtitle}>Aggiungi la prima variabile d'ambiente</Text>
            </View>
          ) : (
            <View style={styles.variablesList}>
              {envVars.map((envVar, index) => (
                <Animated.View
                  key={`${envVar.key}-${index}`}
                  entering={FadeInDown.delay(index * 50).duration(300)}
                  style={styles.variableCard}
                >
                  <View style={styles.variableCardHeader}>
                    <View style={styles.variableTypeIcon}>
                      <Ionicons
                        name={envVar.isSecret ? "shield-checkmark" : "document-text"}
                        size={14}
                        color={envVar.isSecret ? "#F59E0B" : "#10B981"}
                      />
                    </View>
                    <Text style={styles.variableCardKey} numberOfLines={1}>{envVar.key}</Text>
                    <TouchableOpacity
                      onPress={() => toggleSecretVisibility(envVar.key)}
                      style={styles.visibilityButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={visibleSecrets.has(envVar.key) ? "eye" : "eye-off"}
                        size={16}
                        color="rgba(255,255,255,0.4)"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteVariable(envVar.key)}
                      style={styles.deleteButtonSmall}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  {envVar.description && (
                    <Text style={styles.variableCardDescription}>{envVar.description}</Text>
                  )}
                  <View style={styles.variableInputContainer}>
                    <TextInput
                      style={styles.variableCardInput}
                      value={envVar.value}
                      onChangeText={(value) => handleUpdateVariable(envVar.key, value)}
                      placeholder="..."
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      secureTextEntry={envVar.isSecret && !visibleSecrets.has(envVar.key)}
                    />
                  </View>
                </Animated.View>
              ))}
            </View>
          )}

          {/* Footer Info */}
          <View style={styles.footerInfo}>
            <Ionicons name="information-circle" size={14} color="rgba(255,255,255,0.3)" />
            <Text style={styles.footerInfoText}>
              Le variabili sono salvate nel file .env del progetto
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: 'hidden',
  },
  headerIconGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
  quickActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  actionButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  saveActionButton: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
  },
  actionButtonTextActive: {
    color: '#fff',
  },
  addForm: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  addFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  addFormTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  addFormInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  addFormSubmit: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
  },
  addFormSubmitGradient: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  addFormSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
  },
  variablesList: {
    gap: 10,
  },
  variableCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  variableCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  variableTypeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  variableCardKey: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.2,
  },
  visibilityButton: {
    padding: 4,
  },
  deleteButtonSmall: {
    padding: 4,
  },
  variableCardDescription: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 8,
    marginLeft: 34,
  },
  variableInputContainer: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  variableCardInput: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    color: '#fff',
    fontFamily: 'monospace',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  footerInfoText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
});
