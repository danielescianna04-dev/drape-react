import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, ScrollView, TextInput, Alert } from 'react-native';
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
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const loadRows = useCallback(async (pageNum: number, append = false) => {
    try {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      const data = await api.getRows(dbPath, table, pageNum);
      setColumns(data.columns.filter((c: string) => c !== 'rowid'));
      setTotal(data.total);

      if (append) {
        setRows(prev => [...prev, ...data.rows]);
      } else {
        setRows(data.rows);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [api, dbPath, table]);

  useEffect(() => {
    loadRows(0);
  }, [loadRows]);

  const handleLoadMore = () => {
    if (isLoadingMore || rows.length >= total) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadRows(nextPage, true);
  };

  const handleCellTap = (rowIndex: number, col: string, value: any) => {
    setEditingCell({ rowIndex, col });
    setEditValue(value == null ? '' : String(value));
  };

  const handleCellSave = async () => {
    if (!editingCell) return;
    const row = rows[editingCell.rowIndex];
    const rowid = row.rowid;
    if (rowid === undefined) {
      setEditingCell(null);
      return;
    }

    try {
      await api.updateCell(dbPath, table, rowid, editingCell.col, editValue);
      // Update local state
      const updated = [...rows];
      updated[editingCell.rowIndex] = { ...row, [editingCell.col]: editValue };
      setRows(updated);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setEditingCell(null);
  };

  const handleDeleteRow = (rowIndex: number) => {
    const row = rows[rowIndex];
    const rowid = row.rowid;
    if (rowid === undefined) return;

    Alert.alert('Delete row', `Delete row ${rowid}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.deleteRow(dbPath, table, rowid);
            setRows(prev => prev.filter((_, i) => i !== rowIndex));
            setTotal(prev => prev - 1);
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const COL_WIDTH = 120;
  const displayCols = columns;

  const renderRow = ({ item, index }: { item: Record<string, any>; index: number }) => (
    <View style={styles.row}>
      {displayCols.map(col => {
        const isEditing = editingCell?.rowIndex === index && editingCell?.col === col;
        return (
          <TouchableOpacity
            key={col}
            style={[styles.cell, { width: COL_WIDTH }]}
            onPress={() => handleCellTap(index, col, item[col])}
            activeOpacity={0.7}
          >
            {isEditing ? (
              <TextInput
                style={styles.cellInput}
                value={editValue}
                onChangeText={setEditValue}
                onBlur={handleCellSave}
                onSubmitEditing={handleCellSave}
                autoFocus
                selectTextOnFocus
              />
            ) : (
              <Text style={styles.cellText} numberOfLines={1}>
                {item[col] == null ? 'NULL' : String(item[col])}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={styles.deleteCell} onPress={() => handleDeleteRow(index)}>
        <Ionicons name="trash-outline" size={14} color="rgba(239,68,68,0.6)" />
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => loadRows(0)}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#8B5CF6" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{table}</Text>
          <Text style={styles.headerSubtitle}>{total.toLocaleString()} row{total !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => { setPage(0); loadRows(0); }}>
          <Ionicons name="refresh-outline" size={18} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {/* Table */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.horizontalScroll}>
        <View>
          {/* Column Headers */}
          <View style={styles.headerRow}>
            {displayCols.map(col => (
              <View key={col} style={[styles.headerCell, { width: COL_WIDTH }]}>
                <Text style={styles.headerCellText} numberOfLines={1}>{col}</Text>
              </View>
            ))}
            <View style={styles.deleteHeaderCell} />
          </View>

          {/* Data Rows */}
          <FlatList
            data={rows}
            renderItem={renderRow}
            keyExtractor={(item, i) => String(item.rowid ?? i)}
            style={styles.list}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isLoadingMore ? (
                <ActivityIndicator size="small" color="#8B5CF6" style={{ padding: 16 }} />
              ) : rows.length < total ? (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
                  <Text style={styles.loadMoreText}>Load more ({total - rows.length} remaining)</Text>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No rows in this table</Text>
            }
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
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
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontalScroll: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerCell: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.04)',
  },
  headerCellText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  deleteHeaderCell: {
    width: 40,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  cell: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
  },
  cellText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  cellInput: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'monospace',
    padding: 0,
    margin: 0,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  deleteCell: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  loadMoreBtn: {
    padding: 16,
    alignItems: 'center',
  },
  loadMoreText: {
    color: '#8B5CF6',
    fontSize: 13,
    fontWeight: '500',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    textAlign: 'center',
    padding: 40,
  },
  errorText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  retryText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
});
