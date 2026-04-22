import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'image' | 'reference';

export interface DraftField {
  name: string;
  type: FieldType;
  references?: string;
}

interface Props {
  tables: { name: string; rowCount: number; system?: boolean }[];
  dbPath: string;
  isLoading: boolean;
  onSelectTable: (name: string) => void;
  onBack: () => void;
  onOpenSQL: () => void;
  onOpenSchema: () => void;
  showBack: boolean;
  onCreateTable?: (
    name: string,
    scope: 'shared' | 'mine' | 'junction',
    purpose: string,
    fields: DraftField[],
  ) => Promise<void>;
}

const GlassWrap = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <View style={[styles.glassWrap, style]}>{children}</View>
);

export const TableListView: React.FC<Props> = ({ tables, dbPath, isLoading, onSelectTable, onBack, onOpenSQL, onOpenSchema, showBack, onCreateTable }) => {
  const insets = useSafeAreaInsets();
  const isSupabase = dbPath === '__supabase__';
  const isNeon = dbPath === '__neon__' || dbPath.includes('neon.tech');
  const isDrape = dbPath === '__drape__';
  const isCloud = isSupabase || isNeon || isDrape;
  const totalRows = tables.reduce((sum, t) => sum + (t.rowCount || 0), 0);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<'shared' | 'mine' | 'junction'>('shared');
  const [newPurpose, setNewPurpose] = useState('');
  const [newFields, setNewFields] = useState<DraftField[]>([]);
  const [junctionFrom, setJunctionFrom] = useState<string>('');
  const [junctionTo, setJunctionTo] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const canCreate = isDrape && !!onCreateTable;
  const referenceableTables = tables.filter((t) => !t.system).map((t) => t.name);

  const resetModal = () => {
    setNewName('');
    setNewScope('shared');
    setNewPurpose('');
    setNewFields([]);
    setJunctionFrom('');
    setJunctionTo('');
  };

  const addField = () => setNewFields((f) => [...f, { name: '', type: 'text' }]);
  const updateField = (i: number, patch: Partial<DraftField>) => {
    setNewFields((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const removeField = (i: number) => setNewFields((f) => f.filter((_, idx) => idx !== i));

  /** For junction tables, build two reference fields from the pickers. */
  const buildJunctionFields = (): DraftField[] | null => {
    if (!junctionFrom || !junctionTo) return null;
    return [
      { name: `${junctionFrom}_id`, type: 'reference', references: junctionFrom },
      { name: `${junctionTo}_id`, type: 'reference', references: junctionTo },
    ];
  };

  const submitCreate = async () => {
    if (!onCreateTable) return;
    const name = newName.trim().toLowerCase();
    if (!/^[a-z_][a-z0-9_]{0,63}$/.test(name)) {
      Alert.alert('Nome non valido', 'Usa solo lettere, numeri e underscore. Max 64 caratteri.');
      return;
    }

    let fields: DraftField[] = [];
    if (newScope === 'junction') {
      const jf = buildJunctionFields();
      if (!jf) {
        Alert.alert('Relazione incompleta', 'Seleziona entrambe le tabelle da collegare.');
        return;
      }
      fields = [...jf, ...newFields.filter((f) => f.name.trim())];
    } else {
      fields = newFields.filter((f) => f.name.trim());
    }

    // Validate field names and types
    for (const f of fields) {
      if (!/^[a-z_][a-z0-9_]{0,63}$/.test(f.name)) {
        Alert.alert('Campo non valido', `Il nome "${f.name}" non è valido.`);
        return;
      }
      if (f.type === 'reference' && !f.references) {
        Alert.alert('Riferimento mancante', `Il campo "${f.name}" è di tipo riferimento ma non ha una tabella target.`);
        return;
      }
    }

    try {
      setCreating(true);
      await onCreateTable(name, newScope, newPurpose.trim(), fields);
      setShowCreateModal(false);
      resetModal();
    } catch (err: any) {
      Alert.alert('Errore', err.message || 'Impossibile creare la tabella');
    } finally {
      setCreating(false);
    }
  };

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

      {showBack && (
        <View style={styles.actions}>
          <GlassWrap style={{ borderRadius: 20 }}>
            <TouchableOpacity style={styles.actionBtn} onPress={onBack} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={15} color="#9D98B2" />
              <Text style={styles.actionText}>Refresh</Text>
            </TouchableOpacity>
          </GlassWrap>
        </View>
      )}

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
          {tables.filter((t) => t.name !== 'sessions').map((table, i) => {
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
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {canCreate && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowCreateModal(false)}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderIcon}>
                <Ionicons name="layers-outline" size={18} color="#A78BFA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Nuova tabella</Text>
                <Text style={styles.modalSubtitle}>Dove verranno salvati i tuoi dati</Text>
              </View>
            </View>

            <ScrollView
              style={{ maxHeight: 520 }}
              contentContainerStyle={{ paddingBottom: 4 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.fieldLabel}>Nome</Text>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="es. products, bookmarks, cart_items"
                placeholderTextColor="rgba(255,255,255,0.3)"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={64}
              />

              <Text style={styles.fieldLabel}>Chi vede i dati</Text>
              <View style={styles.scopeRow}>
                {([
                  { s: 'shared' as const, icon: 'globe-outline', label: 'Tutti', hint: 'Catalogo pubblico, articoli, post.' },
                  { s: 'mine' as const, icon: 'person-outline', label: 'Utente', hint: 'Ogni utente vede solo le sue righe.' },
                  { s: 'junction' as const, icon: 'git-compare-outline', label: 'Collega', hint: 'Unisce due tabelle (molti-a-molti).' },
                ]).map(({ s, icon, label }) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.scopeChip, newScope === s && styles.scopeChipActive]}
                    onPress={() => setNewScope(s)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={icon as any} size={14} color={newScope === s ? '#fff' : 'rgba(255,255,255,0.5)'} />
                    <Text style={[styles.scopeChipText, newScope === s && styles.scopeChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.scopeHint}>
                {newScope === 'shared' && 'Visibile a tutti — usa per catalogo, articoli, post.'}
                {newScope === 'mine' && 'Privata per utente — usa per preferiti, ordini, note.'}
                {newScope === 'junction' && 'Collega due tabelle — genera automaticamente i due ID.'}
              </Text>

              {newScope === 'junction' && (
                <>
                  <Text style={styles.fieldLabel}>Collega le tabelle</Text>
                  <View style={{ gap: 8 }}>
                    <TablePicker
                      label="Da"
                      value={junctionFrom}
                      options={referenceableTables}
                      onChange={setJunctionFrom}
                    />
                    <TablePicker
                      label="A"
                      value={junctionTo}
                      options={referenceableTables.filter((t) => t !== junctionFrom)}
                      onChange={setJunctionTo}
                    />
                  </View>
                  {junctionFrom && junctionTo && (
                    <Text style={styles.scopeHint}>
                      Verranno creati <Text style={styles.codeText}>{junctionFrom}_id</Text> e <Text style={styles.codeText}>{junctionTo}_id</Text>.
                    </Text>
                  )}
                </>
              )}

              <View style={styles.fieldsHeader}>
                <Text style={styles.fieldLabel}>
                  {newScope === 'junction' ? 'Campi extra' : 'Campi'}
                </Text>
                <TouchableOpacity onPress={addField} style={styles.addFieldBtn} activeOpacity={0.7}>
                  <Ionicons name="add" size={14} color="#A78BFA" />
                  <Text style={styles.addFieldText}>Aggiungi</Text>
                </TouchableOpacity>
              </View>

              {newFields.length === 0 && (
                <Text style={styles.emptyFieldsHint}>
                  {newScope === 'junction'
                    ? 'Nessun campo extra — la relazione basta a sé stessa.'
                    : 'Nessun campo definito. Drape Cloud accetta qualsiasi struttura, ma definire i campi aiuta l\'AI e la UI.'}
                </Text>
              )}

              {newFields.map((f, i) => (
                <FieldRow
                  key={i}
                  field={f}
                  tables={referenceableTables}
                  onChange={(patch) => updateField(i, patch)}
                  onRemove={() => removeField(i)}
                />
              ))}

              <Text style={styles.fieldLabel}>Descrizione (opzionale)</Text>
              <TextInput
                style={[styles.input, { minHeight: 64, borderRadius: 18, paddingTop: 12, textAlignVertical: 'top' }]}
                value={newPurpose}
                onChangeText={setNewPurpose}
                placeholder="A cosa serve questa tabella?"
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                maxLength={200}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnGhost}
                onPress={() => { setShowCreateModal(false); resetModal(); }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnGhostText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, (!newName.trim() || creating) && { opacity: 0.4 }]}
                onPress={submitCreate}
                disabled={!newName.trim() || creating}
                activeOpacity={0.8}
              >
                {creating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalBtnPrimaryText}>Crea tabella</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// ─── Sub-components ──────────────────────────────────────────

const FIELD_TYPES: { value: FieldType; label: string; icon: string }[] = [
  { value: 'text', label: 'Testo', icon: 'text-outline' },
  { value: 'number', label: 'Numero', icon: 'calculator-outline' },
  { value: 'boolean', label: 'Sì/No', icon: 'toggle-outline' },
  { value: 'date', label: 'Data', icon: 'calendar-outline' },
  { value: 'image', label: 'Immagine', icon: 'image-outline' },
  { value: 'reference', label: 'Riferimento', icon: 'link-outline' },
];

const FieldRow: React.FC<{
  field: DraftField;
  tables: string[];
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
}> = ({ field, tables, onChange, onRemove }) => {
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [refMenuOpen, setRefMenuOpen] = useState(false);
  const typeMeta = FIELD_TYPES.find((t) => t.value === field.type) || FIELD_TYPES[0];

  return (
    <View style={styles.fieldRow}>
      <TextInput
        style={[styles.input, { flex: 1, minHeight: 40, paddingVertical: 8 }]}
        value={field.name}
        onChangeText={(name) => onChange({ name: name.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
        placeholder="nome_campo"
        placeholderTextColor="rgba(255,255,255,0.3)"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={64}
      />
      <TouchableOpacity style={styles.typePill} onPress={() => setTypeMenuOpen((v) => !v)} activeOpacity={0.7}>
        <Ionicons name={typeMeta.icon as any} size={12} color="#A78BFA" />
        <Text style={styles.typePillText}>{typeMeta.label}</Text>
        <Ionicons name="chevron-down" size={10} color="rgba(255,255,255,0.4)" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} style={styles.removeBtn} activeOpacity={0.7} hitSlop={6}>
        <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.3)" />
      </TouchableOpacity>

      {typeMenuOpen && (
        <View style={styles.typeMenu}>
          {FIELD_TYPES.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={styles.typeMenuItem}
              onPress={() => {
                onChange({ type: opt.value, ...(opt.value !== 'reference' ? { references: undefined } : {}) });
                setTypeMenuOpen(false);
              }}
            >
              <Ionicons name={opt.icon as any} size={13} color="#A78BFA" />
              <Text style={styles.typeMenuItemText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {field.type === 'reference' && (
        <View style={{ flexBasis: '100%', marginTop: 6, position: 'relative' }}>
          <TouchableOpacity style={styles.refPicker} onPress={() => setRefMenuOpen((v) => !v)} activeOpacity={0.7}>
            <Ionicons name="link-outline" size={12} color="#A78BFA" />
            <Text style={styles.refPickerText}>
              {field.references ? `→ ${field.references}` : 'Scegli tabella collegata'}
            </Text>
            <Ionicons name="chevron-down" size={10} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
          {refMenuOpen && (
            <View style={styles.refMenu}>
              {tables.length === 0 && (
                <Text style={[styles.typeMenuItemText, { color: 'rgba(255,255,255,0.3)', padding: 10 }]}>
                  Nessuna tabella disponibile
                </Text>
              )}
              {tables.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={styles.typeMenuItem}
                  onPress={() => { onChange({ references: name }); setRefMenuOpen(false); }}
                >
                  <Text style={styles.typeMenuItemText}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const TablePicker: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <TouchableOpacity style={styles.junctionPicker} onPress={() => setOpen((v) => !v)} activeOpacity={0.7}>
        <Text style={styles.junctionLabel}>{label}</Text>
        <Text style={[styles.junctionValue, !value && { color: 'rgba(255,255,255,0.3)' }]}>
          {value || 'Scegli…'}
        </Text>
        <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.4)" />
      </TouchableOpacity>
      {open && (
        <View style={styles.refMenu}>
          {options.length === 0 && (
            <Text style={[styles.typeMenuItemText, { color: 'rgba(255,255,255,0.3)', padding: 10 }]}>
              Nessuna tabella disponibile
            </Text>
          )}
          {options.map((name) => (
            <TouchableOpacity
              key={name}
              style={styles.typeMenuItem}
              onPress={() => { onChange(name); setOpen(false); }}
            >
              <Text style={styles.typeMenuItemText}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
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

  // FAB
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

  // Create-table modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#17141F',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(180,160,255,0.15)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  modalHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(167,139,250,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { color: '#fff', fontSize: 19, fontWeight: '700' },
  modalSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  fieldLabel: {
    color: 'rgba(167,139,250,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeChip: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeChipActive: {
    backgroundColor: 'rgba(139,92,246,0.22)',
    borderColor: 'rgba(139,92,246,0.55)',
  },
  scopeChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  scopeChipTextActive: { color: '#fff' },
  scopeHint: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 8, lineHeight: 16 },

  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 22,
  },
  modalBtnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  modalBtnGhostText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  modalBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: '#8B5CF6',
    minWidth: 140,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  modalBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Fields editor
  fieldsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  addFieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  addFieldText: { color: '#A78BFA', fontSize: 11, fontWeight: '700' },
  emptyFieldsHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    position: 'relative',
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  typePillText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  removeBtn: { padding: 2 },
  typeMenu: {
    position: 'absolute',
    top: 42,
    right: 28,
    backgroundColor: '#1F1A2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    paddingVertical: 4,
    zIndex: 100,
    minWidth: 140,
    elevation: 10,
  },
  typeMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeMenuItemText: { color: '#fff', fontSize: 12 },
  refPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },
  refPickerText: { color: '#fff', fontSize: 11, fontWeight: '600', flex: 1 },
  refMenu: {
    position: 'absolute',
    top: 38,
    left: 0,
    right: 0,
    backgroundColor: '#1F1A2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    paddingVertical: 4,
    zIndex: 100,
    maxHeight: 180,
    elevation: 10,
  },

  // Junction pickers
  junctionPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  junctionLabel: {
    color: 'rgba(167,139,250,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    width: 28,
  },
  junctionValue: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },

  // Inline code
  codeText: {
    fontFamily: 'monospace',
    color: '#A78BFA',
    backgroundColor: 'rgba(139,92,246,0.12)',
    paddingHorizontal: 4,
    borderRadius: 3,
  },
});
