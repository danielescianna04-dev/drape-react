import React, { useReducer, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useWorkstationStore } from '../../../../core/terminal/workstationStore';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { useDatabaseApi } from '../../../../hooks/useDatabaseApi';
import { DatabaseDiscovery } from './database/DatabaseDiscovery';
import { TableListView } from './database/TableListView';
import { TableDataView } from './database/TableDataView';
import { SQLEditorView } from './database/SQLEditorView';
import { SchemaVisualizerView } from './database/SchemaVisualizerView';
import { Tab } from '../../../../core/tabs/tabStore';

type Screen = 'discovering' | 'db-list' | 'table-list' | 'table-data' | 'sql-editor' | 'schema-viz';

interface DbState {
  screen: Screen;
  databases: { path: string; fullPath: string }[];
  pgDetected: boolean;
  supabaseDetected: boolean;
  supabaseUrl: string;
  containerReady: boolean;
  selectedDb: string | null;
  tables: { name: string; rowCount: number }[];
  selectedTable: string | null;
  isLoading: boolean;
  error: string | null;
}

type DbAction =
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_DATABASES'; databases: DbState['databases']; pgDetected: boolean; supabaseDetected?: boolean; supabaseUrl?: string; containerReady: boolean }
  | { type: 'SELECT_DB'; dbPath: string }
  | { type: 'SET_TABLES'; tables: DbState['tables'] }
  | { type: 'SELECT_TABLE'; table: string }
  | { type: 'GO_BACK' }
  | { type: 'GO_TO'; screen: Screen };

function reducer(state: DbState, action: DbAction): DbState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error, isLoading: false };
    case 'SET_DATABASES':
      return {
        ...state,
        databases: action.databases,
        pgDetected: action.pgDetected,
        supabaseDetected: action.supabaseDetected || false,
        supabaseUrl: action.supabaseUrl || '',
        containerReady: action.containerReady,
        screen: action.databases.length === 1 ? 'table-list' : 'db-list',
        selectedDb: action.databases.length === 1 ? action.databases[0].path : null,
        isLoading: false,
        error: null,
      };
    case 'SELECT_DB':
      return { ...state, selectedDb: action.dbPath, screen: 'table-list', tables: [], selectedTable: null };
    case 'SET_TABLES':
      return { ...state, tables: action.tables, isLoading: false };
    case 'SELECT_TABLE':
      return { ...state, selectedTable: action.table, screen: 'table-data' };
    case 'GO_BACK':
      if (state.screen === 'table-data' || state.screen === 'sql-editor' || state.screen === 'schema-viz')
        return { ...state, screen: 'table-list', selectedTable: null };
      if (state.screen === 'table-list')
        return { ...state, screen: 'db-list', selectedDb: null, tables: [] };
      return state;
    case 'GO_TO':
      return { ...state, screen: action.screen };
    default:
      return state;
  }
}

const initialState: DbState = {
  screen: 'discovering',
  databases: [],
  pgDetected: false,
  supabaseDetected: false,
  supabaseUrl: '',
  containerReady: true,
  selectedDb: null,
  tables: [],
  selectedTable: null,
  isLoading: true,
  error: null,
};

interface Props {
  tab: Tab;
}

