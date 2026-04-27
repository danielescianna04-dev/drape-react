// MCP marketplace — companion to PluginsView. Two tabs (Miei MCP / Marketplace).
// MCPs are installable tool providers (model context protocol). Unlike skills
// (pure prompt presets), MCPs need executable config + env values, often
// secrets (API tokens). The install flow surfaces the env form when required.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard as SystemGlass } from '../../../settings/components/GlassCard';
import { AppColors } from '../../../../shared/theme/colors';
import { mcpApi, type McpServer, type McpCategory, type McpEnvDecl } from '../../../../core/api/mcpApi';

const HEADER_TOP_GAP = 56;
const PRIMARY_TINT = `${AppColors.primary}26`;

type SubTab = 'mine' | 'marketplace';

const MCP_CATEGORIES: { id: McpCategory; label: string; icon: string }[] = [
  { id: 'productivity', label: 'Produttività',  icon: 'briefcase-outline' },
  { id: 'dev',          label: 'Dev',           icon: 'code-slash-outline' },
  { id: 'data',         label: 'Dati',          icon: 'server-outline' },
  { id: 'design',       label: 'Design',        icon: 'color-palette-outline' },
  { id: 'web',          label: 'Web',           icon: 'globe-outline' },
  { id: 'other',        label: 'Altro',         icon: 'ellipsis-horizontal' },
];

// ─── Glass card — same wrapper as PluginsView ─────────────────────────────

const GlassCard: React.FC<{ children: React.ReactNode; style?: any; contentStyle?: any }> = ({ children, style, contentStyle }) => (
  <SystemGlass style={[s.glassCard, style]}>
    <View style={[s.glassCardContent, s.glassReadableSurface, contentStyle]}>{children}</View>
  </SystemGlass>
);

// ─── Root ─────────────────────────────────────────────────────────────────

