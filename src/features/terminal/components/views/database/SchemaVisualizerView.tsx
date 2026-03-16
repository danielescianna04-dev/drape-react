import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SchemaTable {
  name: string;
  columns: { cid: number; name: string; type: string; notnull: number; pk: number }[];
  foreignKeys: { table: string; from: string; to: string }[];
  rowCount: number;
}

interface Props {
  projectId: string;
  dbPath: string;
  onBack: () => void;
  api: any;
}

export const SchemaVisualizerView: React.FC<Props> = ({ projectId, dbPath, onBack, api }) => {
  const insets = useSafeAreaInsets();
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSchema(dbPath).then((data: SchemaTable[]) => {
      setSchema(data);
      setIsLoading(false);
    }).catch((err: any) => {
      setError(err.message);
      setIsLoading(false);
    });
  }, [dbPath]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#8B5CF6" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Schema</Text>
        <Text style={styles.headerSubtitle}>{schema.length} tables</Text>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {schema.map((table, ti) => (
            <View key={ti} style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Ionicons name="grid-outline" size={16} color="#8B5CF6" />
                <Text style={styles.tableName}>{table.name}</Text>
                <Text style={styles.tableCount}>{table.rowCount}</Text>
              </View>
              {table.columns.map((col, ci) => {
                const fk = table.foreignKeys.find(f => f.from === col.name);
                return (
                  <View key={ci} style={styles.colRow}>
                    <View style={styles.colIcons}>
                      {col.pk ? (
                        <Ionicons name="key" size={12} color="#FBBF24" />
                      ) : fk ? (
                        <Ionicons name="link" size={12} color="#60A5FA" />
                      ) : (
                        <View style={{ width: 12 }} />
                      )}
                    </View>
                    <Text style={styles.colName}>{col.name}</Text>
                    <Text style={styles.colType}>{col.type || 'ANY'}</Text>
                    {col.notnull ? <Text style={styles.colConstraint}>NOT NULL</Text> : null}
                    {fk && <Text style={styles.colFk}>→ {fk.table}.{fk.to}</Text>}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  errorText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  tableCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tableName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  tableCount: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  colRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.02)',
    gap: 8,
  },
  colIcons: {
    width: 16,
    alignItems: 'center',
  },
  colName: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontFamily: 'monospace',
    flex: 1,
  },
  colType: {
    color: 'rgba(139, 92, 246, 0.7)',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  colConstraint: {
    color: 'rgba(251, 191, 36, 0.6)',
    fontSize: 9,
    fontWeight: '600',
  },
  colFk: {
    color: 'rgba(96, 165, 250, 0.7)',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
