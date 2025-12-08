import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FigmaLogo } from '../../../../shared/components/icons/FigmaLogo';
import { AppColors } from '../../../../shared/theme/colors';

interface Props {
  tab: any;
}

interface FigmaConfig {
  accessToken: string;
  fileUrl?: string;
  fileName?: string;
  fileKey?: string;
  isConnected: boolean;
}

const FIGMA_STORAGE_KEY = 'figma_config';
const FIGMA_PURPLE = '#A259FF';

export const FigmaView = ({ tab }: Props) => {
  const insets = useSafeAreaInsets();
  const { currentWorkstation } = useTerminalStore();

  const [config, setConfig] = useState<FigmaConfig>({
    accessToken: '',
    fileUrl: '',
    fileName: '',
    fileKey: '',
    isConnected: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [currentWorkstation]);

  const getStorageKey = () => {
    return `${FIGMA_STORAGE_KEY}_${currentWorkstation?.id || 'global'}`;
  };

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const saved = await AsyncStorage.getItem(getStorageKey());
      if (saved) {
        setConfig(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load Figma config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const extractFileKey = (url: string): string | null => {
    const match = url.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);
    return match ? match[2] : null;
  };

  const testConnection = async () => {
    if (!config.accessToken) {
      Alert.alert('Errore', 'Inserisci il Personal Access Token');
      return;
    }

    try {
      setIsTesting(true);

      const response = await fetch('https://api.figma.com/v1/me', {
        headers: {
          'X-Figma-Token': config.accessToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Status: ${response.status}`);
      }

      const userData = await response.json();

      let fileName = '';
      let fileKey = '';
      if (config.fileUrl) {
        fileKey = extractFileKey(config.fileUrl) || '';
        if (fileKey) {
          const fileResponse = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
            headers: {
              'X-Figma-Token': config.accessToken,
            },
          });
          if (fileResponse.ok) {
            const fileData = await fileResponse.json();
            fileName = fileData.name || '';
          }
        }
      }

      const newConfig = {
        ...config,
        isConnected: true,
        fileName,
        fileKey,
      };
      setConfig(newConfig);
      await AsyncStorage.setItem(getStorageKey(), JSON.stringify(newConfig));

      Alert.alert('Connesso!', `Ciao ${userData.handle || 'utente'}! Figma connesso.`);
    } catch (error) {
      console.error('Figma connection test failed:', error);
      setConfig(prev => ({ ...prev, isConnected: false }));
      Alert.alert('Errore', 'Token non valido o scaduto. Verifica il tuo Personal Access Token.');
    } finally {
      setIsTesting(false);
    }
  };

  const disconnect = async () => {
    Alert.alert(
      'Disconnetti',
      'Vuoi disconnettere Figma da questo progetto?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Disconnetti',
          style: 'destructive',
          onPress: async () => {
            setConfig({
              accessToken: '',
              fileUrl: '',
              fileName: '',
              fileKey: '',
              isConnected: false,
            });
            await AsyncStorage.removeItem(getStorageKey());
          },
        },
      ]
    );
  };

  const openFigmaFile = () => {
    if (config.fileUrl) {
      Linking.openURL(config.fileUrl);
    } else if (config.fileKey) {
      Linking.openURL(`https://www.figma.com/file/${config.fileKey}`);
    } else {
      Linking.openURL('https://www.figma.com/files/recent');
    }
  };

  const exportDesignTokens = async () => {
    if (!config.fileKey || !config.accessToken) {
      Alert.alert('Errore', 'Collega prima un file Figma');
      return;
    }

    Alert.alert(
      'Export Design Tokens',
      'Questa funzionalita esportera colori, font e spacing dal tuo file Figma in un file theme.ts',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Esporta',
          onPress: () => {
            Alert.alert('Coming Soon', 'Export design tokens in sviluppo');
          },
        },
      ]
    );
  };

  const downloadAssets = async () => {
    if (!config.fileKey || !config.accessToken) {
      Alert.alert('Errore', 'Collega prima un file Figma');
      return;
    }

    Alert.alert(
      'Download Assets',
      'Scarica icone e immagini dal file Figma nella cartella assets/',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => {
            Alert.alert('Coming Soon', 'Download assets in sviluppo');
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      <LinearGradient
        colors={AppColors.gradient.dark}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle glow effects */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={FIGMA_PURPLE} />
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
              <View style={styles.figmaLogoLarge}>
                <FigmaLogo size={32} />
              </View>
              <Text style={styles.connectTitle}>Connetti Figma</Text>
              <Text style={styles.connectSubtitle}>
                Collega il tuo account Figma per sincronizzare design tokens e assets
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Personal Access Token</Text>
                <TextInput
                  style={styles.input}
                  placeholder="figd_xxxxx..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={config.accessToken}
                  onChangeText={(text) => setConfig(prev => ({ ...prev, accessToken: text }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showToken}
                />
                <TouchableOpacity
                  style={styles.showTokenButton}
                  onPress={() => setShowToken(!showToken)}
                >
                  <Ionicons
                    name={showToken ? "eye" : "eye-off"}
                    size={16}
                    color="rgba(255,255,255,0.4)"
                  />
                  <Text style={styles.showTokenText}>
                    {showToken ? 'Nascondi' : 'Mostra'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>File URL (opzionale)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://www.figma.com/file/..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={config.fileUrl}
                  onChangeText={(text) => setConfig(prev => ({ ...prev, fileUrl: text }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Text style={styles.inputHint}>
                  Collega un file specifico per export rapido
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.connectButton, isTesting && styles.connectButtonDisabled]}
                onPress={testConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="color-palette" size={18} color="#fff" />
                    <Text style={styles.connectButtonText}>Connetti</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.helpLink}
                onPress={() => Linking.openURL('https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens')}
              >
                <Ionicons name="help-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
                <Text style={styles.helpLinkText}>Come creo un token?</Text>
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
            {/* File Info */}
            <View style={styles.fileCard}>
              <View style={styles.fileHeader}>
                <View style={styles.fileIconContainer}>
                  <Ionicons name="document" size={24} color={FIGMA_PURPLE} />
                </View>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName}>
                    {config.fileName || 'File Figma'}
                  </Text>
                  {config.fileKey && (
                    <Text style={styles.fileKey} numberOfLines={1}>
                      {config.fileKey}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={openFigmaFile}>
                  <Ionicons name="open-outline" size={20} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Actions */}
            <Text style={styles.sectionTitle}>Azioni</Text>
            <View style={styles.actionsList}>
              <TouchableOpacity style={styles.actionRow} onPress={openFigmaFile}>
                <View style={[styles.actionIconSmall, { backgroundColor: 'rgba(162, 89, 255, 0.15)' }]}>
                  <Ionicons name="open-outline" size={18} color={FIGMA_PURPLE} />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Apri in Figma</Text>
                  <Text style={styles.actionDesc}>Apri il file nel browser</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} onPress={exportDesignTokens}>
                <View style={[styles.actionIconSmall, { backgroundColor: 'rgba(162, 89, 255, 0.15)' }]}>
                  <Ionicons name="color-wand-outline" size={18} color={FIGMA_PURPLE} />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Export Design Tokens</Text>
                  <Text style={styles.actionDesc}>Colori, font, spacing in theme.ts</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionRow} onPress={downloadAssets}>
                <View style={[styles.actionIconSmall, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Ionicons name="download-outline" size={18} color="#3B82F6" />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Download Assets</Text>
                  <Text style={styles.actionDesc}>Icone e immagini in assets/</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  Alert.alert('Coming Soon', 'Inspect componenti in sviluppo');
                }}
              >
                <View style={[styles.actionIconSmall, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="layers-outline" size={18} color="#10B981" />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Inspect Componenti</Text>
                  <Text style={styles.actionDesc}>Visualizza struttura del design</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            </View>

            {/* Change File */}
            <TouchableOpacity
              style={styles.changeFileButton}
              onPress={() => {
                Alert.prompt(
                  'Cambia File',
                  'Inserisci il nuovo URL del file Figma',
                  [
                    { text: 'Annulla', style: 'cancel' },
                    {
                      text: 'Salva',
                      onPress: async (newUrl) => {
                        if (newUrl) {
                          const fileKey = extractFileKey(newUrl);
                          if (fileKey) {
                            try {
                              const response = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
                                headers: { 'X-Figma-Token': config.accessToken },
                              });
                              const data = await response.json();
                              const newConfig = {
                                ...config,
                                fileUrl: newUrl,
                                fileKey,
                                fileName: data.name || '',
                              };
                              setConfig(newConfig);
                              await AsyncStorage.setItem(getStorageKey(), JSON.stringify(newConfig));
                            } catch (e) {
                              setConfig(prev => ({ ...prev, fileUrl: newUrl, fileKey }));
                            }
                          } else {
                            Alert.alert('Errore', 'URL non valido');
                          }
                        }
                      },
                    },
                  ],
                  'plain-text',
                  config.fileUrl
                );
              }}
            >
              <Ionicons name="swap-horizontal-outline" size={16} color="rgba(255,255,255,0.5)" />
              <Text style={styles.changeFileText}>Cambia file</Text>
            </TouchableOpacity>

            {/* Disconnect Button */}
            <TouchableOpacity style={styles.disconnectButton} onPress={disconnect}>
              <Ionicons name="unlink-outline" size={18} color="#EF4444" />
              <Text style={styles.disconnectText}>Disconnetti</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingLeft: 50,
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: AppColors.primaryAlpha.a08,
    opacity: 0.6,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -150,
    right: -80,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: AppColors.primaryAlpha.a05,
    opacity: 0.5,
  },
  figmaLogoLarge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(162, 89, 255, 0.12)',
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
    flexGrow: 1,
    padding: 16,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectCard: {
    backgroundColor: '#1a1a1c',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(162, 89, 255, 0.2)',
    width: '100%',
    maxWidth: 400,
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
  showTokenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  showTokenText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: FIGMA_PURPLE,
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
  fileCard: {
    backgroundColor: 'rgba(162, 89, 255, 0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(162, 89, 255, 0.15)',
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(162, 89, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  fileKey: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  actionsList: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  actionIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  actionDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  changeFileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginBottom: 12,
  },
  changeFileText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
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
