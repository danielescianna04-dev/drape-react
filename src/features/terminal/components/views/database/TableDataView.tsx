import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Alert, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  projectId: string;
  dbPath: string;
  table: string;
  onBack: () => void;
  api: any;
}

export const TableDataView: React.FC<Props> = ({ projectId, dbPath, table, onBack, api }) => {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<{ data: Record<string, any>; index: number } | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const apiRef = React.useRef(api);
  apiRef.current = api;

  const loadRows = useCallback(async (pageNum: number, append = false) => {
    try {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);
      const data = await apiRef.current.getRows(dbPath, table, pageNum);
      setColumns((data.columns || []).filter((c: string) => c !== 'rowid'));
      setTotal(data.total || 0);
      if (append) setRows(prev => [...prev, ...data.rows]);
      else setRows(data.rows || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [dbPath, table]);

  useEffect(() => { loadRows(0); }, [dbPath, table]);

  const handleLoadMore = () => {
    if (isLoadingMore || rows.length >= total) return;
    const next = page + 1;
    setPage(next);
    loadRows(next, true);
  };

  const handleFieldSave = async (rowIndex: number, col: string, value: string) => {
    const row = rows[rowIndex];
    const rowid = row.rowid || row.id;
    if (rowid === undefined) return;
    try {
      await api.updateCell(dbPath, table, rowid, col, value);
      const updated = [...rows];
      updated[rowIndex] = { ...row, [col]: value };
      setRows(updated);
      if (selectedRow?.index === rowIndex) setSelectedRow({ data: { ...row, [col]: value }, index: rowIndex });
    } catch (err: any) { Alert.alert('Error', err.message); }
    setEditingField(null);
  };

  const handleDeleteRow = (rowIndex: number) => {
    const row = rows[rowIndex];
    const rowid = row.rowid || row.id;
    if (rowid === undefined) return;
    Alert.alert('Delete row', `Delete row #${rowid}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.deleteRow(dbPath, table, rowid);
          setRows(prev => prev.filter((_, i) => i !== rowIndex));
          setTotal(prev => Math.max(0, prev - 1));
          setSelectedRow(null);
        } catch (err: any) { Alert.alert('Error', err.message); }
      }},
    ]);
  };

  const fmt = (v: any): string => v == null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const fmtShort = (v: any): string => { const s = fmt(v); return s.length > 28 ? s.slice(0, 26) + '…' : s; };

  // Determine which columns to show in the compact grid (max 3)
  const gridCols = columns.slice(0, 3);
  const hasMore = columns.length > 3;

  if (isLoading) {
    return (
      <View style={s.container}>
        {/* Back button is in VSCodeSidebar header */}
        <View style={s.center}><ActivityIndicator color="#8B5CF6" /><Text style={s.dimText}>Loading...</Text></View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.container}>
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadRows(0)} style={s.retryBtn}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={{ height: insets.top + 50 }} />

      {/* Column Header Row — scrollable */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.colHeaderScroll} contentContainerStyle={s.colHeaderContent}>
        <View style={s.colHeaderIdx}><Text style={s.colHeaderText}>#</Text></View>
        {columns.map(col => (
          <View key={col} style={s.colHeaderCell}><Text style={s.colHeaderText} numberOfLines={1}>{col}</Text></View>
        ))}
      </ScrollView>

      {/* Data Grid */}
      <FlatList
        data={rows}
        keyExtractor={(item, i) => String(item.id ?? item.rowid ?? i)}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        renderItem={({ item, index }) => (
          <TouchableOpacity style={[s.row, index % 2 === 0 && s.rowAlt]} onPress={() => setSelectedRow({ data: item, index })} activeOpacity={0.6}>
            <View style={s.rowIdx}><Text style={s.rowIdxText}>{index + 1}</Text></View>
            {gridCols.map(col => (
              <View key={col} style={s.rowCell}>
                <Text style={[s.rowCellText, item[col] == null && s.nullText]} numberOfLines={1}>{fmtShort(item[col])}</Text>
              </View>
            ))}
            {hasMore && (
              <View style={s.rowMore}><Ionicons name="ellipsis-horizontal" size={14} color="rgba(255,255,255,0.2)" /></View>
            )}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          isLoadingMore ? <ActivityIndicator color="#8B5CF6" style={{ padding: 16 }} />
          : rows.length > 0 && rows.length < total ? (
            <TouchableOpacity style={s.loadMore} onPress={handleLoadMore}>
              <Text style={s.loadMoreText}>Load more ({total - rows.length} left)</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Empty table</Text>
          </View>
        }
      />

      {/* Row Detail Modal */}
      <Modal visible={selectedRow !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setSelectedRow(null); setEditingField(null); }}>
        {selectedRow && (
          <View style={s.modal}>
            <View style={s.modalBar}>
              <TouchableOpacity onPress={() => { setSelectedRow(null); setEditingField(null); }}><Text style={s.modalBarBtn}>Close</Text></TouchableOpacity>
              <Text style={s.modalBarTitle}>Row #{selectedRow.data.id ?? selectedRow.data.rowid ?? selectedRow.index}</Text>
              <TouchableOpacity onPress={() => handleDeleteRow(selectedRow.index)}><Ionicons name="trash-outline" size={18} color="#EF4444" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalContent}>
              {columns.map(col => {
                const val = selectedRow.data[col];
                const isEditing = editingField === col;
                const isId = col === 'id' || col === 'rowid';
                return (
                  <View key={col} style={s.field}>
                    <View style={s.fieldHeader}>
                      <Text style={s.fieldName}>{col}</Text>
                      {!isId && !isEditing && (
                        <TouchableOpacity onPress={() => { setEditingField(col); setEditValue(val == null ? '' : String(val)); }}>
                          <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.25)" />
                        </TouchableOpacity>
                      )}
                    </View>
                    {isEditing ? (
                      <View style={s.fieldEdit}>
                        <TextInput style={s.fieldInput} value={editValue} onChangeText={setEditValue} autoFocus multiline />
                        <View style={s.fieldEditBtns}>
                          <TouchableOpacity style={s.saveBtn} onPress={() => handleFieldSave(selectedRow.index, col, editValue)}>
                            <Text style={s.saveBtnText}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setEditingField(null)}>
                            <Text style={s.cancelText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <Text style={[s.fieldVal, val == null && s.nullText, typeof val === 'number' && s.numText]}>{fmt(val)}</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  dimText: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },

  // Toolbar
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  toolbarBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  toolbarCenter: { flex: 1, alignItems: 'center' },
  toolbarTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  toolbarSub: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 },

  // Column header
  colHeaderScroll: { backgroundColor: 'rgba(139,92,246,0.08)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(139,92,246,0.12)', maxHeight: 34 },
  colHeaderContent: { flexDirection: 'row', alignItems: 'center' },
  colHeaderIdx: { width: 36, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.05)' },
  colHeaderCell: { paddingVertical: 8, paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', minWidth: 90 },
  colHeaderText: { color: '#A78BFA', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Data rows
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  rowAlt: { backgroundColor: 'rgba(255,255,255,0.015)' },
  rowIdx: { width: 36, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.04)' },
  rowIdxText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace' },
  rowCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.03)', justifyContent: 'center' },
  rowCellText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: 'monospace' },
  rowMore: { width: 40, alignItems: 'center', justifyContent: 'center' },
  nullText: { color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' },
  numText: { color: '#60A5FA' },

  // Load more
  loadMore: { padding: 14, alignItems: 'center' },
  loadMoreText: { color: '#8B5CF6', fontSize: 13, fontWeight: '500' },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 12 },
  emptyTitle: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },

  // Error
  errorText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(139,92,246,0.15)' },
  retryText: { color: '#8B5CF6', fontSize: 14, fontWeight: '600' },

  // Modal
  modal: { flex: 1, backgroundColor: '#0D0B14' },
  modalBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  modalBarBtn: { color: '#8B5CF6', fontSize: 15, fontWeight: '600' },
  modalBarTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalContent: { padding: 16 },
  field: { marginBottom: 16 },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  fieldName: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldVal: { color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 22, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10, overflow: 'hidden' },
  fieldEdit: { gap: 8 },
  fieldInput: { color: '#fff', fontSize: 15, backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)', borderRadius: 8, padding: 10, minHeight: 44 },
  fieldEditBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cancelText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
});
