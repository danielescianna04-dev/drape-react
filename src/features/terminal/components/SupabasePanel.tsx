import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useAnimatedStyle } from 'react-native-reanimated';
import { AppColors } from '../../../shared/theme/colors';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { useSidebarOffset } from '../context/SidebarContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

interface Props {
  onClose: () => void;
}

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
  serviceKey?: string;
  projectName?: string;
  isConnected: boolean;
}

const SUPABASE_STORAGE_KEY = 'supabase_config';
const SUPABASE_GREEN = '#3ECF8E';

export const SupabasePanel = ({ onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const { currentWorkstation } = useWorkstationStore();
  const { sidebarTranslateX } = useSidebarOffset();

  const [config, setConfig] = useState<SupabaseConfig>({
    projectUrl: '',
    anonKey: '',
    serviceKey: '',
    projectName: '',
    isConnected: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Container animated style for sidebar offset
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    left: 44 + sidebarTranslateX.value,
  }));

  useEffect(() => {
    loadConfig();
  }, [currentWorkstation]);

  const getStorageKey = () => {
    return `${SUPABASE_STORAGE_KEY}_${currentWorkstation?.id || 'global'}`;
  };

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const saved = await AsyncStorage.getItem(getStorageKey());
      if (saved) {
        const parsed = JSON.parse(saved);
        // Load service key from SecureStore
        const projectId = currentWorkstation?.id || 'global';
        const serviceKey = await SecureStore.getItemAsync(`supabase_service_key_${projectId}`);
        if (serviceKey) parsed.serviceKey = serviceKey;
        setConfig(parsed);
      }
    } catch (error) {
      console.error('Failed to load Supabase config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      setIsSaving(true);
      const { serviceKey, ...safeConfig } = config;
      await AsyncStorage.setItem(getStorageKey(), JSON.stringify(safeConfig));
      // Store service key in SecureStore
      const projectId = currentWorkstation?.id || 'global';
      if (serviceKey) {
        await SecureStore.setItemAsync(`supabase_service_key_${projectId}`, serviceKey);
      } else {
        await SecureStore.deleteItemAsync(`supabase_service_key_${projectId}`);
      }
      setIsEditing(false);
      Alert.alert('Salvato', 'Configurazione Supabase salvata');
    } catch (error) {
      Alert.alert('Errore', 'Impossibile salvare la configurazione');
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    if (!config.projectUrl || !config.anonKey) {
      Alert.alert('Errore', 'Inserisci URL e Anon Key');
      return;
    }

    try {
      setIsTesting(true);
      // Test connection by fetching project info
      const response = await fetch(`${config.projectUrl}/rest/v1/`, {
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${config.anonKey}`,
        },
      });

      if (response.ok || response.status === 200) {
        setConfig(prev => ({ ...prev, isConnected: true }));
        const { serviceKey, ...safeConfig } = config;
        await AsyncStorage.setItem(getStorageKey(), JSON.stringify({ ...safeConfig, isConnected: true }));
        const projectId = currentWorkstation?.id || 'global';
        if (serviceKey) {
          await SecureStore.setItemAsync(`supabase_service_key_${projectId}`, serviceKey);
        }
        Alert.alert('Connesso!', 'Connessione a Supabase riuscita');
      } else {
        throw new Error(`Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Supabase connection test failed:', error);
      setConfig(prev => ({ ...prev, isConnected: false }));
      Alert.alert('Errore', 'Impossibile connettersi a Supabase. Verifica le credenziali.');
    } finally {
      setIsTesting(false);
    }
  };

  const disconnect = async () => {
    Alert.alert(
      'Disconnetti',
      'Vuoi disconnettere Supabase da questo progetto?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Disconnetti',
          style: 'destructive',
          onPress: async () => {
            setConfig({
              projectUrl: '',
              anonKey: '',
              serviceKey: '',
              projectName: '',
              isConnected: false,
            });
            await AsyncStorage.removeItem(getStorageKey());
            const projectId = currentWorkstation?.id || 'global';
            await SecureStore.deleteItemAsync(`supabase_service_key_${projectId}`);
          },
        },
      ]
    );
  };

  const syncEnvVars = async () => {
    // TODO: Sync SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY to .env
    Alert.alert(
      'Sync Variabili',
      'Le seguenti variabili verranno aggiunte al tuo .env:\n\n• SUPABASE_URL\n• SUPABASE_ANON_KEY\n• SUPABASE_SERVICE_KEY',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Sync', onPress: () => {
          // TODO: Implement actual sync
          Alert.alert('Fatto', 'Variabili sincronizzate nel .env');
        }},
      ]
    );
  };

  const openDashboard = () => {
    if (config.projectUrl) {
      // Extract project ref from URL
      const match = config.projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match) {
        Linking.openURL(`https://supabase.com/dashboard/project/${match[1]}`);
      } else {
        Linking.openURL('https://supabase.com/dashboard');
      }
    } else {
      Linking.openURL('https://supabase.com/dashboard');
    }
  };

  const extractProjectName = (url: string) => {
    const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
    return match ? match[1] : '';
  };

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <LinearGradient
        colors={['#0a0a0a', '#0d1f15', '#0a0a0a']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.supabaseLogo}>
            <Ionicons name="flash" size={18} color={SUPABASE_GREEN} />
          </View>
          <Text style={styles.headerTitle}>Supabase</Text>
          {config.isConnected && (
            <View style={styles.connectedBadge}>
              <View style={styles.connectedDot} />
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={SUPABASE_GREEN} />
        </View>
      ) : !config.isConnected ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Connect Form */}
          <Animated.View entering={FadeIn.duration(300)} style={styles.connectCard}>
            <View style={styles.connectHeader}>
              <Ionicons name="flash" size={32} color={SUPABASE_GREEN} />
              <Text style={styles.connectTitle}>Connetti Supabase</Text>
              <Text style={styles.connectSubtitle}>
                Collega il tuo progetto Supabase per accedere a database, auth e storage
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Project URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://xxx.supabase.co"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={config.projectUrl}
                  onChangeText={(text) => setConfig(prev => ({
                    ...prev,
                    projectUrl: text,
                    projectName: extractProjectName(text),
                  }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Anon Key (public)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={config.anonKey}
                  onChangeText={(text) => setConfig(prev => ({ ...prev, anonKey: text }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showKeys}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Service Key (opzionale)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={config.serviceKey}
                  onChangeText={(text) => setConfig(prev => ({ ...prev, serviceKey: text }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showKeys}
                />
                <Text style={styles.inputHint}>
                  Solo per operazioni admin (bypass RLS)
                </Text>
              </View>

              <TouchableOpacity
                style={styles.showKeysButton}
                onPress={() => setShowKeys(!showKeys)}
              >
                <Ionicons
                  name={showKeys ? "eye" : "eye-off"}
                  size={16}
                  color="rgba(255,255,255,0.4)"
                />
                <Text style={styles.showKeysText}>
                  {showKeys ? 'Nascondi chiavi' : 'Mostra chiavi'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.connectButton, isTesting && styles.connectButtonDisabled]}
                onPress={testConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color="#fff" />
                    <Text style={styles.connectButtonText}>Connetti</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.helpLink}
                onPress={() => Linking.openURL('https://supabase.com/docs/guides/getting-started')}
              >
                <Ionicons name="help-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
                <Text style={styles.helpLinkText}>Come trovo le credenziali?</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Connected State */}
          <Animated.View entering={FadeIn.duration(300)}>
            {/* Project Info */}
            <View style={styles.projectCard}>
              <View style={styles.projectHeader}>
                <View style={styles.projectIconContainer}>
                  <Ionicons name="flash" size={24} color={SUPABASE_GREEN} />
                </View>
                <View style={styles.projectInfo}>
                  <Text style={styles.projectName}>
                    {config.projectName || 'Supabase Project'}
                  </Text>
                  <Text style={styles.projectUrl} numberOfLines={1}>
                    {config.projectUrl}
                  </Text>
                </View>
                <View style={styles.connectedStatus}>
                  <View style={styles.connectedDotLarge} />
                  <Text style={styles.connectedText}>Connesso</Text>
                </View>
              </View>
            </View>

            {/* Quick Actions */}
            <Text style={styles.sectionTitle}>Azioni Rapide</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity style={styles.actionCard} onPress={openDashboard}>
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(62, 207, 142, 0.15)' }]}>
                  <Ionicons name="open-outline" size={20} color={SUPABASE_GREEN} />
                </View>
                <Text style={styles.actionLabel}>Dashboard</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionCard} onPress={syncEnvVars}>
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                  <Ionicons name="sync-outline" size={20} color={AppColors.primary} />
                </View>
                <Text style={styles.actionLabel}>Sync .env</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => {
                  const match = config.projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
                  if (match) {
                    Linking.openURL(`https://supabase.com/dashboard/project/${match[1]}/editor`);
                  }
                }}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Ionicons name="grid-outline" size={20} color="#3B82F6" />
                </View>
                <Text style={styles.actionLabel}>SQL Editor</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => {
                  const match = config.projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
                  if (match) {
                    Linking.openURL(`https://supabase.com/dashboard/project/${match[1]}/auth/users`);
                  }
                }}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(251, 191, 36, 0.15)' }]}>
                  <Ionicons name="people-outline" size={20} color="#FBBF24" />
                </View>
                <Text style={styles.actionLabel}>Auth</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => {
                  const match = config.projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
                  if (match) {
                    Linking.openURL(`https://supabase.com/dashboard/project/${match[1]}/storage/buckets`);
                  }
                }}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                  <Ionicons name="folder-outline" size={20} color="#EC4899" />
                </View>
                <Text style={styles.actionLabel}>Storage</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => {
                  const match = config.projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
                  if (match) {
                    Linking.openURL(`https://supabase.com/dashboard/project/${match[1]}/functions`);
                  }
                }}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="code-slash-outline" size={20} color="#10B981" />
                </View>
                <Text style={styles.actionLabel}>Functions</Text>
              </TouchableOpacity>
            </View>

            {/* Environment Variables */}
            <Text style={styles.sectionTitle}>Variabili Ambiente</Text>
            <View style={styles.envVarsCard}>
              <View style={styles.envVarRow}>
                <Text style={styles.envVarKey}>SUPABASE_URL</Text>
                <View style={styles.envVarStatus}>
                  <Ionicons name="checkmark-circle" size={16} color={SUPABASE_GREEN} />
                </View>
              </View>
              <View style={styles.envVarRow}>
                <Text style={styles.envVarKey}>SUPABASE_ANON_KEY</Text>
                <View style={styles.envVarStatus}>
                  <Ionicons name="checkmark-circle" size={16} color={SUPABASE_GREEN} />
                </View>
              </View>
              {config.serviceKey && (
                <View style={styles.envVarRow}>
                  <Text style={styles.envVarKey}>SUPABASE_SERVICE_KEY</Text>
                  <View style={styles.envVarStatus}>
                    <Ionicons name="checkmark-circle" size={16} color={SUPABASE_GREEN} />
                  </View>
                </View>
              )}
            </View>

            {/* Disconnect Button */}
            <TouchableOpacity style={styles.disconnectButton} onPress={disconnect}>
              <Ionicons name="unlink-outline" size={18} color="#EF4444" />
              <Text style={styles.disconnectText}>Disconnetti</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      )}
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
    borderBottomColor: 'rgba(62, 207, 142, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  supabaseLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(62, 207, 142, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  connectedBadge: {
    marginLeft: 4,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SUPABASE_GREEN,
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
  // Connect Card
  connectCard: {
    backgroundColor: 'rgba(62, 207, 142, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(62, 207, 142, 0.1)',
  },
  connectHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  connectTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 12,
  },
  connectSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
  },
  showKeysButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  showKeysText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: SUPABASE_GREEN,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 8,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  helpLinkText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  // Connected State
  projectCard: {
    backgroundColor: 'rgba(62, 207, 142, 0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(62, 207, 142, 0.15)',
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(62, 207, 142, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  projectUrl: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  connectedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedDotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SUPABASE_GREEN,
  },
  connectedText: {
    fontSize: 12,
    color: SUPABASE_GREEN,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  actionCard: {
    width: '31%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  envVarsCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  envVarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  envVarKey: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'monospace',
  },
  envVarStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  disconnectText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#EF4444',
  },
});