export const McpView: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<SubTab>('mine');
  const [reloadKey, setReloadKey] = useState(0);
  const bumpReload = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <View style={s.page}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['#1a0a2e', '#2d0845', AppColors.primary, '#0A0A0F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}
        />
        <LinearGradient
          colors={['#0A0A0F', '#4c1d95', '#1a0a2e', '#0A0A0F']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
        />
      </View>

      <View style={[s.tabsRow, { paddingTop: insets.top + HEADER_TOP_GAP }]}>
        {([
          { id: 'mine',         label: 'Miei MCP',     icon: 'cube-outline' },
          { id: 'marketplace',  label: 'Marketplace',  icon: 'sparkles-outline' },
        ] as const).map((t) => {
          const active = section === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              activeOpacity={0.7}
              onPress={() => setSection(t.id)}
              style={[s.tabBtn, active && s.tabBtnActive]}
            >
              <Ionicons name={t.icon as any} size={14} color={active ? '#fff' : 'rgba(255,255,255,0.55)'} />
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {section === 'mine' && <MineSection reloadKey={reloadKey} onChanged={bumpReload} />}
        {section === 'marketplace' && <MarketplaceSection onInstalled={bumpReload} />}
      </ScrollView>
    </View>
  );
};

// ─── Section: Miei MCP ────────────────────────────────────────────────────

const MineSection: React.FC<{ reloadKey: number; onChanged: () => void }> = ({ reloadKey, onChanged }) => {
  const [mcps, setMcps] = useState<McpServer[] | null>(null);
  const [editingEnv, setEditingEnv] = useState<McpServer | null>(null);

  useEffect(() => {
    let cancelled = false;
    mcpApi.listMine()
      .then((res) => { if (!cancelled) setMcps(res.mcps); })
      .catch(() => { if (!cancelled) setMcps([]); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const handleToggle = useCallback(async (mcp: McpServer, next: boolean) => {
    try {
      await mcpApi.setEnabled(mcp.id, next);
      onChanged();
    } catch (e: any) {
      Alert.alert('Errore', e?.message || 'Toggle fallito');
    }
  }, [onChanged]);

  const handleDelete = useCallback((mcp: McpServer) => {
    Alert.alert(
      'Rimuovi MCP',
      `Vuoi disinstallare ${mcp.name}? Le tue env vars verranno cancellate.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: async () => {
            try { await mcpApi.remove(mcp.id); onChanged(); }
            catch (e: any) { Alert.alert('Errore', e?.message || 'Rimozione fallita'); }
          },
        },
      ],
    );
  }, [onChanged]);

  if (mcps === null) return <Loader />;
  if (mcps.length === 0) {
    return (
      <EmptyBlock
        icon="cube-outline"
        title="Nessun MCP installato"
        copy="Apri il marketplace per aggiungere strumenti come GitHub, filesystem, Brave Search, e altri."
      />
    );
  }

  return (
    <>
      <View style={{ gap: 8, marginTop: 6 }}>
        {mcps.map((m) => (
          <GlassCard key={m.id} contentStyle={{ padding: 14 }}>
            <View style={s.rowHead}>
              <View style={s.iconBox}>
                <Ionicons name={(MCP_CATEGORIES.find(c => c.id === m.category)?.icon || 'cube-outline') as any} size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleLine}>
                  <Text style={s.slug}>{m.slug}</Text>
                  {m.isOfficial && (
                    <View style={s.verifiedBadge}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={s.name} numberOfLines={1}>{m.name}</Text>
                <Text style={s.desc} numberOfLines={2}>{m.description}</Text>
              </View>
              <Switch
                value={m.isEnabled}
                onValueChange={(v) => handleToggle(m, v)}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: AppColors.primary }}
                thumbColor="#fff"
              />
            </View>
            {m.env.length > 0 && (
              <View style={s.envRow}>
                <View style={s.envStatusChip}>
                  <Ionicons
                    name={hasAllRequired(m) ? 'checkmark-circle' : 'alert-circle'}
                    size={12}
                    color={hasAllRequired(m) ? '#7ee787' : '#ffb454'}
                  />
                  <Text style={[s.envStatusText, { color: hasAllRequired(m) ? '#7ee787' : '#ffb454' }]}>
                    {hasAllRequired(m) ? 'Configurato' : 'Configurazione richiesta'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setEditingEnv(m)} style={s.smallBtn}>
                  <Ionicons name="key-outline" size={12} color="#fff" />
                  <Text style={s.smallBtnText}>Env</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={s.actionsRow}>
              <TouchableOpacity onPress={() => handleDelete(m)} style={s.dangerBtn} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={13} color="#ff8a8a" />
                <Text style={s.dangerBtnText}>Rimuovi</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        ))}
      </View>

      {editingEnv && (
        <EnvEditor
          mcp={editingEnv}
          onClose={() => setEditingEnv(null)}
          onSaved={() => { setEditingEnv(null); onChanged(); }}
        />
      )}
    </>
  );
};

// ─── Section: Marketplace ─────────────────────────────────────────────────

const MarketplaceSection: React.FC<{ onInstalled: () => void }> = ({ onInstalled }) => {
  const [mcps, setMcps] = useState<McpServer[] | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());
  const [pendingInstall, setPendingInstall] = useState<{ mcp: McpServer; installed: McpServer } | null>(null);

  useEffect(() => {
    let cancelled = false;
    mcpApi.listMarketplace()
      .then((res) => { if (!cancelled) setMcps(res.mcps); })
      .catch(() => { if (!cancelled) setMcps([]); });
    mcpApi.listMine()
      .then((res) => { if (!cancelled) setInstalledSlugs(new Set(res.mcps.map((m) => m.slug))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleInstall = useCallback(async (mcp: McpServer) => {
    setInstalling(mcp.id);
    try {
      const res = await mcpApi.install(mcp.id);
      setInstalledSlugs((prev) => new Set(prev).add(res.mcp.slug));
      onInstalled();
      // If there are required env vars, open the editor immediately so the
      // user can finish the setup in one flow.
      const needsEnv = (res.mcp.env || []).some((e) => e.required);
      if (needsEnv) {
        setPendingInstall({ mcp, installed: res.mcp });
      } else {
        Alert.alert('Installato', `${mcp.name} è ora disponibile nei tuoi MCP.`);
      }
    } catch (e: any) {
      Alert.alert('Errore', e?.message || 'Installazione fallita');
    } finally {
      setInstalling(null);
    }
  }, [onInstalled]);

  if (mcps === null) return <Loader />;
  if (mcps.length === 0) {
    return <EmptyBlock icon="sparkles-outline" title="Marketplace vuoto" copy="Nessun MCP disponibile. Tornaci più tardi." />;
  }

  return (
    <>
      <View style={{ gap: 8, marginTop: 6 }}>
        {mcps.map((m) => {
          const installed = installedSlugs.has(m.slug);
          return (
            <GlassCard key={m.id} contentStyle={{ padding: 14 }}>
              <View style={s.rowHead}>
                <View style={s.iconBox}>
                  <Ionicons name={(MCP_CATEGORIES.find(c => c.id === m.category)?.icon || 'cube-outline') as any} size={16} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.titleLine}>
                    <Text style={s.slug}>{m.slug}</Text>
                    {m.isOfficial && (
                      <View style={s.verifiedBadge}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={s.name} numberOfLines={1}>{m.name}</Text>
                  <Text style={s.desc} numberOfLines={3}>{m.description}</Text>
                  {m.env.length > 0 && (
                    <Text style={s.metaInfo}>
                      {m.env.filter(e => e.required).length} env vars richieste
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleInstall(m)}
                disabled={installing === m.id || installed}
                style={[s.installBtn, installed && s.installedBtn, installing === m.id && { opacity: 0.5 }]}
                activeOpacity={0.85}
              >
                {installing === m.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : installed ? (
                  <>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                    <Text style={s.installBtnText}>Installato</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="add" size={14} color="#fff" />
                    <Text style={s.installBtnText}>Installa</Text>
                  </>
                )}
              </TouchableOpacity>
            </GlassCard>
          );
        })}
      </View>

      {pendingInstall && (
        <EnvEditor
          mcp={pendingInstall.installed}
          onClose={() => setPendingInstall(null)}
          onSaved={() => { setPendingInstall(null); onInstalled(); }}
        />
      )}
    </>
  );
};

// ─── Env editor modal ─────────────────────────────────────────────────────

const EnvEditor: React.FC<{ mcp: McpServer; onClose: () => void; onSaved: () => void }> = ({ mcp, onClose, onSaved }) => {
  const initial = useMemo(() => {
    const obj: Record<string, string> = {};
    for (const e of mcp.env) obj[e.name] = mcp.envValues?.[e.name] || '';
    return obj;
  }, [mcp]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(
    () => mcp.env.filter((e) => e.required).every((e) => !!values[e.name]?.trim()),
    [mcp.env, values],
  );

  const save = async () => {
    setSaving(true);
    try {
      await mcpApi.setEnvValues(mcp.id, values);
      onSaved();
    } catch (e: any) {
      Alert.alert('Errore', e?.message || 'Salvataggio fallito');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.modalBackdrop} />
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Configura {mcp.name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
            {mcp.env.map((decl) => (
              <View key={decl.name} style={s.envField}>
                <View style={s.envLabelRow}>
                  <Text style={s.envFieldLabel}>{decl.label || decl.name}</Text>
                  {decl.required && <Text style={s.envRequired}>*</Text>}
                </View>
                {decl.description && <Text style={s.envFieldDesc}>{decl.description}</Text>}
                <TextInput
                  value={values[decl.name] || ''}
                  onChangeText={(v) => setValues((prev) => ({ ...prev, [decl.name]: v }))}
                  placeholder={decl.placeholder || decl.name}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  secureTextEntry={decl.isSecret}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={s.envInput}
                />
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            onPress={save}
            disabled={!canSave || saving}
            style={[s.installBtn, (!canSave || saving) && { opacity: 0.5 }, { marginTop: 12 }]}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.installBtnText}>Salva</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function hasAllRequired(m: McpServer): boolean {
  return m.env.filter((e) => e.required).every((e) => !!m.envValues?.[e.name]);
}

const Loader: React.FC = () => (
  <View style={{ paddingVertical: 60, alignItems: 'center' }}>
    <ActivityIndicator color={AppColors.primary} />
  </View>
);

const EmptyBlock: React.FC<{ icon: any; title: string; copy: string }> = ({ icon, title, copy }) => (
  <GlassCard contentStyle={{ paddingVertical: 36, alignItems: 'center', paddingHorizontal: 24 }}>
    <View style={s.emptyIconWrap}>
      <Ionicons name={icon} size={26} color="#fff" />
    </View>
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptyCopy}>{copy}</Text>
  </GlassCard>
);

// ─── Styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0A0812' },

  tabsRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  tabBtn: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)',
  },
  tabBtnActive: { backgroundColor: PRIMARY_TINT, borderColor: `${AppColors.primary}55` },
  tabLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },

  glassCard: { borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  glassCardContent: {},
  glassReadableSurface: {
    backgroundColor: 'rgba(20,20,22,0.5)',
    borderRadius: 18,
  },

  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center', justifyContent: 'center',
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slug: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'Menlo' },
  name: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', marginTop: 2 },
  desc: { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 16, marginTop: 4 },
  metaInfo: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 6 },

  verifiedBadge: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: AppColors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)',
  },

  envRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  envStatusChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  envStatusText: { fontSize: 11, fontWeight: '600' },
  smallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  smallBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  dangerBtnText: { color: '#ff8a8a', fontSize: 11, fontWeight: '600' },

  installBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: AppColors.primary,
    paddingVertical: 12, borderRadius: 10,
    marginTop: 12,
  },
  installedBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  installBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Empty state
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: PRIMARY_TINT,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptyCopy: { color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Modal
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  modalSheet: {
    backgroundColor: '#13101e',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

  envField: { marginBottom: 14 },
  envLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  envFieldLabel: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  envRequired: { color: '#ff8a8a', fontSize: 12, fontWeight: '700' },
  envFieldDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 6, lineHeight: 15 },
  envInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    color: '#fff', fontSize: 13,
  },
});
