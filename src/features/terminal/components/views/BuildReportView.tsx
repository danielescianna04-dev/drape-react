import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tab } from '../../../../core/tabs/tabStore';
import { config } from '../../../../config/config';
import { getAuthHeaders } from '../../../../core/api/getAuthToken';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';
import { VerificationSection } from './VerificationSection';

// ── Types ──

interface BuildAction {
  id: string;
  step: string;
  title: string;
  status: 'running' | 'completed' | 'failed' | 'fixed' | 'skipped';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  details?: string;
  error?: string;
  fix?: string;
  metadata?: Record<string, any>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  filesCreated?: string[];
  filesModified?: string[];
  filesDeleted?: string[];
}

interface ChatSession {
  id: string;
  name: string;
  createdAt: string;
  messages: ChatMessage[];
}

interface BuildReport {
  projectId: string;
  projectName: string;
  technology: string;
  cloudMode: boolean;
  createdAt: string;
  completedAt?: string;
  totalDurationMs?: number;
  status: 'running' | 'completed' | 'failed';
  actions: BuildAction[];
  chatSessions?: ChatSession[];
  summary: {
    filesGenerated: number;
    filesProtected: number;
    tablesCreated: string[];
    seedRecords: number;
    pagesVerified: number;
    issuesFound: number;
    issuesFixed: number;
    aiModel: string;
    aiTokensUsed: number;
    envVars?: string[];
    generatedFiles?: string[];
    sqlExecuted?: string;
  };
}

interface Props {
  tab: Tab;
}

// ── Helpers ──

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── Expandable Card ──

const ExpandableCard = ({ icon, iconColor, title, count, children }: {
  icon: string; iconColor: string; title: string; count?: number; children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={st.card}>
      <TouchableOpacity style={st.cardHeader} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <View style={st.cardHeaderLeft}>
          <Ionicons name={icon as any} size={16} color={iconColor} />
          <Text style={st.cardTitle}>{title}</Text>
          {count != null && <View style={st.countBadge}><Text style={st.countText}>{count}</Text></View>}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color="#555" />
      </TouchableOpacity>
      {open && <View style={st.cardBody}>{children}</View>}
    </View>
  );
};

// ── Section Header ──

const SectionHeader = ({ icon, iconColor, title, time, defaultOpen = false, children }: {
  icon: string; iconColor: string; title: string; time?: string; defaultOpen?: boolean; children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={st.section}>
      <TouchableOpacity style={st.sectionHeader} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <View style={[st.sectionDot, { backgroundColor: iconColor }]}>
          <Ionicons name={icon as any} size={14} color="#fff" />
        </View>
        <View style={st.sectionInfo}>
          <Text style={st.sectionTitle}>{title}</Text>
          {time && <Text style={st.sectionTime}>{time}</Text>}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#555" />
      </TouchableOpacity>
      {open && <View style={st.sectionBody}>{children}</View>}
    </View>
  );
};

// ── Main Component ──

