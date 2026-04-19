import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  tables: { name: string; rowCount: number; system?: boolean }[];
  dbPath: string;
  isLoading: boolean;
  onSelectTable: (name: string) => void;
  onBack: () => void;
  onOpenSQL: () => void;
  onOpenSchema: () => void;
  showBack: boolean;
}

const GlassWrap = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <View style={[styles.glassWrap, style]}>{children}</View>
);

export const TableListView: React.FC<Props> = ({ tables, dbPath, isLoading, onSelectTable, onBack, onOpenSQL, onOpenSchema, showBack }) => {
  const insets = useSafeAreaInsets();
  const isSupabase = dbPath === '__supabase__';
  const isNeon = dbPath === '__neon__' || dbPath.includes('neon.tech');
  const isDrape = dbPath === '__drape__';
  const isCloud = isSupabase || isNeon || isDrape;
  const totalRows = tables.reduce((sum, t) => sum + (t.rowCount || 0), 0);

  return (
    <View style={styles.container}>
      <View style={{ height: insets.top + 50 }} />
      <View style={styles.statsRow}>
        <GlassWrap style={styles.statGlass}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{tables.length}</Text>
            <Text style={styles.statLabel}>Tables</Text>
          </View>
        </GlassWrap>
        <GlassWrap style={styles.statGlass}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalRows.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total Rows</Text>
          </View>
        </GlassWrap>
      </View>

      <View style={styles.actions}>
        <GlassWrap style={{ borderRadius: 20 }}>
          <TouchableOpacity style={styles.actionBtn} onPress={onOpenSQL} activeOpacity={0.7}>
            <Ionicons name="code-slash-outline" size={15} color="#9D98B2" />
            <Text style={styles.actionText}>SQL</Text>
          </TouchableOpacity>
        </GlassWrap>
        <GlassWrap style={{ borderRadius: 20 }}>
          <TouchableOpacity style={styles.actionBtn} onPress={onOpenSchema} activeOpacity={0.7}>
            <Ionicons name="git-network-outline" size={15} color="#9D98B2" />
            <Text style={styles.actionText}>Schema</Text>
          </TouchableOpacity>
        </GlassWrap>
        {showBack && (
          <GlassWrap style={{ borderRadius: 20 }}>
            <TouchableOpacity style={styles.actionBtn} onPress={onBack} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={15} color="#9D98B2" />
              <Text style={styles.actionText}>Refresh</Text>
            </TouchableOpacity>
          </GlassWrap>
        )}
      </View>

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
            const hasRows = (table.rowCount || 0) > 0;
            return (
              <GlassWrap key={i} style={styles.tableCardGlass}>
                <TouchableOpacity
                  style={styles.tableCard}
                  onPress={() => onSelectTable(table.name)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tableIconWrap, table.system && { backgroundColor: 'rgba(253, 186, 116, 0.14)' }]}>
                    <Ionicons
                      name={table.system ? 'shield-checkmark-outline' : 'layers-outline'}
                      size={18}
                      color={table.system ? '#FDBA74' : '#A78BFA'}
                    />
                  </View>
                  <View style={styles.tableInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.tableName}>{table.name}</Text>
                      {table.system && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(253, 186, 116, 0.16)', borderWidth: 1, borderColor: 'rgba(253, 186, 116, 0.3)' }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#FDBA74', letterSpacing: 0.5 }}>SYSTEM</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.tableType}>
                      {table.system ? 'Auth-managed, read-only' : isDrape ? 'Drape Cloud table' : isCloud ? 'PostgreSQL table' : 'SQLite table'}
                    </Text>
                  </View>
                  <View style={styles.tableRight}>
                    <View style={[styles.rowCountBadge, hasRows && styles.rowCountBadgeActive]}>
                      <Text style={[styles.rowCountText, hasRows && styles.rowCountTextActive]}>
                        {(table.rowCount || 0).toLocaleString()}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                  </View>
                </TouchableOpacity>
              </GlassWrap>
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
  glassWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(22, 18, 35, 0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 160, 255, 0.08)',
    borderTopColor: 'rgba(200, 180, 255, 0.10)',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 14,
  },
  statGlass: {
    flex: 1,
  },
  statCard: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: '#9D98B2',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionText: {
    color: '#9D98B2',
    fontSize: 13,
    fontWeight: '500',
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionLabel: {
    color: '#9D98B2',
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
  tableCardGlass: {
    marginBottom: 8,
  },
  tableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  tableIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