export const DatabaseView: React.FC<Props> = ({ tab }) => {
  const currentWorkstation = useWorkstationStore(s => s.currentWorkstation);
  const projectId = currentWorkstation?.projectId || currentWorkstation?.id;
  const api = useDatabaseApi(projectId);
  const [state, dispatch] = useReducer(reducer, initialState);

  // Register back handler for VSCodeSidebar floating button
  useEffect(() => {
    const canGoBack = state.screen !== 'discovering' && state.screen !== 'db-list' && state.screen !== 'table-list';
    useUIStore.setState({
      databaseBackHandler: canGoBack ? () => dispatch({ type: 'GO_BACK' }) : null,
    });
    return () => useUIStore.setState({ databaseBackHandler: null });
  }, [state.screen]);

  // Auto-discover on mount
  useEffect(() => {
    if (!projectId) return;
    dispatch({ type: 'SET_LOADING', loading: true });
    api.discover().then(data => {
      dispatch({ type: 'SET_DATABASES', databases: data.databases, pgDetected: data.pgDetected, supabaseDetected: data.supabaseDetected, supabaseUrl: data.supabaseUrl, containerReady: data.containerReady !== false });
    }).catch(() => {
      dispatch({ type: 'SET_DATABASES', databases: [], pgDetected: false, containerReady: false });
    });
  }, [projectId]);

  // Auto-load tables when db is selected
  useEffect(() => {
    if (!state.selectedDb) return;
    dispatch({ type: 'SET_LOADING', loading: true });
    api.getTables(state.selectedDb).then(tables => {
      dispatch({ type: 'SET_TABLES', tables });
    }).catch(err => {
      dispatch({ type: 'SET_ERROR', error: err.message });
    });
  }, [state.selectedDb]);

  // If Neon/Supabase is detected, auto-select it as the database so we enter table list view
  useEffect(() => {
    if (state.supabaseDetected && state.supabaseUrl && !state.isLoading && state.screen === 'db-list') {
      const cloudDb = state.databases.find(d => d.path === '__neon__' || d.path === '__supabase__');
      if (cloudDb) {
        dispatch({ type: 'SELECT_DB', dbPath: cloudDb.path });
      }
    }
  }, [state.supabaseDetected, state.databases, state.isLoading, state.screen]);

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      {(state.screen === 'discovering' || state.screen === 'db-list') && (
        <DatabaseDiscovery
          databases={state.databases}
          pgDetected={state.pgDetected}
          supabaseDetected={state.supabaseDetected}
          supabaseUrl={state.supabaseUrl}
          containerReady={state.containerReady}
          isLoading={state.isLoading}
          error={state.error}
          onSelectDb={(dbPath) => dispatch({ type: 'SELECT_DB', dbPath })}
          onRetry={() => {
            dispatch({ type: 'SET_LOADING', loading: true });
            api.discover().then(data => {
              dispatch({ type: 'SET_DATABASES', databases: data.databases, pgDetected: data.pgDetected, supabaseDetected: data.supabaseDetected, supabaseUrl: data.supabaseUrl, containerReady: data.containerReady !== false });
            }).catch(() => {
              dispatch({ type: 'SET_DATABASES', databases: [], pgDetected: false, containerReady: false });
            });
          }}
        />
      )}
      {state.screen === 'table-list' && state.selectedDb && (
        <TableListView
          tables={state.tables}
          dbPath={state.selectedDb}
          isLoading={state.isLoading}
          onSelectTable={(name) => dispatch({ type: 'SELECT_TABLE', table: name })}
          onBack={() => dispatch({ type: 'GO_BACK' })}
          onOpenSQL={() => dispatch({ type: 'GO_TO', screen: 'sql-editor' })}
          onOpenSchema={() => dispatch({ type: 'GO_TO', screen: 'schema-viz' })}
          showBack={state.databases.length > 1}
        />
      )}
      {state.screen === 'table-data' && state.selectedDb && state.selectedTable && (
        <TableDataView
          projectId={projectId!}
          dbPath={state.selectedDb}
          table={state.selectedTable}
          onBack={() => dispatch({ type: 'GO_BACK' })}
          api={api}
        />
      )}
      {state.screen === 'sql-editor' && state.selectedDb && (
        <SQLEditorView
          projectId={projectId!}
          dbPath={state.selectedDb}
          onBack={() => dispatch({ type: 'GO_BACK' })}
          api={api}
        />
      )}
      {state.screen === 'schema-viz' && state.selectedDb && (
        <SchemaVisualizerView
          projectId={projectId!}
          dbPath={state.selectedDb}
          onBack={() => dispatch({ type: 'GO_BACK' })}
          api={api}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0812',
  },
});
