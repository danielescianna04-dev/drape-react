// Project insights — owner-only sheet that surfaces the three
// new platform features (analytics, versioning, custom domains)
// for an already-published project. Mounted as a tab modal so we
// don't add a screen-level route for a niche surface.
//
// All data comes from /creator/* endpoints. Best-effort: if a
// section fails (e.g. analytics DB unreachable) the section
// renders an inline error and the others still work.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator,
  ScrollView, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { config } from '../../config/config';
import { getAuthHeaders } from '../../core/api/getAuthToken';

type Tab = 'analytics' | 'versions' | 'domain';

interface Props {
  visible: boolean;
  onClose: () => void;
  projectId: string;
}

interface AnalyticsSummary {
  totalViews: number;
  uniqueVisitors: number;
  byDay: { day: string; views: number }[];
  topCountries: { country: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
}

interface VersionRow {
  id: string;
  versionNumber: number;
  sizeBytes: number | null;
  message: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DomainRow {
  domain: string;
  status: string;
  createdAt: string;
  verifiedAt: string | null;
  lastError: string | null;
}

// Reusable body — used both as a bottom sheet and as a full-page tab.
export const ProjectInsightsContent: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [tab, setTab] = useState<Tab>('analytics');
  return (
    <>
      <View style={s.tabs}>
        {([
          { id: 'analytics', label: 'Analytics', icon: 'stats-chart-outline' },
          { id: 'versions', label: 'Versioni', icon: 'time-outline' },
          { id: 'domain', label: 'Dominio', icon: 'globe-outline' },
        ] as const).map(t => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setTab(t.id)}
            >
              <Ionicons name={t.icon as any} size={14} color={active ? '#0a0a0c' : 'rgba(255,255,255,0.7)'} />
              <Text style={[s.tabText, active && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {tab === 'analytics' && <AnalyticsTab projectId={projectId} />}
        {tab === 'versions' && <VersionsTab projectId={projectId} />}
        {tab === 'domain' && <DomainTab projectId={projectId} />}
      </ScrollView>
    </>
  );
};

export const ProjectInsightsSheet: React.FC<Props> = ({ visible, onClose, projectId }) => {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Insights</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <ProjectInsightsContent projectId={projectId} />
        </View>
      </View>
    </Modal>
  );
};

// ----------------------------------------------------------------
// Analytics tab
// ----------------------------------------------------------------

const AnalyticsTab: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const r = await fetch(`${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/analytics`, { headers });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) { setErr(j?.error || 'Errore'); return; }
        setData(j.summary);
        setSlug(j.slug);
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const maxViews = useMemo(() => Math.max(1, ...(data?.byDay.map(d => d.views) || [0])), [data]);

  if (loading) return <ActivityIndicator color="#A78BFA" style={{ marginTop: 40 }} />;
  if (err) return <Text style={s.empty}>{err}</Text>;
  if (!slug || !data) return <Text style={s.empty}>Pubblica il progetto per vedere le statistiche.</Text>;

