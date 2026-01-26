import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { Button } from '../../../../shared/components/atoms/Button';
import { Input } from '../../../../shared/components/atoms/Input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import AsyncStorage from '@react-native-async-storage/async-storage';


interface Props {
  tab: any;
}

interface SupabaseConfig {
  projectUrl: string;
  anonKey: string;
  serviceKey?: string;
  projectName?: string;
  isConnected: boolean;
}

interface TableInfo {
  name: string;
  schema: string;
  rowCount?: number;
}

interface TableData {
  columns: string[];
  rows: any[];
}

const SUPABASE_STORAGE_KEY = 'supabase_config';
const SUPABASE_GREEN = '#3ECF8E';

export const SupabaseView = ({ tab }: Props) => {
  const insets = useSafeAreaInsets();
  const { currentWorkstation } = useTerminalStore();

  const [config, setConfig] = useState<SupabaseConfig>({
    projectUrl: 'https://demo-project.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    projectName: 'demo-project',
    isConnected: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  // Database state
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Navigation state
  type TabSection = 'tables' | 'sql' | 'auth' | 'storage';
  const [activeSection, setActiveSection] = useState<TabSection>('tables');

  const tabItems: { id: TabSection; label: string; icon: string }[] = [
    { id: 'tables', label: 'Tables', icon: 'grid-outline' },
    { id: 'sql', label: 'SQL', icon: 'code-slash-outline' },
    { id: 'auth', label: 'Auth', icon: 'lock-closed-outline' },
    { id: 'storage', label: 'Storage', icon: 'folder-outline' },
  ];

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
        setConfig(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load Supabase config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      await AsyncStorage.setItem(getStorageKey(), JSON.stringify(config));
      Alert.alert('Salvato', 'Configurazione Supabase salvata');
    } catch (error) {
      Alert.alert('Errore', 'Impossibile salvare la configurazione');
    }
  };

  const testConnection = async () => {
    if (!config.projectUrl || !config.anonKey) {
      Alert.alert('Errore', 'Inserisci URL e Anon Key');
      return;
    }

    try {
      setIsTesting(true);
      const response = await fetch(`${config.projectUrl}/rest/v1/`, {
        headers: {
          'apikey': config.anonKey,
          'Authorization': `Bearer ${config.anonKey}`,
        },
      });

      if (response.ok || response.status === 200) {
        setConfig(prev => ({ ...prev, isConnected: true }));
        await AsyncStorage.setItem(getStorageKey(), JSON.stringify({ ...config, isConnected: true }));
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
          },
        },
      ]
    );
  };

  const openDashboard = () => {
    if (config.projectUrl) {
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

  // Fetch tables from Supabase
  const fetchTables = async () => {
    if (!config.projectUrl || !config.anonKey) return;

    try {
      setIsLoadingTables(true);
      // Use mock data for demo
      setTables([
        { name: 'users', schema: 'public', rowCount: 156 },
        { name: 'posts', schema: 'public', rowCount: 2340 },
        { name: 'comments', schema: 'public', rowCount: 8721 },
        { name: 'categories', schema: 'public', rowCount: 12 },
        { name: 'settings', schema: 'public', rowCount: 1 },
      ]);
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    } finally {
      setIsLoadingTables(false);
    }
  };

  // Fetch data from a specific table
  const fetchTableData = async (tableName: string) => {
    try {
      setIsLoadingData(true);
      setSelectedTable(tableName);
      setTableData(getMockDataForTable(tableName));
    } catch (error) {
      console.error('Failed to fetch table data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  // Mock data for demo
  const getMockDataForTable = (tableName: string): TableData => {
    switch (tableName) {
      case 'users':
        return {
          columns: ['id', 'email', 'name', 'created_at'],
          rows: [
            { id: 1, email: 'mario@example.com', name: 'Mario Rossi', created_at: '2024-01-15' },
            { id: 2, email: 'luigi@example.com', name: 'Luigi Verdi', created_at: '2024-01-16' },
            { id: 3, email: 'anna@example.com', name: 'Anna Bianchi', created_at: '2024-01-17' },
          ],
        };
      case 'posts':
        return {
          columns: ['id', 'title', 'user_id', 'status'],
          rows: [
            { id: 1, title: 'Primo post', user_id: 1, status: 'published' },
            { id: 2, title: 'Secondo post', user_id: 2, status: 'draft' },
            { id: 3, title: 'Terzo post', user_id: 1, status: 'published' },
          ],
        };
      default:
        return {
          columns: ['id', 'name', 'value'],
          rows: [
            { id: 1, name: 'Item 1', value: 'Value 1' },
            { id: 2, name: 'Item 2', value: 'Value 2' },
          ],
        };
    }
  };

  // Load tables when connected
  useEffect(() => {
    if (config.isConnected) {
      fetchTables();
    }
  }, [config.isConnected]);

  // Top padding: safe area + TabBar height (38px)
  const topPadding = insets.top + 38;

  const renderConnectForm = () => {
    const formContent = (
      <View style={styles.connectInner}>
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
            <Input
              placeholder="https://xxx.supabase.co"
              value={config.projectUrl}
              onChangeText={(text) => setConfig(prev => ({
                ...prev,
                projectUrl: text,
                projectName: extractProjectName(text),
              }))}
              keyboardType="url"
              style={{ marginBottom: 0 }}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Anon Key (public)</Text>
            <Input
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              value={config.anonKey}
              onChangeText={(text) => setConfig(prev => ({ ...prev, anonKey: text }))}
              secureTextEntry={!showKeys}
              style={{ marginBottom: 0 }}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Service Key (opzionale)</Text>
            <Input
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              value={config.serviceKey}
              onChangeText={(text) => setConfig(prev => ({ ...prev, serviceKey: text }))}
              secureTextEntry={!showKeys}
              style={{ marginBottom: 0 }}
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

          <Button
            label={isTesting ? "" : "Connetti"}
            onPress={testConnection}
            disabled={isTesting}
            variant="primary"
            style={{ marginTop: 8 }}
          />

          <TouchableOpacity
            style={styles.helpLink}
            onPress={() => Linking.openURL('https://supabase.com/docs/guides/getting-started')}
          >
            <Ionicons name="help-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
            <Text style={styles.helpLinkText}>Come trovo le credenziali?</Text>
          </TouchableOpacity>
        </View>
      </View>
    );

    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.connectCard}>
        {isLiquidGlassSupported ? (
          <LiquidGlassView
            style={{ backgroundColor: 'transparent', borderRadius: 16, overflow: 'hidden' }}
            interactive={true}
            effect="clear"
            colorScheme="dark"
          >
            {formContent}
          </LiquidGlassView>
        ) : (
          formContent
        )}
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
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
          {renderConnectForm()}
        </ScrollView>
      ) : (
        <View style={styles.connectedContainer}>
          {/* Project header */}
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={[styles.projectHeader, { backgroundColor: 'transparent' }]}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              <View style={styles.projectHeaderInner}>
                <View style={styles.projectIconSmall}>
                  <Ionicons name="flash" size={16} color={SUPABASE_GREEN} />
                </View>
                <Text style={styles.projectNameSmall} numberOfLines={1}>{config.projectName}</Text>
                <TouchableOpacity onPress={openDashboard} style={styles.headerBtn}>
                  <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
            </LiquidGlassView>
          ) : (
            <View style={styles.projectHeader}>
              <View style={styles.projectIconSmall}>
                <Ionicons name="flash" size={16} color={SUPABASE_GREEN} />
              </View>
              <Text style={styles.projectNameSmall} numberOfLines={1}>{config.projectName}</Text>
              <TouchableOpacity onPress={openDashboard} style={styles.headerBtn}>
                <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
          )}

          {/* Horizontal scrollable tabs */}
          <View style={styles.tabBar}>
            {isLiquidGlassSupported ? (
              <LiquidGlassView
                style={{ backgroundColor: 'transparent' }}
                interactive={true}
                effect="clear"
                colorScheme="dark"
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabBarContent}
                >
                  {tabItems.map((tabItem) => (
                    <TouchableOpacity
                      key={tabItem.id}
                      style={[styles.tabItem, activeSection === tabItem.id && styles.tabItemActive]}
                      onPress={() => setActiveSection(tabItem.id)}
                    >
                      <Ionicons
                        name={tabItem.icon as any}
                        size={16}
                        color={activeSection === tabItem.id ? SUPABASE_GREEN : 'rgba(255,255,255,0.5)'}
                      />
                      <Text style={[styles.tabLabel, activeSection === tabItem.id && styles.tabLabelActive]}>
                        {tabItem.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </LiquidGlassView>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabBarContent}
              >
                {tabItems.map((tabItem) => (
                  <TouchableOpacity
                    key={tabItem.id}
                    style={[styles.tabItem, activeSection === tabItem.id && styles.tabItemActive]}
                    onPress={() => setActiveSection(tabItem.id)}
                  >
                    <Ionicons
                      name={tabItem.icon as any}
                      size={16}
                      color={activeSection === tabItem.id ? SUPABASE_GREEN : 'rgba(255,255,255,0.5)'}
                    />
                    <Text style={[styles.tabLabel, activeSection === tabItem.id && styles.tabLabelActive]}>
                      {tabItem.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Content area */}
          <View style={styles.contentArea}>
            {/* Tables View */}
            {activeSection === 'tables' && (
              <View style={styles.tablesContainer}>
                <View style={styles.tablesListHeader}>
                  <Text style={styles.tablesListTitle}>Tables</Text>
                  <TouchableOpacity onPress={fetchTables} style={styles.refreshBtn}>
                    <Ionicons name="refresh-outline" size={16} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                </View>

                {isLoadingTables ? (
                  <View style={styles.loadingCenter}>
                    <ActivityIndicator size="small" color={SUPABASE_GREEN} />
                  </View>
                ) : !selectedTable ? (
                  <ScrollView showsVerticalScrollIndicator={false} style={styles.tablesList}>
                    {tables.map((table) => {
                      const cardContent = (
                        <View style={styles.tableCardInner}>
                          <View style={styles.tableCardIcon}>
                            <Ionicons name="grid-outline" size={18} color={SUPABASE_GREEN} />
                          </View>
                          <View style={styles.tableCardInfo}>
                            <Text style={styles.tableCardName}>{table.name}</Text>
                            <Text style={styles.tableCardRows}>{table.rowCount} rows</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                        </View>
                      );

                      return (
                        <TouchableOpacity
                          key={table.name}
                          style={styles.tableCard}
                          onPress={() => fetchTableData(table.name)}
                        >
                          {isLiquidGlassSupported ? (
                            <LiquidGlassView
                              style={{ backgroundColor: 'transparent', borderRadius: 12, overflow: 'hidden' }}
                              interactive={true}
                              effect="clear"
                              colorScheme="dark"
                            >
                              {cardContent}
                            </LiquidGlassView>
                          ) : (
                            cardContent
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View style={styles.tableDataView}>
                    <TouchableOpacity
                      style={styles.tableBackHeader}
                      onPress={() => { setSelectedTable(null); setTableData(null); }}
                    >
                      <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.tableBackTitle}>{selectedTable}</Text>
                      <Text style={styles.tableBackCount}>{tableData?.rows.length || 0} rows</Text>
                    </TouchableOpacity>

                    {isLoadingData ? (
                      <View style={styles.loadingCenter}>
                        <ActivityIndicator size="large" color={SUPABASE_GREEN} />
                      </View>
                    ) : tableData ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                        <View>
                          <View style={styles.columnHeaders}>
                            {tableData.columns.map((col) => (
                              <View key={col} style={styles.columnHeader}>
                                <Text style={styles.columnHeaderText}>{col}</Text>
                              </View>
                            ))}
                          </View>
                          <ScrollView showsVerticalScrollIndicator={false}>
                            {tableData.rows.map((row, i) => (
                              <View key={i} style={[styles.dataRow, i % 2 === 1 && styles.dataRowAlt]}>
                                {tableData.columns.map((col) => (
                                  <View key={col} style={styles.dataCell}>
                                    <Text style={styles.dataCellText} numberOfLines={1}>{row[col]?.toString() || 'null'}</Text>
                                  </View>
                                ))}
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      </ScrollView>
                    ) : null}
                  </View>
                )}
              </View>
            )}

            {/* SQL Editor */}
            {activeSection === 'sql' && (
              <View style={styles.sectionContent}>
                <View style={styles.comingSoon}>
                  <Ionicons name="code-slash-outline" size={48} color="rgba(255,255,255,0.1)" />
                  <Text style={styles.comingSoonText}>SQL Editor</Text>
                  <Text style={styles.comingSoonSubtext}>Execute SQL queries directly</Text>
                  <TouchableOpacity
                    style={styles.openBrowserBtn}
                    onPress={() => {
                      const match = config.projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
                      if (match) Linking.openURL(`https://supabase.com/dashboard/project/${match[1]}/sql`);
                    }}
                  >
                    <Text style={styles.openBrowserBtnText}>Open in Browser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Auth */}
            {activeSection === 'auth' && (
              <View style={styles.sectionContent}>
                <View style={styles.comingSoon}>
                  <Ionicons name="lock-closed-outline" size={48} color="rgba(255,255,255,0.1)" />
                  <Text style={styles.comingSoonText}>Authentication</Text>
                  <Text style={styles.comingSoonSubtext}>Manage users and auth providers</Text>
                  <TouchableOpacity
                    style={styles.openBrowserBtn}
                    onPress={() => {
                      const match = config.projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
                      if (match) Linking.openURL(`https://supabase.com/dashboard/project/${match[1]}/auth/users`);
                    }}
                  >
                    <Text style={styles.openBrowserBtnText}>Open in Browser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Storage */}
            {activeSection === 'storage' && (
              <View style={styles.sectionContent}>
                <View style={styles.comingSoon}>
                  <Ionicons name="folder-outline" size={48} color="rgba(255,255,255,0.1)" />
                  <Text style={styles.comingSoonText}>Storage Buckets</Text>
                  <Text style={styles.comingSoonSubtext}>Manage files and buckets</Text>
                  <TouchableOpacity
                    style={styles.openBrowserBtn}
                    onPress={() => {
                      const match = config.projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
                      if (match) Linking.openURL(`https://supabase.com/dashboard/project/${match[1]}/storage/buckets`);
                    }}
                  >
                    <Text style={styles.openBrowserBtnText}>Open in Browser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0f',
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
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectCard: {
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
  },
  connectInner: {
    backgroundColor: 'rgba(26, 26, 28, 0.4)',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(62, 207, 142, 0.2)',
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
  // Connected state
  connectedContainer: {
    flex: 1,
  },
  projectHeader: {
    backgroundColor: 'transparent',
  },
  projectHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  projectIconSmall: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(62, 207, 142, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectNameSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  headerBtn: {
    padding: 6,
  },
  // Horizontal tab bar
  tabBar: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tabBarContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 4,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  tabItemActive: {
    backgroundColor: 'rgba(62, 207, 142, 0.15)',
  },
  tabLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: SUPABASE_GREEN,
  },
  // Content area
  contentArea: {
    flex: 1,
  },
  // Tables view
  tablesContainer: {
    flex: 1,
  },
  tablesListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tablesListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  refreshBtn: {
    padding: 4,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tablesList: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  tableCard: {
    marginBottom: 8,
    borderRadius: 12,
  },
  tableCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tableCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(62, 207, 142, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  tableCardName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  tableCardRows: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  tableDataView: {
    flex: 1,
  },
  tableBackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  tableBackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  tableBackCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  columnHeaders: {
    flexDirection: 'row',
    backgroundColor: 'rgba(62, 207, 142, 0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 207, 142, 0.15)',
  },
  columnHeader: {
    width: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  columnHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: SUPABASE_GREEN,
    textTransform: 'uppercase',
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  dataRowAlt: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  dataCell: {
    width: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dataCellText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'monospace',
  },
  // Section content
  sectionContent: {
    flex: 1,
    padding: 24,
  },
  // Coming soon placeholder
  comingSoon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonText: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    marginTop: 16,
  },
  comingSoonSubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 4,
  },
  openBrowserBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: SUPABASE_GREEN,
    borderRadius: 8,
  },
  openBrowserBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
});
