import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  tables: { name: string; rowCount: number }[];
  dbPath: string;
  isLoading: boolean;
  onSelectTable: (name: string) => void;
  onBack: () => void;
  onOpenSQL: () => void;
  onOpenSchema: () => void;
  showBack: boolean;
}

export const TableListView: React.FC<Props> = ({ tables, dbPath, isLoading, onSelectTable, onBack, onOpenSQL, onOpenSchema, showBack }) => {
  const insets = useSafeAreaInsets();
  const dbName = dbPath.split('/').pop() || dbPath;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {showBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#8B5CF6" />
          </TouchableOpacity>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{dbName}</Text>
          <Text style={styles.headerSubtitle}>{tables.length} table{tables.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpenSQL}>
          <Ionicons name="code-slash-outline" size={16} color="#8B5CF6" />
          <Text style={styles.actionText}>SQL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpenSchema}>
          <Ionicons name="git-network-outline" size={16} color="#8B5CF6" />
          <Text style={styles.actionText}>Schema</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#8B5CF6" />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {tables.map((table, i) => (
            <TouchableOpacity key={i} style={styles.tableRow} onPress={() => onSelectTable(table.name)} activeOpacity={0.7}>
              <View style={styles.tableIcon}>
                <Ionicons name="grid-outline" size={16} color="rgba(255,255,255,0.5)" />
              </View>
              <Text style={styles.tableName}>{table.name}</Text>
              <View style={styles.rowCountBadge}>
                <Text style={styles.rowCountText}>{table.rowCount.toLocaleString()}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
            </TouchableOpacity>
          ))}
          {tables.length === 0 && (
            <Text style={styles.emptyText}>No tables found in this database</Text>
          )}
        </ScrollView>
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
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  actionText: {
    color: '#8B5CF6',
    fontSize: 13,
    fontWeight: '600',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    marginBottom: 6,
  },
  tableIcon: {
    marginRight: 10,
  },
  tableName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  rowCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginRight: 8,
  },
  rowCountText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '500',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
});