  return (
    <View>
      <View style={s.statRow}>
        <View style={s.statBox}>
          <Text style={s.statValue}>{data.totalViews}</Text>
          <Text style={s.statLabel}>Visite (30g)</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statValue}>{data.uniqueVisitors}</Text>
          <Text style={s.statLabel}>Visitatori unici</Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>Visite per giorno</Text>
      {data.byDay.length === 0 ? (
        <Text style={s.empty}>Ancora nessuna visita.</Text>
      ) : (
        <View style={s.chart}>
          {data.byDay.map(d => (
            <View key={d.day} style={s.barCol}>
              <View style={[s.bar, { height: Math.max(3, (d.views / maxViews) * 80) }]} />
              <Text style={s.barLabel}>{d.day.slice(5)}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={s.sectionTitle}>Top paesi</Text>
      {data.topCountries.length === 0 ? (
        <Text style={s.empty}>—</Text>
      ) : data.topCountries.map(c => (
        <View key={c.country} style={s.kvRow}>
          <Text style={s.kvKey}>{c.country}</Text>
          <Text style={s.kvVal}>{c.views}</Text>
        </View>
      ))}

      <Text style={s.sectionTitle}>Top referrer</Text>
      {data.topReferrers.length === 0 ? (
        <Text style={s.empty}>—</Text>
      ) : data.topReferrers.map(r => (
        <View key={r.referrer} style={s.kvRow}>
          <Text style={s.kvKey} numberOfLines={1}>{r.referrer}</Text>
          <Text style={s.kvVal}>{r.views}</Text>
        </View>
      ))}
    </View>
  );
};

// ----------------------------------------------------------------
// Versions tab
// ----------------------------------------------------------------

const VersionsTab: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/versions`, { headers });
      const j = await r.json();
      setVersions(j.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const rollback = useCallback(async (v: VersionRow) => {
    Alert.alert(
      'Ripristina versione',
      `Tornare alla versione v${v.versionNumber} del ${new Date(v.createdAt).toLocaleString()}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Ripristina', style: 'destructive', onPress: async () => {
            setRollingBack(v.id);
            try {
              const headers = await getAuthHeaders();
              const r = await fetch(`${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/rollback/${encodeURIComponent(v.id)}`, {
                method: 'POST', headers,
              });
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                Alert.alert('Errore', j?.error || 'Rollback non riuscito');
                return;
              }
              await load();
              Alert.alert('Fatto', `La versione v${v.versionNumber} è ora attiva.`);
            } catch (e: any) {
              Alert.alert('Errore', String(e?.message || e));
            } finally {
              setRollingBack(null);
            }
          },
        },
      ],
    );
  }, [projectId, load]);

  if (loading) return <ActivityIndicator color="#A78BFA" style={{ marginTop: 40 }} />;
  if (!versions || versions.length === 0) return <Text style={s.empty}>Nessuna versione ancora. Pubblica per crearne una.</Text>;

  return (
    <View>
      {versions.map(v => (
        <View key={v.id} style={s.versionRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.versionTitle}>v{v.versionNumber}</Text>
              {v.isActive && (
                <View style={s.activePill}>
                  <Text style={s.activePillText}>ATTIVA</Text>
                </View>
              )}
            </View>
            <Text style={s.versionMeta}>
              {new Date(v.createdAt).toLocaleString()} · {v.sizeBytes ? `${(v.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '—'}
            </Text>
          </View>
          {!v.isActive && (
            <TouchableOpacity
              style={s.rollbackBtn}
              onPress={() => rollback(v)}
              disabled={rollingBack === v.id}
            >
              {rollingBack === v.id ? (
                <ActivityIndicator size="small" color="#0a0a0c" />
              ) : (
                <>
                  <Ionicons name="arrow-undo" size={14} color="#0a0a0c" />
                  <Text style={s.rollbackBtnText}>Ripristina</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
};

// ----------------------------------------------------------------
// Custom domain tab
// ----------------------------------------------------------------

const DomainTab: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [domains, setDomains] = useState<DomainRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<{ name: string; value: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/custom-domains`, { headers });
      const j = await r.json();
      setDomains(j.domains || []);
    } catch {
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async () => {
    setErr(null);
    const domain = input.trim().toLowerCase();
    if (!domain) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`${config.apiUrl}/creator/projects/${encodeURIComponent(projectId)}/custom-domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ domain }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.message || j?.error || 'Errore');
        return;
      }
      setInstructions({ name: j.instructions?.name || domain, value: j.instructions?.value || 'cname.bynot.app' });
      setInput('');
      await load();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [input, projectId, load]);

  const remove = useCallback(async (domain: string) => {
    Alert.alert('Rimuovere dominio?', domain, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Rimuovi', style: 'destructive', onPress: async () => {
          try {
            const headers = await getAuthHeaders();
            await fetch(`${config.apiUrl}/creator/custom-domain/${encodeURIComponent(domain)}`, {
              method: 'DELETE', headers,
            });
            await load();
          } catch {}
        },
      },
    ]);
  }, [load]);

  return (
    <View>
      <Text style={s.sectionTitle}>Aggiungi un dominio</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="esempio.com"
          placeholderTextColor="rgba(255,255,255,0.3)"
          editable={!saving}
        />
        <TouchableOpacity style={[s.addBtn, (saving || !input) && { opacity: 0.5 }]} onPress={add} disabled={saving || !input}>
          {saving ? <ActivityIndicator size="small" color="#0a0a0c" /> : <Text style={s.addBtnText}>Aggiungi</Text>}
        </TouchableOpacity>
      </View>
      {err && <Text style={s.err}>{err}</Text>}
      {instructions && (
        <View style={s.dnsCard}>
          <Text style={s.dnsTitle}>Configura il DNS</Text>
          <Text style={s.dnsText}>Imposta questo record CNAME presso il tuo registrar:</Text>
          <View style={s.dnsRow}>
            <Text style={s.dnsKey}>Tipo</Text>
            <Text style={s.dnsVal}>CNAME</Text>
          </View>
          <View style={s.dnsRow}>
            <Text style={s.dnsKey}>Nome</Text>
            <Text style={s.dnsVal}>{instructions.name}</Text>
          </View>
          <View style={s.dnsRow}>
            <Text style={s.dnsKey}>Valore</Text>
            <TouchableOpacity onPress={() => Clipboard.setStringAsync(instructions.value)}>
              <Text style={[s.dnsVal, { color: '#A78BFA' }]}>{instructions.value} ⧉</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={s.sectionTitle}>Domini configurati</Text>
      {loading ? <ActivityIndicator color="#A78BFA" /> : (
        domains && domains.length > 0 ? domains.map(d => (
          <View key={d.domain} style={s.domainRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.domainName}>{d.domain}</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 }}>
                <View style={[s.statusDot, statusColor(d.status)]} />
                <Text style={s.domainStatus}>{statusLabel(d.status)}</Text>
              </View>
              {d.lastError && <Text style={s.err}>{d.lastError}</Text>}
            </View>
            <TouchableOpacity onPress={() => remove(d.domain)} style={s.removeBtn}>
              <Ionicons name="trash-outline" size={16} color="rgba(255, 59, 48, 0.85)" />
            </TouchableOpacity>
          </View>
        )) : <Text style={s.empty}>Nessun dominio.</Text>
      )}
    </View>
  );
};

function statusColor(status: string) {
  switch (status) {
    case 'active': return { backgroundColor: '#00D084' };
    case 'verified': return { backgroundColor: '#A78BFA' };
    case 'pending': return { backgroundColor: '#FFAA00' };
    case 'failed': return { backgroundColor: '#FF4444' };
    default: return { backgroundColor: 'rgba(255,255,255,0.3)' };
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'active': return 'Attivo';
    case 'verified': return 'DNS verificato, in emissione cert...';
    case 'pending': return 'In attesa del DNS';
    case 'failed': return 'Verifica fallita';
    default: return status;
  }
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0a0a0c', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '88%', borderTopWidth: 1, borderColor: '#2a2a36' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#1c1c24' },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  tabs: { flexDirection: 'row', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: '#1c1c24' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  tabActive: { backgroundColor: '#A78BFA' },
  tabText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#0a0a0c', fontWeight: '700' },
  empty: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 24, fontSize: 13 },
  err: { color: '#FF4444', fontSize: 12, marginTop: 4, marginBottom: 8 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 18, marginBottom: 8 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  statBox: { flex: 1, backgroundColor: '#131318', borderWidth: 1, borderColor: '#2a2a36', borderRadius: 14, padding: 14, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '700' },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 110, paddingTop: 10, paddingBottom: 4, backgroundColor: '#131318', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#2a2a36' },
  barCol: { flex: 1, alignItems: 'center' },
  bar: { width: '100%', maxWidth: 18, backgroundColor: '#A78BFA', borderRadius: 3 },
  barLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, marginTop: 4 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1c1c24' },
  kvKey: { color: 'rgba(255,255,255,0.85)', fontSize: 13, flex: 1 },
  kvVal: { color: '#A78BFA', fontSize: 13, fontWeight: '700' },
  versionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#131318', borderWidth: 1, borderColor: '#2a2a36', borderRadius: 12, padding: 12, marginBottom: 8 },
  versionTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  versionMeta: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  activePill: { backgroundColor: '#00D084', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  activePillText: { color: '#0a0a0c', fontSize: 9, fontWeight: '800' },
  rollbackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#A78BFA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  rollbackBtnText: { color: '#0a0a0c', fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 13 },
  addBtn: { backgroundColor: '#A78BFA', paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#0a0a0c', fontWeight: '700' },
  dnsCard: { backgroundColor: '#131318', borderWidth: 1, borderColor: '#2a2a36', borderRadius: 14, padding: 12, marginBottom: 8 },
  dnsTitle: { color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 4 },
  dnsText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 8 },
  dnsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  dnsKey: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  dnsVal: { color: '#fff', fontSize: 12, fontFamily: 'monospace' },
  domainRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#131318', borderWidth: 1, borderColor: '#2a2a36', borderRadius: 12, padding: 12, marginBottom: 8 },
  domainName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  domainStatus: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  removeBtn: { padding: 6 },
});
