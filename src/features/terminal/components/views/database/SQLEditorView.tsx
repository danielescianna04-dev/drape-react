import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, FlatList, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  projectId: string;
  dbPath: string;
  onBack: () => void;
  api: any;
}

export const SQLEditorView: React.FC<Props> = ({ projectId, dbPath, onBack, api }) => {
  const insets = useSafeAreaInsets();
  const [sql, setSql] = useState('SELECT * FROM ');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ rows: any[]; columns: string[]; total?: number; changes?: number; error?: string } | null>(null);

  const handleRun = async () => {
    if (!sql.trim()) return;
    setIsRunning(true);
    setResult(null);
    try {
      const data = await api.executeQuery(dbPath, sql.trim());
      setResult(data);
    } catch (err: any) {
      setResult({ rows: [], columns: [], error: err.message });
    }
    setIsRunning(false);
  };

  const COL_WIDTH = 120;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#8B5CF6" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SQL Editor</Text>
      </View>

      {/* Editor */}
      <View style={styles.editorContainer}>
        <TextInput
          style={styles.editor}
          value={sql}
          onChangeText={setSql}
          multiline
          placeholder="SELECT * FROM ..."
          placeholderTextColor="rgba(255,255,255,0.2)"
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.runBtn, isRunning && { opacity: 0.5 }]}
          onPress={handleRun}
          disabled={isRunning}
        >
          {isRunning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="play" size={14} color="#fff" />
              <Text style={styles.runText}>Run</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Results */}
      {result && (
        <View style={styles.results}>
          {result.error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
              <Text style={styles.errorText}>{result.error}</Text>
            </View>
          ) : result.changes !== undefined ? (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle" size={18} color="#34D399" />
              <Text style={styles.successText}>{result.changes} row{result.changes !== 1 ? 's' : ''} affected</Text>
            </View>
          ) : (
            <>
              <Text style={styles.resultCount}>{result.rows.length} row{result.rows.length !== 1 ? 's' : ''}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
                <View>
                  <View style={styles.headerRow}>
                    {result.columns.map(col => (
                      <View key={col} style={[styles.hCell, { width: COL_WIDTH }]}>
                        <Text style={styles.hCellText} numberOfLines={1}>{col}</Text>
                      </View>
                    ))}
                  </View>
                  <FlatList
                    data={result.rows}
                    keyExtractor={(_, i) => String(i)}
                    renderItem={({ item }) => (
                      <View style={styles.dataRow}>
                        {result.columns.map(col => (
                          <View key={col} style={[styles.dCell, { width: COL_WIDTH }]}>
                            <Text style={styles.dCellText} numberOfLines={1}>
                              {item[col] == null ? 'NULL' : String(item[col])}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  />
                </View>
              </ScrollView>
            </>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  editorContainer: {
    margin: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    overflow: 'hidden',
  },
  editor: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'monospace',
    padding: 14,
    minHeight: 100,
    maxHeight: 180,
  },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#8B5CF6',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  runText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  results: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  resultCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    padding: 12,
    paddingBottom: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    margin: 16,
    borderRadius: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    flex: 1,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    margin: 16,
    borderRadius: 12,
  },
  successText: {
    color: '#34D399',
    fontSize: 13,
  },
  tableScroll: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  hCell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.04)',
  },
  hCellText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  dCell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.03)',
  },
  dCellText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
