import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

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

const TABLE_COLORS = [
  '#8B5CF6', '#3ECF8E', '#60A5FA', '#F59E0B', '#EF4444',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
];

export const TableListView: React.FC<Props> = ({ tables, dbPath, isLoading, onSelectTable, onBack, onOpenSQL, onOpenSchema, showBack }) => {
  const insets = useSafeAreaInsets();
  const isSupabase = dbPath === '__supabase__';
  const dbName = isSupabase ? 'Supabase' : (dbPath.split('/').pop() || dbPath);
  const totalRows = tables.reduce((sum, t) => sum + (t.rowCount || 0), 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {showBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#8B5CF6" />
          </TouchableOpacity>
        )}
        <View style={styles.headerInfo}>
          <View style={styles.headerTitleRow}>
            {isSupabase && (
              <View style={styles.supabaseBadge}>
                <Text style={styles.supabaseBadgeText}>⚡</Text>
              </View>
            )}
            <Text style={styles.headerTitle} numberOfLines={1}>{dbName}</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            {tables.length} table{tables.length !== 1 ? 's' : ''} · {totalRows.toLocaleString()} row{totalRows !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{tables.length}</Text>
          <Text style={styles.statLabel}>Tables</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalRows.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Total Rows</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: isSupabase ? '#3ECF8E' : '#60A5FA' }]}>
            {isSupabase ? 'PG' : 'SQLite'}
          </Text>
          <Text style={styles.statLabel}>Engine</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpenSQL} activeOpacity={0.7}>
          <LinearGradient
            colors={['rgba(139, 92, 246, 0.15)', 'rgba(139, 92, 246, 0.05)']}
            style={styles.actionGradient}
          >
            <Ionicons name="code-slash-outline" size={18} color="#A78BFA" />
            <Text style={styles.actionText}>SQL Editor</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpenSchema} activeOpacity={0.7}>
          <LinearGradient
            colors={['rgba(96, 165, 250, 0.15)', 'rgba(96, 165, 250, 0.05)']}
            style={styles.actionGradient}
          >
            <Ionicons name="git-network-outline" size={18} color="#60A5FA" />
            <Text style={[styles.actionText, { color: '#60A5FA' }]}>Schema</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Section Label */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>TABLES</Text>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading tables...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {tables.map((table, i) => {
            const color = TABLE_COLORS[i % TABLE_COLORS.length];
            const hasRows = (table.rowCount || 0) > 0;
            return (
              <TouchableOpacity
                key={i}
                style={styles.tableCard}
                onPress={() => onSelectTable(table.name)}
                activeOpacity={0.7}
              >
                <View style={[styles.tableColorBar, { backgroundColor: color }]} />
                <View style={styles.tableContent}>
                  <View style={styles.tableMain}>
                    <View style={[styles.tableIconWrap, { backgroundColor: `${color}18` }]}>
                      <Ionicons name="layers-outline" size={18} color={color} />
                    </View>
                    <View style={styles.tableInfo}>
                      <Text style={styles.tableName}>{table.name}</Text>
                      <Text style={styles.tableType}>
                        {isSupabase ? 'PostgreSQL' : 'SQLite'} table
                      </Text>
                    </View>
                  </View>
                  <View style={styles.tableRight}>
                    <View style={[styles.rowCountBadge, hasRows && styles.rowCountBadgeActive]}>
                      <Text style={[styles.rowCountText, hasRows && styles.rowCountTextActive]}>
                        {(table.rowCount || 0).toLocaleString()}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          {tables.length === 0 && (
            <View style={styles.emptyWrap}>
              <Ionicons name="file-tray-outline" size={40} color="rgba(255,255,255,0.12)" />
              <Text style={styles.emptyText}>No tables found</Text>
              <Text style={styles.emptyHint}>Create tables using the SQL editor or ask AI in chat</Text>
            </View>
          )}
          <View style={{ height: 40 }} />
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
    paddingTop: 48,
    paddingBottom: 14,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supabaseBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(62, 207, 142, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supabaseBadgeText: {
    fontSize: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 3,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.12)',
  },
  actionText: {
    color: '#A78BFA',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  tableCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  tableColorBar: {
    width: 3,
  },
  tableContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  tableMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  tableIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableInfo: {
    flex: 1,
  },
  tableName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  tableType: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    marginTop: 2,
  },
  tableRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rowCountBadgeActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  rowCountText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  rowCountTextActive: {
    color: '#A78BFA',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 10,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