export const BuildReportView: React.FC<Props> = ({ tab }) => {
  const [report, setReport] = useState<BuildReport | null>(null);
  const [verificationReport, setVerificationReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const currentProjectId = useTerminalStore(s => s.currentWorkstation?.id);
  const insets = useSafeAreaInsets();

  const loadReport = useCallback(async () => {
    if (!currentProjectId) { setLoading(false); return; }
    setLoading(true);
    try {
      console.log('[BuildReport] Loading for project:', currentProjectId);
      const headers = await getAuthHeaders();
      console.log('[BuildReport] Auth headers:', Object.keys(headers));
      const url = `${config.apiUrl}/workstation/${currentProjectId}/build-report`;
      console.log('[BuildReport] Fetching:', url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);
      console.log('[BuildReport] Response status:', res.status);
      const data = await res.json();
      console.log('[BuildReport] Data:', JSON.stringify(data).substring(0, 200));
      if (data.success && data.report) {
        console.log('[BuildReport] Report loaded. Files:', data.report.summary?.generatedFiles?.length, 'Envs:', data.report.summary?.envVars?.length, 'Tables:', data.report.summary?.tablesCreated?.length, 'Chats:', data.report.chatSessions?.length);
        setReport(data.report);
      }
      // Also fetch verification report
      try {
        const vUrl = `${config.apiUrl}/workstation/${currentProjectId}/verification-report`;
        const vRes = await fetch(vUrl, { headers, signal: controller.signal });
        const vData = await vRes.json();
        if (vData.success && vData.report) {
          setVerificationReport(vData.report);
        }
      } catch {}
    } catch (err: any) {
      console.warn('[BuildReport] Failed:', err?.message);
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  if (loading) {
    return <View style={st.center}><ActivityIndicator size="large" color="#8B5CF6" /><Text style={st.loadingText}>Loading...</Text></View>;
  }

  if (!report) {
    return (
      <View style={st.center}>
        <Ionicons name="time-outline" size={48} color="#333" />
        <Text style={st.emptyTitle}>No history yet</Text>
        <Text style={st.emptySubtitle}>Create a project with Cloud Mode to see the project history</Text>
      </View>
    );
  }

  const totalChats = report.chatSessions?.length || 0;
  const totalChanges = (report.chatSessions || []).reduce((sum, chat) =>
    sum + chat.messages.reduce((ms, m) =>
      ms + (m.filesCreated?.length || 0) + (m.filesModified?.length || 0) + (m.filesDeleted?.length || 0), 0), 0);

  return (
    <ScrollView style={st.container} contentContainerStyle={[st.content, { paddingTop: insets.top + 48 }]}>
      {/* Header */}
      <View style={st.header}>
        <Ionicons name="time-outline" size={20} color="#8B5CF6" />
        <Text style={st.headerTitle}>Project History</Text>
      </View>
      <Text style={st.headerSubtitle}>{report.projectName}</Text>

      {/* Stats */}
      <View style={st.statsRow}>
        <View style={st.statItem}>
          <Text style={st.statValue}>{report.summary.filesGenerated}</Text>
          <Text style={st.statLabel}>Files</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Text style={st.statValue}>{report.summary.tablesCreated.length}</Text>
          <Text style={st.statLabel}>Tables</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Text style={st.statValue}>{totalChats}</Text>
          <Text style={st.statLabel}>Chats</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Text style={st.statValue}>{totalChanges}</Text>
          <Text style={st.statLabel}>Changes</Text>
        </View>
      </View>

      {/* ═══ CREAZIONE ═══ */}
      <SectionHeader
        icon="rocket-outline"
        iconColor="#8B5CF6"
        title="Creazione"
        time={`${formatDate(report.createdAt)}, ${formatTime(report.createdAt)}`}
        defaultOpen={true}
      >
        {/* Files Generated */}
        {report.summary.generatedFiles && report.summary.generatedFiles.length > 0 && (
          <ExpandableCard icon="document-outline" iconColor="#3B82F6" title="File generati" count={report.summary.generatedFiles.length}>
            {report.summary.generatedFiles.map(f => (
              <Text key={f} style={st.monoItem}>{f}</Text>
            ))}
          </ExpandableCard>
        )}

        {/* Tables Created */}
        {report.summary.tablesCreated.length > 0 && (
          <ExpandableCard icon="server-outline" iconColor="#22C55E" title="Tabelle create" count={report.summary.tablesCreated.length}>
            {report.summary.tablesCreated.map(t => (
              <View key={t} style={st.tableRow}>
                <View style={st.tableDot} />
                <Text style={st.monoItem}>{t}</Text>
              </View>
            ))}
            {report.summary.sqlExecuted && (
              <View style={st.sqlBox}>
                <Text style={st.sqlText}>{report.summary.sqlExecuted}</Text>
              </View>
            )}
          </ExpandableCard>
        )}

        {/* Env Vars */}
        {report.summary.envVars && report.summary.envVars.length > 0 && (
          <ExpandableCard icon="key-outline" iconColor="#F59E0B" title="Variabili ambiente" count={report.summary.envVars.length}>
            {report.summary.envVars.map(v => (
              <Text key={v} style={st.monoItem}>{v}</Text>
            ))}
          </ExpandableCard>
        )}

        {/* Errors */}
        {report.actions.filter(a => a.status === 'failed').map(a => (
          <View key={a.id} style={st.errorItem}>
            <Ionicons name="warning-outline" size={14} color="#EF4444" />
            <Text style={st.errorItemText}>{a.error || a.title}</Text>
          </View>
        ))}

        {/* Success indicator */}
        {report.status === 'completed' && report.actions.every(a => a.status !== 'failed') && (
          <View style={st.successItem}>
            <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
            <Text style={st.successItemText}>Progetto creato con successo</Text>
          </View>
        )}
      </SectionHeader>

      {/* ═══ VERIFICA & TEST QA ═══ */}
      {verificationReport && (
        <SectionHeader
          icon="shield-checkmark-outline"
          iconColor="#22C55E"
          title="Verifica & Test QA"
          time={verificationReport.completedAt ? `${formatDate(verificationReport.completedAt)}, ${formatTime(verificationReport.completedAt)}` : undefined}
        >
          <VerificationSection report={verificationReport} />
        </SectionHeader>
      )}

      {/* ═══ CHAT SESSIONS ═══ */}
      {report.chatSessions?.map(chat => (
        <SectionHeader
          key={chat.id}
          icon="chatbubble-outline"
          iconColor="#3B82F6"
          title={chat.name}
          time={`${formatDate(chat.createdAt)}, ${formatTime(chat.createdAt)}`}
        >
          {chat.messages.map((msg, i) => (
            <View key={`${chat.id}-${i}`} style={st.messageItem}>
              {/* User or AI indicator */}
              <View style={st.messageHeader}>
                <View style={[st.messageAvatar, { backgroundColor: msg.role === 'user' ? '#8B5CF620' : '#22C55E20' }]}>
                  <Ionicons
                    name={msg.role === 'user' ? 'person' : 'sparkles'}
                    size={10}
                    color={msg.role === 'user' ? '#8B5CF6' : '#22C55E'}
                  />
                </View>
                <Text style={st.messageRole}>{msg.role === 'user' ? 'Tu' : 'AI'}</Text>
                <Text style={st.messageTime}>{formatTime(msg.timestamp)}</Text>
              </View>

              {/* Message content */}
              <Text style={st.messageText} numberOfLines={4}>{msg.content}</Text>

              {/* File changes */}
              {msg.filesCreated?.map(f => (
                <View key={`c-${f}`} style={st.fileChange}>
                  <Text style={[st.fileChangeIcon, { color: '#22C55E' }]}>+</Text>
                  <Text style={st.fileChangePath}>{f}</Text>
                </View>
              ))}
              {msg.filesModified?.map(f => (
                <View key={`m-${f}`} style={st.fileChange}>
                  <Text style={[st.fileChangeIcon, { color: '#F59E0B' }]}>~</Text>
                  <Text style={st.fileChangePath}>{f}</Text>
                </View>
              ))}
              {msg.filesDeleted?.map(f => (
                <View key={`d-${f}`} style={st.fileChange}>
                  <Text style={[st.fileChangeIcon, { color: '#EF4444' }]}>-</Text>
                  <Text style={st.fileChangePath}>{f}</Text>
                </View>
              ))}
            </View>
          ))}
        </SectionHeader>
      ))}

      {/* Refresh */}
      <TouchableOpacity style={st.refreshBtn} onPress={loadReport}>
        <Ionicons name="refresh-outline" size={14} color="#8B5CF6" />
        <Text style={st.refreshText}>Aggiorna</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ── Styles ──

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, paddingBottom: 50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a', gap: 10 },
  loadingText: { color: '#666', fontSize: 13 },
  emptyTitle: { color: '#ccc', fontSize: 17, fontWeight: '600' },
  emptySubtitle: { color: '#555', fontSize: 12, textAlign: 'center', paddingHorizontal: 40 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: '#666', fontSize: 12, marginBottom: 14 },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1a1a1a' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#555', fontSize: 10, marginTop: 1 },
  statDivider: { width: 1, height: 24, backgroundColor: '#222' },

  // Section
  section: { marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  sectionDot: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  sectionInfo: { flex: 1 },
  sectionTitle: { color: '#ddd', fontSize: 14, fontWeight: '600' },
  sectionTime: { color: '#555', fontSize: 11 },
  sectionBody: { marginLeft: 14, paddingLeft: 24, borderLeftWidth: 1, borderLeftColor: '#1a1a1a', paddingBottom: 8 },

  // Expandable Card
  card: { backgroundColor: '#111', borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: '#1a1a1a', overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: '#bbb', fontSize: 12, fontWeight: '500' },
  countBadge: { backgroundColor: '#8B5CF620', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  countText: { color: '#8B5CF6', fontSize: 10, fontWeight: '600' },
  cardBody: { paddingHorizontal: 10, paddingBottom: 10, gap: 2 },

  // Mono items
  monoItem: { color: '#777', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', paddingVertical: 2 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tableDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#22C55E' },
  sqlBox: { backgroundColor: '#0a0a0a', borderRadius: 6, padding: 8, marginTop: 6 },
  sqlText: { color: '#666', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Errors / Success
  errorItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#EF444410', padding: 8, borderRadius: 8, marginBottom: 4 },
  errorItemText: { color: '#EF4444', fontSize: 11, flex: 1 },
  successItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#22C55E10', padding: 8, borderRadius: 8, marginBottom: 4 },
  successItemText: { color: '#22C55E', fontSize: 11 },

  // Chat Messages
  messageItem: { backgroundColor: '#111', borderRadius: 8, padding: 8, marginBottom: 6 },
  messageHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  messageAvatar: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  messageRole: { color: '#aaa', fontSize: 11, fontWeight: '600' },
  messageTime: { color: '#444', fontSize: 10, marginLeft: 'auto' },
  messageText: { color: '#888', fontSize: 12, lineHeight: 17, marginBottom: 4 },

  // File changes
  fileChange: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 1 },
  fileChangeIcon: { fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', width: 12 },
  fileChangePath: { color: '#666', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },

  // Refresh
  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, backgroundColor: '#111', borderRadius: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  refreshText: { color: '#8B5CF6', fontSize: 12, fontWeight: '500' },
});
