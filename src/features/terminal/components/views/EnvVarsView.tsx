import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../../../shared/theme/colors';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { config } from '../../../../config/config';
import { getAuthHeaders } from '../../../../core/api/getAuthToken';
import { Tab, useTabStore } from '../../../../core/tabs/tabStore';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { useSidebarOffset } from '../../context/SidebarContext';
import { tracciaVarAmbienteAggiunta, tracciaVarAmbienteRimossa } from '../../../../core/services/analyticsService';

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
  const { t } = useTranslation(['terminal', 'common']);
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
  const updateTab = useTabStore((s) => s.updateTab);

  // Data from preview pre-flight or runtime error
  const fromPreview = tab.data?.fromPreview === true;
  const runtimeError: string | undefined = tab.data?.runtimeError;
  const [detectedMissingVars, setDetectedMissingVars] = useState<Array<{ key: string; value: string }>>(
    () => tab.data?.missingVars || [],
  );
  const missingVars = detectedMissingVars;
  const [missingValues, setMissingValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of (tab.data?.missingVars || [])) { init[v.key] = v.value || ''; }
    return init;
  });
  const [isSavingMissing, setIsSavingMissing] = useState(false);

  const projectId = currentWorkstation?.id;
  const activeTabId = useTabStore((s) => s.activeTabId);

  // Helper: get fresh projectId from store (avoids stale closures)
  const getFreshProjectId = () => useTerminalStore.getState().currentWorkstation?.id;

  useEffect(() => {
    // Reset state when switching projects
    setEnvVars([]);
    setDetectedMissingVars([]);
    setMissingValues({});
    setIsLoading(true);
    loadEnvVariables();
  }, [currentWorkstation]);

  // Sync detectedMissingVars when tab.data changes externally (e.g., preflight redirect)
  useEffect(() => {
    const incoming = tab.data?.missingVars;
    if (incoming && incoming.length > 0) {
      setDetectedMissingVars(incoming);
      setMissingValues((prev) => {
        const updated = { ...prev };
        for (const v of incoming) {
          if (!(v.key in updated)) updated[v.key] = v.value || '';
        }
        return updated;
      });
    }
  }, [tab.data?.missingVars]);

  // Re-fetch when this tab becomes active (e.g., user switches back to it)
  useEffect(() => {
    const pid = getFreshProjectId();
    if (activeTabId === tab.id && pid) {
      reloadEnvVars();
    }
  }, [activeTabId]);

  const loadEnvVariables = async () => {
    const pid = getFreshProjectId();
    if (!pid) {
      setIsLoading(false);
      return;
    }

    try {
      const authHeaders = await getAuthHeaders();
      // Fetch configured vars + analyze required vars in parallel
      const [envResponse, analyzeResponse] = await Promise.all([
        fetch(`${config.apiUrl}/fly/project/${pid}/env`, { headers: authHeaders }),
        fetch(`${config.apiUrl}/fly/project/${pid}/env/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
        }).catch(() => null),
      ]);

      // Abort if project changed while fetching
      if (getFreshProjectId() !== pid) return;

      if (envResponse.ok) {
        const data = await envResponse.json();
        const vars: EnvVariable[] = data.variables || [];
        setEnvVars(vars);

        // Auto-detect missing vars if not already provided via tab data
        if (analyzeResponse?.ok) {
          const analyzeData = await analyzeResponse.json();
          const required: Array<{ key: string; value?: string }> = analyzeData.variables || [];
          if (required.length > 0) {
            const existingKeys = new Set(vars.map((v) => v.key));
            const missing = required
              .filter((v) => !existingKeys.has(v.key))
              .map((v) => ({ key: v.key, value: v.value || '' }));
            if (missing.length > 0) {
              setDetectedMissingVars(missing);
              setMissingValues((prev) => {
                const updated = { ...prev };
                for (const v of missing) {
                  if (!(v.key in updated)) updated[v.key] = v.value || '';
                }
                return updated;
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading env vars:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Light reload: just re-fetch configured vars from the .env file (no analyze)
  const reloadEnvVars = async () => {
    const pid = getFreshProjectId();
    if (!pid) return;
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/fly/project/${pid}/env`, { headers: authHeaders });
      // Abort if project changed while fetching
      if (getFreshProjectId() !== pid) return;
      if (response.ok) {
        const data = await response.json();
        setEnvVars(data.variables || []);
      }
    } catch (error) {
      console.error('[EnvVarsView] Error reloading env vars:', error);
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
        // Re-fetch from server to ensure UI matches actual .env file content
        await reloadEnvVars();
        // Refresh any open .env file tab so it shows updated content
        const refreshEnvFileTab = () => {
          const { tabs: allTabs, updateTab: ut } = useTabStore.getState();
          const envFileTab = allTabs.find((t) =>
            t.type === 'file' && (t.data?.filePath === '.env' || t.data?.filePath?.endsWith('/.env')),
          );
          if (envFileTab) {
            ut(envFileTab.id, { data: { ...envFileTab.data, refreshKey: Date.now() } });
          }
        };
        refreshEnvFileTab();
        setTimeout(refreshEnvFileTab, 600);
        return true;
      }
    } catch (error) {
      console.error('Error saving variables:', error);
      Alert.alert(t('common:error'), t('common:envVarSaveFailed'));
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
      tracciaVarAmbienteAggiunta(newKey.trim());
      setNewKey('');
      setNewValue('');
      setShowAddForm(false);
    }
  };

  const handleDeleteVariable = async (key: string) => {
    if (!projectId) return;

    Alert.alert(
      t('common:deleteVariableTitle'),
      t('common:deleteVariableMessage', { key }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:delete'),
          style: 'destructive',
          onPress: async () => {
            tracciaVarAmbienteRimossa(key);
            const updatedVars = envVars.filter(v => v.key !== key);
            await saveVariables(updatedVars);
          },
        },
      ]
    );
  };

  const handleSaveMissingVars = useCallback(async () => {
    if (!projectId) return;
    setIsSavingMissing(true);
    try {
      const newVars: EnvVariable[] = missingVars.map((v) => ({
        key: v.key,
        value: missingValues[v.key] || '',
        isSecret: v.key.toLowerCase().includes('key') ||
          v.key.toLowerCase().includes('secret') ||
          v.key.toLowerCase().includes('token') ||
          v.key.toLowerCase().includes('password'),
      }));
      const updatedVars = [...envVars, ...newVars.filter((nv) => !envVars.find((ev) => ev.key === nv.key))];
      const success = await saveVariables(updatedVars);
      if (success) {
        // Clear banners and detected missing vars
        setDetectedMissingVars([]);
        updateTab(tab.id, { data: {} });
      }
    } finally {
      setIsSavingMissing(false);
    }
  }, [projectId, missingVars, missingValues, envVars, saveVariables, updateTab, tab.id]);

  // Open preview (used by "Retry Preview" and "Start Anyway")
  const openPreview = useCallback((skipPreflight = false) => {
    if (skipPreflight) {
      useUIStore.getState().setSkipNextPreflight(true);
      // Keep missingVars with user-typed values so they persist across navigations
      const varsWithValues = missingVars.map((v) => ({
        key: v.key,
        value: missingValues[v.key] || v.value || '',
      }));
      updateTab(tab.id, { data: { missingVars: varsWithValues, fromPreview: true } });
    } else {
      updateTab(tab.id, { data: {} }); // clear banner
    }
    useUIStore.getState().setOpenPreviewRequested(true);
  }, [updateTab, tab.id, missingVars, missingValues]);

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <LinearGradient
        colors={AppColors.gradient.dark}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Header — full width so border goes edge to edge */}
      <View style={styles.header}>
        <View style={[styles.headerLeft, { paddingLeft: sidebarPadding }]}>
          <Ionicons name="key" size={24} color={AppColors.primary} />
          <Text style={styles.headerTitle}>{t('common:envVariables')}</Text>
        </View>
      </View>

      <ScrollView style={[styles.content, { paddingLeft: sidebarPadding + 20 }]} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={AppColors.primary} />
            <Text style={styles.loadingText}>{t('common:loading')}</Text>
          </View>
        ) : !projectId ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="alert-circle-outline" size={32} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>{t('terminal:envVars.openProject')}</Text>
          </View>
        ) : (
          <>
            {/* Runtime error banner (red) - shown when preview failed due to env vars */}
            {fromPreview && runtimeError && (
              <Animated.View entering={FadeIn} style={styles.errorBanner}>
                <View style={styles.missingBannerHeader}>
                  <Ionicons name="close-circle" size={22} color="#FF6B6B" />
                  <Text style={styles.errorBannerTitle}>
                    {t('terminal:envVars.runtimeErrorTitle')}
                  </Text>
                </View>
                <Text style={styles.missingBannerText}>
                  {t('terminal:envVars.runtimeErrorDescription')}
                </Text>
                <View style={styles.errorMessageBox}>
                  <Text style={styles.errorMessageText} numberOfLines={4}>{runtimeError}</Text>
                </View>
                {/* Show missing vars inputs inside the error banner */}
                {missingVars.length > 0 && missingVars.map((v) => (
                  <View key={v.key} style={styles.missingVarRow}>
                    <Text style={styles.missingVarKey}>{v.key}</Text>
                    <TextInput
                      style={styles.missingVarInput}
                      placeholder={t('common:enterValue')}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={missingValues[v.key] || ''}
                      onChangeText={(text) => setMissingValues((prev) => ({ ...prev, [v.key]: text }))}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ))}
                {missingVars.length > 0 ? (
                  <>
                    <TouchableOpacity
                      style={[styles.missingBannerSaveBtn, isSavingMissing && { opacity: 0.6 }]}
                      onPress={handleSaveMissingVars}
                      disabled={isSavingMissing}
                    >
                      <Ionicons name="save-outline" size={18} color="#fff" />
                      <Text style={styles.missingBannerSaveBtnText}>
                        {isSavingMissing ? t('common:saving') : t('terminal:envVars.saveAndStart')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.startAnywayBtn}
                      onPress={() => openPreview(true)}
                    >
                      <Text style={styles.startAnywayText}>
                        {t('terminal:envVars.retryPreview')}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.missingBannerSaveBtn}
                    onPress={() => openPreview(false)}
                  >
                    <Ionicons name="refresh" size={18} color="#fff" />
                    <Text style={styles.missingBannerSaveBtnText}>
                      {t('terminal:envVars.retryPreview')}
                    </Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            )}

            {/* Missing vars banner - shown from preflight or auto-detected on mount */}
            {!runtimeError && missingVars.length > 0 && (
              <Animated.View entering={FadeIn} style={styles.missingBanner}>
                <View style={styles.missingBannerHeader}>
                  <Ionicons name="alert-circle" size={22} color="#FFB84D" />
                  <Text style={styles.missingBannerTitle}>
                    {t('terminal:envVars.missingTitle')}
                  </Text>
                </View>
                <Text style={styles.missingBannerText}>
                  {t('terminal:envVars.missingDescription', { count: missingVars.length })}
                </Text>
                {missingVars.map((v) => (
                  <View key={v.key} style={styles.missingVarRow}>
                    <Text style={styles.missingVarKey}>{v.key}</Text>
                    <TextInput
                      style={styles.missingVarInput}
                      placeholder={t('common:enterValue')}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={missingValues[v.key] || ''}
                      onChangeText={(text) => setMissingValues((prev) => ({ ...prev, [v.key]: text }))}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.missingBannerSaveBtn, isSavingMissing && { opacity: 0.6 }]}
                  onPress={handleSaveMissingVars}
                  disabled={isSavingMissing}
                >
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.missingBannerSaveBtnText}>
                    {isSavingMissing
                      ? t('common:saving')
                      : t('terminal:envVars.saveAndStart')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.startAnywayBtn}
                  onPress={() => openPreview(true)}
                >
                  <Text style={styles.startAnywayText}>
                    {t('terminal:envVars.startAnyway')}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Current Variables */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('terminal:envVars.configuredVariables')}</Text>
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
                      placeholder={t('terminal:envVars.variableNamePlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={newKey}
                      onChangeText={setNewKey}
                      autoCapitalize="characters"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={t('common:enterValue')}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={newValue}
                      onChangeText={setNewValue}
                      secureTextEntry
                    />
                    <TouchableOpacity style={styles.saveButton} onPress={handleAddVariable}>
                      <Text style={styles.saveButtonText}>{t('common:add')}</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}

              {envVars.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="key-outline" size={28} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyText}>{t('terminal:envVars.noneConfigured')}</Text>
                  <Text style={styles.emptySubtext}>{t('terminal:envVars.tapPlus')}</Text>
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
                          : variable.value || `(${t('terminal:envVars.emptyValue')})`}
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
    backgroundColor: '#07070B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.2)',
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
  missingBanner: {
    marginTop: 20,
    backgroundColor: 'rgba(255, 184, 77, 0.08)',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 77, 0.2)',
    gap: 12,
  },
  missingBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  missingBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFB84D',
  },
  missingBannerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
  },
  missingVarRow: {
    gap: 6,
  },
  missingVarKey: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
    fontFamily: 'monospace',
  },
  missingVarInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 10,
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  missingBannerSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
  },
  missingBannerSaveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  startAnywayBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  startAnywayText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  errorBanner: {
    marginTop: 20,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.2)',
    gap: 12,
  },
  errorBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  errorMessageBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 10,
  },
  errorMessageText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});
