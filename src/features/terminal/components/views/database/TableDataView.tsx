import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Alert, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

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
  const [totalAll, setTotalAll] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<{ data: Record<string, any>; index: number } | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAnonymous, setShowAnonymous] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const isUsersTable = dbPath === '__bynot__' && table === 'users';
  const isSystemTable = dbPath === '__bynot__' && (table === 'users' || table === 'sessions');

  const editableColumns = useMemo(
    () => columns.filter((c) => !['id', 'rowid', 'created_at', 'updated_at', 'end_user_id'].includes(c)),
    [columns],
  );

  // FK-picker state: cache of row options per referenced table.
  const [fkCache, setFkCache] = useState<Record<string, { id: string; label: string }[]>>({});
  const [fkLoading, setFkLoading] = useState<Record<string, boolean>>({});
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [availableTables, setAvailableTables] = useState<string[]>([]);

  useEffect(() => {
    if (!showAddModal) return;
    api.getTables(dbPath).then((t: any[]) => setAvailableTables(t.map((x) => x.name))).catch(() => {});
  }, [showAddModal, dbPath]);

  const resolveFkTable = useCallback((col: string): string | null => {
    if (!col.endsWith('_id')) return null;
    const base = col.slice(0, -3);
    if (base === 'end_user') return 'users';
    if (availableTables.includes(base)) return base;
    if (availableTables.includes(base + 's')) return base + 's';
    if (base.endsWith('y') && availableTables.includes(base.slice(0, -1) + 'ies')) return base.slice(0, -1) + 'ies';
    return null;
  }, [availableTables]);

  const loadFkOptions = useCallback(async (refTable: string) => {
    if (fkCache[refTable] || fkLoading[refTable]) return;
    setFkLoading((p) => ({ ...p, [refTable]: true }));
    try {
      const data = await api.getRows(dbPath, refTable, 0, 50);
      const opts = (data.rows || []).map((r: any) => {
        const label = r.name || r.title || r.email || r.label || r.username || String(r.id ?? r.rowid ?? '').slice(0, 8);
        return { id: String(r.id ?? r.rowid ?? ''), label: String(label) };
      });
      setFkCache((p) => ({ ...p, [refTable]: opts }));
    } catch {
      setFkCache((p) => ({ ...p, [refTable]: [] }));
    } finally {
      setFkLoading((p) => ({ ...p, [refTable]: false }));
    }
  }, [api, dbPath, fkCache, fkLoading]);

  const apiRef = React.useRef(api);
  apiRef.current = api;

  const loadRows = useCallback(async (pageNum: number, append = false) => {
    try {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);
      const data = await apiRef.current.getRows(dbPath, table, pageNum, 50, undefined, isUsersTable ? { includeAnonymous: showAnonymous } : undefined);
      setColumns((data.columns || []).filter((c: string) => c !== 'rowid'));
      setTotal(data.total || 0);
      setTotalAll(typeof data.totalAll === 'number' ? data.totalAll : null);
      if (append) setRows(prev => [...prev, ...data.rows]);
      else setRows(data.rows || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [dbPath, table, isUsersTable, showAnonymous]);

  const openAddModal = useCallback(() => {
    const init: Record<string, string> = {};
    editableColumns.forEach((c) => { init[c] = ''; });
    setNewRowValues(init);
    setShowAddModal(true);
  }, [editableColumns]);

  const submitNewRow = useCallback(async () => {
    try {
      setCreating(true);
      const values: Record<string, any> = {};
      for (const [k, v] of Object.entries(newRowValues)) {
        if (v === '') continue;
        if (v === 'true') values[k] = true;
        else if (v === 'false') values[k] = false;
        else if (/^-?\d+(\.\d+)?$/.test(v)) values[k] = Number(v);
        else values[k] = v;
      }
      await api.insertRow(dbPath, table, values);
      setShowAddModal(false);
      setPage(0);
      await loadRows(0);
    } catch (err: any) {
      Alert.alert('Errore', err.message);
    } finally {
      setCreating(false);
    }
  }, [api, dbPath, table, newRowValues, loadRows]);

  useEffect(() => { setPage(0); loadRows(0); }, [dbPath, table, showAnonymous]);

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

  // All columns are rendered — the user scrolls horizontally through
  // the shared header+body scroll wrapper below. A row tap still
  // opens the detail modal for read/edit.

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

  const hiddenAnonymous = isUsersTable && !showAnonymous && totalAll != null ? Math.max(0, totalAll - total) : 0;

  return (
    <View style={s.container}>
      <View style={{ height: insets.top + 50 }} />

      {isUsersTable && (
        <TouchableOpacity
          style={s.anonToggle}
          onPress={() => setShowAnonymous(v => !v)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={showAnonymous ? 'eye' : 'eye-off-outline'}
            size={14}
            color={showAnonymous ? '#A78BFA' : 'rgba(255,255,255,0.4)'}
          />
          <Text style={s.anonToggleText}>
            {showAnonymous
              ? 'Showing all users (anonymous included)'
              : hiddenAnonymous > 0
                ? `Hiding ${hiddenAnonymous} anonymous visitor${hiddenAnonymous === 1 ? '' : 's'}`
                : 'Anonymous visitors hidden'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Shared horizontal scroll for header + rows so they stay
          aligned and every column is visible on a 430px screen. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexDirection: 'column' }}
        nestedScrollEnabled
      >
        <View>
          {/* Header */}
          <View style={[s.colHeaderContent, { flexDirection: 'row' }]}>
            <View style={s.colHeaderIdx}><Text style={s.colHeaderText}>#</Text></View>
            {columns.map(col => (
              <View key={col} style={s.colHeaderCell}>
                <Text style={s.colHeaderText} numberOfLines={1}>{col}</Text>
              </View>
            ))}
          </View>

          {/* Rows */}
          <FlatList
            data={rows}
            keyExtractor={(item, i) => String(item.id ?? item.rowid ?? i)}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            nestedScrollEnabled
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[s.row, index % 2 === 0 && s.rowAlt, { flexDirection: 'row' }]}
                onPress={() => setSelectedRow({ data: item, index })}
                activeOpacity={0.6}
              >
                <View style={s.rowIdx}><Text style={s.rowIdxText}>{index + 1}</Text></View>
                {columns.map(col => (
                  <View key={col} style={s.rowCell}>
                    <Text style={[s.rowCellText, item[col] == null && s.nullText]} numberOfLines={1}>
                      {fmtShort(item[col])}
                    </Text>
                  </View>
                ))}
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
        </View>
      </ScrollView>

      {!isSystemTable && (
        <TouchableOpacity
          style={[s.fab, { bottom: insets.bottom + 24 }]}
          onPress={openAddModal}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={s.addBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAddModal(false)} />
          <View style={s.addCard}>
            <View style={s.addHeader}>
              <View style={s.addHeaderIcon}>
                <Ionicons name="add-circle-outline" size={18} color="#A78BFA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.addTitle}>Nuova riga</Text>
                <Text style={s.addSubtitle}>Tabella {table}</Text>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {editableColumns.length === 0 ? (
                <Text style={s.addEmpty}>Nessun campo modificabile.</Text>
              ) : editableColumns.map((col) => {
                const refTable = resolveFkTable(col);
                const value = newRowValues[col] || '';
                if (refTable) {
                  const opts = fkCache[refTable] || [];
                  const isLoading = !!fkLoading[refTable];
                  const selected = opts.find((o) => o.id === value);
                  const isOpen = openPicker === col;
                  return (
                    <View key={col} style={{ marginBottom: 12 }}>
                      <Text style={s.addLabel}>{col} <Text style={{ color: 'rgba(167,139,250,0.5)' }}>→ {refTable}</Text></Text>
                      <TextInput
                        style={s.addInput}
                        value={value}
                        onChangeText={(v) => setNewRowValues((prev) => ({ ...prev, [col]: v }))}
                        onFocus={() => {
                          loadFkOptions(refTable);
                          setOpenPicker(col);
                        }}
                        placeholder={selected ? selected.label : `Scegli o scrivi ID da ${refTable}…`}
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {isOpen && (
                        <View style={s.fkDropdown}>
                          {isLoading ? (
                            <ActivityIndicator color="#8B5CF6" style={{ padding: 12 }} />
                          ) : opts.length === 0 ? (
                            <Text style={s.fkEmpty}>Nessuna riga in {refTable}. Scrivi l'ID a mano.</Text>
                          ) : opts.map((opt) => (
                            <TouchableOpacity
                              key={opt.id}
                              style={s.fkOption}
                              onPress={() => {
                                setNewRowValues((prev) => ({ ...prev, [col]: opt.id }));
                                setOpenPicker(null);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={s.fkOptionLabel} numberOfLines={1}>{opt.label}</Text>
                              <Text style={s.fkOptionId} numberOfLines={1}>{opt.id.slice(0, 8)}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                }
                return (
                  <View key={col} style={{ marginBottom: 12 }}>
                    <Text style={s.addLabel}>{col}</Text>
                    <TextInput
                      style={s.addInput}
                      value={value}
                      onChangeText={(v) => setNewRowValues((prev) => ({ ...prev, [col]: v }))}
                      placeholder={`valore per ${col}`}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View style={s.addActions}>
              <TouchableOpacity style={s.addBtnGhost} onPress={() => setShowAddModal(false)} activeOpacity={0.7}>
                <Text style={s.addBtnGhostText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.addBtnPrimary, creating && { opacity: 0.5 }]}
                onPress={submitNewRow}
                disabled={creating}
                activeOpacity={0.85}
              >
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.addBtnPrimaryText}>Crea riga</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Row Detail Modal */}
      <Modal visible={selectedRow !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setSelectedRow(null); setEditingField(null); }}>
        {selectedRow && (
          <RowDetailModal
            row={selectedRow.data}
            rowIndex={selectedRow.index}
            columns={columns}
            editingField={editingField}
            editValue={editValue}
            onClose={() => { setSelectedRow(null); setEditingField(null); }}
            onStartEdit={(col, initial) => { setEditingField(col); setEditValue(initial); }}
            onEditChange={setEditValue}
            onCancelEdit={() => setEditingField(null)}
            onSave={(col) => handleFieldSave(selectedRow.index, col, editValue)}
            onDelete={() => handleDeleteRow(selectedRow.index)}
          />
        )}
      </Modal>
    </View>
  );
};

// ─── Row detail modal ──────────────────────────────────────────────────────
interface RowDetailProps {
  row: Record<string, any>;
  rowIndex: number;
  columns: string[];
  editingField: string | null;
  editValue: string;
  onClose: () => void;
  onStartEdit: (col: string, initial: string) => void;
  onEditChange: (v: string) => void;
  onCancelEdit: () => void;
  onSave: (col: string) => void;
  onDelete: () => void;
}

const ID_COLUMNS = new Set(['id', 'rowid', 'project_id', 'end_user_id', 'title_id', 'user_id', 'anonymous_id']);
const DATE_COLUMNS = new Set(['created_at', 'updated_at', 'expires_at', 'deleted_at']);

function tryParseJson(value: any): { pretty: string; parsed: any } | null {
  if (value == null) return null;
  if (typeof value === 'object') {
    try { return { pretty: JSON.stringify(value, null, 2), parsed: value }; }
    catch { return null; }
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return { pretty: JSON.stringify(parsed, null, 2), parsed };
    }
    return null;
  } catch { return null; }
}

function formatRelativeTime(iso: string): string | null {
  const ts = Date.parse(iso);
  if (isNaN(ts)) return null;
  const diffMs = Date.now() - ts;
  const absSec = Math.abs(diffMs) / 1000;
  const sign = diffMs >= 0 ? 'ago' : 'from now';
  if (absSec < 45) return `just now`;
  if (absSec < 90) return `1 min ${sign}`;
  const absMin = absSec / 60;
  if (absMin < 45) return `${Math.round(absMin)} min ${sign}`;
  if (absMin < 90) return `1 hour ${sign}`;
  const absHr = absMin / 60;
  if (absHr < 22) return `${Math.round(absHr)} hours ${sign}`;
  if (absHr < 36) return `1 day ${sign}`;
  const absDay = absHr / 24;
  if (absDay < 26) return `${Math.round(absDay)} days ${sign}`;
  if (absDay < 45) return `1 month ${sign}`;
  const absMo = absDay / 30;
  if (absMo < 11) return `${Math.round(absMo)} months ${sign}`;
  return `${Math.round(absMo / 12)} years ${sign}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Render a JSON primitive (string/number/boolean/null) with sensible styling.
 * Long strings wrap; URLs and dates get subtle formatting.
 */
const PrimitiveValue: React.FC<{ value: any }> = ({ value }) => {
  if (value === null || value === undefined) {
    return <Text style={[s.subVal, s.nullText]}>null</Text>;
  }
  if (typeof value === 'boolean') {
    return (
      <View style={[s.boolPill, value ? s.boolTrue : s.boolFalse, { alignSelf: 'flex-start' }]}>
        <Text style={[s.boolText, value ? s.boolTrueText : s.boolFalseText]}>{value ? 'true' : 'false'}</Text>
      </View>
    );
  }
  if (typeof value === 'number') {
    return <Text style={[s.subVal, s.numText]}>{String(value)}</Text>;
  }
  return <Text style={s.subVal}>{String(value)}</Text>;
};

const ArrayView: React.FC<{ arr: any[]; raw: string }> = ({ arr, raw }) => {
  // Array of primitives → compact comma list with chips
  const allPrimitive = arr.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x));
  if (allPrimitive && arr.length > 0) {
    return (
      <View style={s.chipRow}>
        {arr.map((item, i) => (
          <View key={i} style={s.chip}>
            <Text style={s.chipText}>{item == null ? 'null' : String(item)}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (arr.length === 0) return <Text style={[s.subVal, s.nullText]}>empty array</Text>;
  // Array of objects → fall back to pretty JSON
  return (
    <View style={s.jsonWrap}>
      <Text style={s.jsonText} selectable>{raw}</Text>
    </View>
  );
};

const NestedObjectView: React.FC<{ obj: Record<string, any>; depth?: number }> = ({ obj, depth = 0 }) => {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return <Text style={[s.subVal, s.nullText]}>empty object</Text>;
  }
  return (
    <View style={[s.nestedWrap, depth > 0 && s.nestedWrapDeep]}>
      {entries.map(([k, v], i) => {
        const isObject = v !== null && typeof v === 'object' && !Array.isArray(v);
        const isArray = Array.isArray(v);
        const isLong = typeof v === 'string' && v.length > 60;
        return (
          <View key={k} style={[s.subField, i === entries.length - 1 && s.subFieldLast]}>
            <Text style={s.subKey}>{k}</Text>
            {isObject ? (
              depth < 2
                ? <NestedObjectView obj={v} depth={depth + 1} />
                : <Text style={[s.subVal, s.mono]} selectable>{JSON.stringify(v)}</Text>
            ) : isArray ? (
              <ArrayView arr={v} raw={JSON.stringify(v, null, 2)} />
            ) : isLong ? (
              <Text style={[s.subVal, s.subValLong]} selectable>{String(v)}</Text>
            ) : (
              <PrimitiveValue value={v} />
            )}
          </View>
        );
      })}
    </View>
  );
};

const RowDetailModal: React.FC<RowDetailProps> = ({
  row, rowIndex, columns, editingField, editValue,
  onClose, onStartEdit, onEditChange, onCancelEdit, onSave, onDelete,
}) => {
  const insets = useSafeAreaInsets();
  const [copiedCol, setCopiedCol] = useState<string | null>(null);
  const rowId = row.id ?? row.rowid ?? rowIndex;
  const shortRowId = useMemo(() => {
    const s = String(rowId);
    return s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
  }, [rowId]);

  const copy = useCallback(async (col: string, value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setCopiedCol(col);
      setTimeout(() => setCopiedCol((c) => (c === col ? null : c)), 1400);
    } catch {}
  }, []);

  return (
    <View style={s.modal}>
      {/* Header */}
      <View style={[s.modalBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose} style={s.modalBarSide} hitSlop={8}>
          <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={s.modalBarCenter}>
          <Text style={s.modalBarSub}>ROW</Text>
          <Text style={s.modalBarTitle} numberOfLines={1}>{shortRowId}</Text>
        </View>
        <TouchableOpacity onPress={onDelete} style={s.modalBarSide} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
        {columns.map((col) => {
          const val = row[col];
          const isEditing = editingField === col;
          const isId = ID_COLUMNS.has(col);
          const isDate = DATE_COLUMNS.has(col);
          const isReadOnly = col === 'id' || col === 'rowid';
          const json = tryParseJson(val);
          const isCopied = copiedCol === col;

          return (
            <View key={col} style={s.field}>
              <View style={s.fieldHeader}>
                <Text style={s.fieldName}>{col}</Text>
                <View style={s.fieldHeaderActions}>
                  {val != null && (isId || json) && !isEditing && (
                    <TouchableOpacity
                      onPress={() => copy(col, json ? json.pretty : String(val))}
                      hitSlop={8}
                      style={s.fieldHeaderBtn}
                    >
                      <Ionicons
                        name={isCopied ? 'checkmark' : 'copy-outline'}
                        size={14}
                        color={isCopied ? '#34D399' : 'rgba(255,255,255,0.5)'}
                      />
                    </TouchableOpacity>
                  )}
                  {!isReadOnly && !isEditing && (
                    <TouchableOpacity
                      onPress={() => onStartEdit(col, val == null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val))}
                      hitSlop={8}
                      style={s.fieldHeaderBtn}
                    >
                      <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {isEditing ? (
                <View style={s.fieldEdit}>
                  <TextInput
                    style={s.fieldInput}
                    value={editValue}
                    onChangeText={onEditChange}
                    autoFocus
                    multiline
                    placeholder={val == null ? 'null' : ''}
                    placeholderTextColor="rgba(255,255,255,0.25)"
                  />
                  <View style={s.fieldEditBtns}>
                    <TouchableOpacity style={s.saveBtn} onPress={() => onSave(col)}>
                      <Text style={s.saveBtnText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onCancelEdit} hitSlop={8}>
                      <Text style={s.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : val == null ? (
                <Text style={[s.fieldVal, s.nullValText]}>null</Text>
              ) : json && json.parsed && typeof json.parsed === 'object' && !Array.isArray(json.parsed) ? (
                <NestedObjectView obj={json.parsed} />
              ) : json && Array.isArray(json.parsed) ? (
                <ArrayView arr={json.parsed} raw={json.pretty} />
              ) : isDate && typeof val === 'string' ? (
                <TouchableOpacity activeOpacity={0.8} onPress={() => copy(col, val)}>
                  <Text style={s.fieldVal}>{formatDateShort(val)}</Text>
                  {formatRelativeTime(val) && (
                    <Text style={s.fieldValSub}>{formatRelativeTime(val)}</Text>
                  )}
                </TouchableOpacity>
              ) : isId ? (
                <TouchableOpacity activeOpacity={0.8} onPress={() => copy(col, String(val))}>
                  <Text style={[s.fieldVal, s.monoVal]} numberOfLines={1} ellipsizeMode="middle">{String(val)}</Text>
                </TouchableOpacity>
              ) : typeof val === 'boolean' ? (
                <View style={[s.boolPill, val ? s.boolTrue : s.boolFalse]}>
                  <Text style={[s.boolText, val ? s.boolTrueText : s.boolFalseText]}>{val ? 'true' : 'false'}</Text>
                </View>
              ) : (
                <Text style={[s.fieldVal, typeof val === 'number' && s.numText]}>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
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

  // Anonymous-user filter toggle (users table only)
  anonToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    gap: 6,
  },
  anonToggleText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },

  // Column header
  colHeaderScroll: { backgroundColor: 'rgba(139,92,246,0.08)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(139,92,246,0.12)', maxHeight: 34 },
  colHeaderContent: { flexDirection: 'row', alignItems: 'center' },
  colHeaderIdx: { width: 36, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.05)' },
  colHeaderCell: { width: 150, paddingVertical: 8, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.05)', justifyContent: 'center' },
  colHeaderText: { color: '#A78BFA', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Data rows
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  rowAlt: { backgroundColor: 'rgba(255,255,255,0.015)' },
  rowIdx: { width: 36, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.04)' },
  rowIdxText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace' },
  rowCell: { width: 150, paddingVertical: 10, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.03)', justifyContent: 'center' },
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
  modalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  modalBarSide: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modalBarCenter: { flex: 1, alignItems: 'center' },
  modalBarSub: { color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  modalBarTitle: { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: 'monospace' },

  modalContent: { padding: 16, paddingBottom: 40 },
  field: { marginBottom: 18 },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  fieldHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fieldHeaderBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  fieldName: { color: 'rgba(167,139,250,0.75)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },

  fieldVal: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  fieldValSub: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, paddingHorizontal: 12 },
  monoVal: { fontFamily: 'monospace', fontSize: 13 },
  nullValText: {
    color: 'rgba(255,255,255,0.3)',
    fontStyle: 'italic',
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },

  jsonWrap: {
    backgroundColor: 'rgba(139,92,246,0.06)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  jsonText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 18, fontFamily: 'monospace' },

  // Nested object expanded as sub-fields
  nestedWrap: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  nestedWrapDeep: {
    backgroundColor: 'rgba(139,92,246,0.05)',
    borderColor: 'rgba(139,92,246,0.12)',
  },
  subField: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  subFieldLast: { borderBottomWidth: 0 },
  subKey: {
    color: 'rgba(167,139,250,0.7)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  subVal: { color: 'rgba(255,255,255,0.92)', fontSize: 14, lineHeight: 20 },
  subValLong: { fontSize: 14, lineHeight: 20 },
  mono: { fontFamily: 'monospace', fontSize: 12 },

  // Array chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  chipText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '500' },

  boolPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  boolTrue: { backgroundColor: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.3)' },
  boolFalse: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' },
  boolText: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  boolTrueText: { color: '#34D399' },
  boolFalseText: { color: 'rgba(255,255,255,0.45)' },

  // Add-row FAB + modal
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  addBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  addCard: {
    backgroundColor: '#17141F',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(180,160,255,0.15)',
  },
  addHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  addHeaderIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(167,139,250,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  addTitle: { color: '#fff', fontSize: 19, fontWeight: '700' },
  addSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  addLabel: {
    color: 'rgba(167,139,250,0.7)', fontSize: 10, fontWeight: '700',
    letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 6,
  },
  addInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12,
    color: '#fff', fontSize: 15,
  },
  addEmpty: { color: 'rgba(255,255,255,0.4)', fontSize: 13, paddingVertical: 12 },
  fkDropdown: {
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(180,160,255,0.12)',
    maxHeight: 220,
    overflow: 'hidden',
  },
  fkOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 10,
  },
  fkOptionLabel: { color: '#fff', fontSize: 14, flex: 1 },
  fkOptionId: { color: 'rgba(167,139,250,0.6)', fontSize: 11, fontFamily: 'monospace' },
  fkEmpty: { color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: 12, textAlign: 'center' },
  addActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  addBtnGhost: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999 },
  addBtnGhostText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  addBtnPrimary: {
    paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999,
    backgroundColor: '#8B5CF6', minWidth: 140, alignItems: 'center',
    shadowColor: '#8B5CF6', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  addBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  fieldEdit: { gap: 8 },
  fieldInput: { color: '#fff', fontSize: 15, backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', borderRadius: 10, padding: 12, minHeight: 44 },
  fieldEditBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveBtn: { backgroundColor: '#8B5CF6', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cancelText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
});
