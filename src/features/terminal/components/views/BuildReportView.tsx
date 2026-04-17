import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
    aiGenerationCostEur?: number;
    aiGenerationTokensUsed?: number;
    aiVerifyCostEur?: number;
    aiVerifyTokensUsed?: number;
    aiVerifyEscalationCostEur?: number;
    aiVerifyEscalationTokensUsed?: number;
    aiTotalCostEur?: number;
    envVars?: string[];
    generatedFiles?: string[];
    sqlExecuted?: string;
    creationPrompt?: string;
    creationAnswers?: Record<string, string | string[]>;
    projectComplexity?: 'simple' | 'medium' | 'complex';
    projectComplexityScore?: number;
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

const formatCostEur = (value: number) => `€${value.toFixed(value >= 1 ? 2 : 4)}`;

const prettifyAnswerKey = (key: string) =>
  key
    .replace(/^q\d+$/i, (match) => `Domanda ${match.slice(1)}`)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatAnswerValue = (value: string | string[]) => {
  if (Array.isArray(value)) {
    const clean = value.filter(Boolean);
    return clean.length > 0 ? clean.join(', ') : 'Nessuna risposta';
  }
  return value?.trim() ? value : 'Nessuna risposta';
};

const RUNTIME_STEPS = ['runtime', 'dev-server', 'compile', 'install', 'warming', 'verify', 'database'] as const;
const CREATION_ONLY_ERROR_STEPS = ['verify', 'runtime', 'compile', 'install', 'warming', 'dev-server'] as const;
const VERIFY_FAILED_ATTEMPT_RE = /^Verification attempt (\d+) failed$/i;
const VERIFY_FIXED_ATTEMPT_RE = /^(Auto-fix applied|Cache cleared \+ restart) \(attempt (\d+)\)$/i;
const RECOVERABLE_RUNTIME_STEPS = ['runtime', 'compile', 'dev-server', 'warming'] as const;
const CACHE_CORRUPTION_TITLES = [
  'Next.js routes-manifest.json missing',
  'Next.js middleware-manifest.json missing',
  'Stale webpack chunk',
] as const;

type DerivedBuildAction = BuildAction & {
  displayStatus: BuildAction['status'];
};

const getVerifyAttemptNumber = (action: BuildAction): number | null => {
  const failedMatch = action.title.match(VERIFY_FAILED_ATTEMPT_RE);
  if (failedMatch) return Number(failedMatch[1]);
  const fixedMatch = action.title.match(VERIFY_FIXED_ATTEMPT_RE);
  if (fixedMatch) return Number(fixedMatch[2]);
  return null;
};

const normalizeActionErrorKey = (action: BuildAction): string => {
  const raw = `${action.step}|${action.title}|${action.error || ''}|${action.fix || ''}`;
  return raw
    .replace(/\d+/g, '#')
    .replace(/\/home\/coder\/project\/[^\s'"]+/g, '<project-file>')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 240);
};

const deriveActionStatuses = (
  actions: BuildAction[],
  verificationReport: any
): DerivedBuildAction[] => {
  const verificationPassed = verificationReport?.status === 'passed';
  const resolvedVerifyAttempts = new Set<number>();
  const fixedActionTimesByKey = new Map<string, number>();
  let latestVerifyRecoveryTime = 0;
  let latestRuntimeRecoveryTime = 0;

  for (const action of actions) {
    if (action.status !== 'fixed') continue;
    const completedAt = action.completedAt
      ? new Date(action.completedAt).getTime()
      : (action.startedAt ? new Date(action.startedAt).getTime() : 0);
    fixedActionTimesByKey.set(
      normalizeActionErrorKey(action),
      Math.max(fixedActionTimesByKey.get(normalizeActionErrorKey(action)) || 0, completedAt),
    );

    if (action.step === 'verify') {
      const attempt = getVerifyAttemptNumber(action);
      if (attempt != null) resolvedVerifyAttempts.add(attempt);
      latestVerifyRecoveryTime = Math.max(latestVerifyRecoveryTime, completedAt);
    }
  }

  for (const action of actions) {
    if (action.step !== 'dev-server') continue;
    if (action.status !== 'fixed') continue;
    if (!/Runtime recovery applied|Next\.js cache corruption/i.test(action.title)) continue;
    const completedAt = action.completedAt ? new Date(action.completedAt).getTime() : 0;
    latestRuntimeRecoveryTime = Math.max(latestRuntimeRecoveryTime, completedAt);
  }

  return actions.map((action) => {
    let displayStatus = action.status;

    if (action.step === 'verify' && action.status === 'failed') {
      const attempt = getVerifyAttemptNumber(action);
      const isAttemptFailure = attempt != null && VERIFY_FAILED_ATTEMPT_RE.test(action.title);
      const isExhausted = /Verification exhausted all attempts/i.test(action.title);

      if ((isAttemptFailure && resolvedVerifyAttempts.has(attempt!)) || (isExhausted && verificationPassed)) {
        displayStatus = 'fixed';
      }
    }

    if (
      action.status === 'failed' &&
      RECOVERABLE_RUNTIME_STEPS.includes(action.step as any)
    ) {
      const actionTime = action.completedAt
        ? new Date(action.completedAt).getTime()
        : new Date(action.startedAt).getTime();
      if (
        latestVerifyRecoveryTime > 0 &&
        actionTime <= latestVerifyRecoveryTime &&
        (verificationPassed || action.step !== 'verify')
      ) {
        displayStatus = 'fixed';
      }
    }

    if (
      action.status === 'failed' &&
      ['compile', 'runtime', 'dev-server', 'warming'].includes(action.step)
    ) {
      const actionTime = action.completedAt
        ? new Date(action.completedAt).getTime()
        : new Date(action.startedAt).getTime();
      if (latestVerifyRecoveryTime > 0 && actionTime <= latestVerifyRecoveryTime) {
        displayStatus = 'fixed';
      }
    }

    if (
      action.status === 'failed' &&
      action.step === 'runtime' &&
      CACHE_CORRUPTION_TITLES.includes(action.title as any)
    ) {
      const actionTime = action.completedAt
        ? new Date(action.completedAt).getTime()
        : new Date(action.startedAt).getTime();
      if (latestRuntimeRecoveryTime > 0 && actionTime <= latestRuntimeRecoveryTime) {
        displayStatus = 'fixed';
      }
    }

    if (action.status === 'failed') {
      const actionTime = action.completedAt
        ? new Date(action.completedAt).getTime()
        : new Date(action.startedAt).getTime();
      const recoveredAt = fixedActionTimesByKey.get(normalizeActionErrorKey(action)) || 0;
      if (recoveredAt > 0 && actionTime <= recoveredAt) {
        displayStatus = 'fixed';
      }
    }

    return { ...action, displayStatus };
  });
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
      const headers = await getAuthHeaders();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      // Use aggregated endpoint first
      const histUrl = `${config.apiUrl}/workstation/${currentProjectId}/project-history`;
      const histRes = await fetch(histUrl, { headers, signal: controller.signal }).catch(() => null);
      clearTimeout(timeout);

      if (histRes?.ok) {
        const histData = await histRes.json();
        if (histData.success && histData.history) {
          if (histData.history.buildReport) setReport(histData.history.buildReport);
          if (histData.history.verificationReport) setVerificationReport(histData.history.verificationReport);
          // qaReport is merged into verificationReport for display
          if (histData.history.qaReport && !histData.history.verificationReport?.qaReport) {
            setVerificationReport((prev: any) => ({
              ...(prev || {}),
              qaReport: histData.history.qaReport,
            }));
          }
          setLoading(false);
          return;
        }
      }

      // Fallback: legacy endpoints
      const url = `${config.apiUrl}/workstation/${currentProjectId}/build-report`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success && data.report) setReport(data.report);

      try {
        const vUrl = `${config.apiUrl}/workstation/${currentProjectId}/verification-report`;
        const vRes = await fetch(vUrl, { headers });
        const vData = await vRes.json();
        if (vData.success && vData.report) setVerificationReport(vData.report);
      } catch {}
    } catch (err: any) {
      console.warn('[BuildReport] Failed:', err?.message);
    } finally {
      setLoading(false);
    }
  }, [currentProjectId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Auto-refresh after creation: poll every 5s for 30s if report is empty
  useEffect(() => {
    if (report || !currentProjectId) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attempts > 6) { clearInterval(interval); return; }
      loadReport();
    }, 5000);
    return () => clearInterval(interval);
  }, [report, currentProjectId, loadReport]);

  if (loading) {
    return <View style={st.center}><ActivityIndicator size="large" color="#8B5CF6" /><Text style={st.loadingText}>Loading...</Text></View>;
  }

  // Show empty state only if absolutely no data and no verification report
  if (!report && !verificationReport) {
    return (
      <View style={st.center}>
        <Ionicons name="time-outline" size={48} color="#333" />
        <Text style={st.emptyTitle}>No history yet</Text>
        <Text style={st.emptySubtitle}>Project history will appear here after creation</Text>
        <TouchableOpacity style={st.refreshBtn} onPress={loadReport}>
          <Ionicons name="refresh-outline" size={14} color="#8B5CF6" />
          <Text style={st.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalChats = report?.chatSessions?.length || 0;
  const totalChanges = (report?.chatSessions || []).reduce((sum, chat) =>
    sum + chat.messages.reduce((ms, m) =>
      ms + (m.filesCreated?.length || 0) + (m.filesModified?.length || 0) + (m.filesDeleted?.length || 0), 0), 0);
  const allActions = report?.actions || [];
  const derivedActions = deriveActionStatuses(allActions, verificationReport);
  const creationErrors = derivedActions.filter(a =>
    a.displayStatus === 'failed' && !CREATION_ONLY_ERROR_STEPS.includes(a.step as any)
  );
  const runtimeActions = derivedActions.filter(a =>
    RUNTIME_STEPS.includes(a.step as any) && a.displayStatus !== 'completed'
  );
  const runtimeErrorCount = runtimeActions.filter(a => a.displayStatus === 'failed').length;
  const runtimeFixedCount = runtimeActions.filter(a => a.displayStatus === 'fixed').length;
  const runtimeWarningCount = runtimeActions.filter(a => a.displayStatus === 'skipped').length;
  const generatedFilesCount = report?.summary?.filesGenerated
    || report?.summary?.generatedFiles?.length
    || 0;
  const hasSparseCreationData =
    !!report &&
    generatedFilesCount === 0 &&
    !(report.actions || []).some(a => a.step?.startsWith('qa')) &&
    !report.summary?.tablesCreated?.length &&
    !!verificationReport;
  const showProjectCreatedSuccess =
    report?.status === 'completed' &&
    verificationReport?.status !== 'failed' &&
    !derivedActions.some(a => a.displayStatus === 'failed');

  return (
    <ScrollView style={st.container} contentContainerStyle={[st.content, { paddingTop: insets.top + 48 }]}>
      {/* Header */}
      <View style={st.header}>
        <Ionicons name="time-outline" size={20} color="#8B5CF6" />
        <Text style={st.headerTitle}>Project History</Text>
      </View>
      <Text style={st.headerSubtitle}>{report?.projectName || 'Project'}</Text>

      {/* Stats */}
      <View style={st.statsRow}>
        <View style={st.statItem}>
          <Text style={st.statValue}>{generatedFilesCount}</Text>
          <Text style={st.statLabel}>Files</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Text style={st.statValue}>{report?.summary?.tablesCreated?.length ?? 0}</Text>
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

      {report && (
        <View style={st.costSummaryCard}>
          <View style={st.costSummaryHeader}>
            <Ionicons name="wallet-outline" size={16} color="#F59E0B" />
            <Text style={st.costSummaryTitle}>Costo progetto</Text>
          </View>
          <Text style={st.costSummarySubtitle}>Spesa AI totale per questo progetto</Text>
          <View style={st.costSummaryHeroRow}>
            <View>
              <Text style={st.costSummaryHeroLabel}>Totale</Text>
              <Text style={st.costSummaryHeroValue}>{formatCostEur(report.summary?.aiTotalCostEur ?? 0)}</Text>
            </View>
            <View style={st.costSummaryBadgeColumn}>
              <View style={st.costSummaryBadge}>
                <Text style={st.costSummaryBadgeText}>{report.summary?.aiModel || 'AI'}</Text>
              </View>
              <View style={[st.costSummaryBadge, st.costSummaryComplexityBadge]}>
                <Text style={st.costSummaryBadgeText}>
                  {(report.summary?.projectComplexity || 'medium').toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
          <View style={st.costSummaryBreakdown}>
            <View style={st.costBreakdownItem}>
              <Text style={st.costBreakdownLabel}>Generation</Text>
              <Text style={st.costBreakdownValue}>{formatCostEur(report.summary?.aiGenerationCostEur ?? 0)}</Text>
            </View>
            <View style={st.costBreakdownItem}>
              <Text style={st.costBreakdownLabel}>Verify</Text>
              <Text style={st.costBreakdownValue}>{formatCostEur(report.summary?.aiVerifyCostEur ?? 0)}</Text>
            </View>
            <View style={st.costBreakdownItem}>
              <Text style={st.costBreakdownLabel}>Premium fix</Text>
              <Text style={st.costBreakdownValue}>{formatCostEur(report.summary?.aiVerifyEscalationCostEur ?? 0)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* ═══ CREAZIONE ═══ */}
      {report && (
      <SectionHeader
        icon="rocket-outline"
        iconColor="#8B5CF6"
        title="Creazione"
        time={`${formatDate(report.createdAt)}, ${formatTime(report.createdAt)}`}
        defaultOpen={true}
      >
        {/* Files Generated */}
        {report.summary?.generatedFiles && report.summary.generatedFiles.length > 0 && (
          <ExpandableCard icon="document-outline" iconColor="#3B82F6" title="File generati" count={report.summary.generatedFiles.length}>
            {report.summary.generatedFiles.map(f => (
              <Text key={f} style={st.monoItem}>{f}</Text>
            ))}
          </ExpandableCard>
        )}

        {report.summary?.creationPrompt?.trim() && (
          <ExpandableCard icon="chatbox-ellipses-outline" iconColor="#A855F7" title="Prompt iniziale">
            <Text style={st.promptText}>{report.summary.creationPrompt.trim()}</Text>
          </ExpandableCard>
        )}

        {report.summary?.creationAnswers && Object.keys(report.summary.creationAnswers).length > 0 && (
          <ExpandableCard
            icon="list-outline"
            iconColor="#8B5CF6"
            title="Risposte del questionario"
            count={Object.keys(report.summary.creationAnswers).length}
          >
            {Object.entries(report.summary.creationAnswers).map(([key, value]) => (
              <View key={key} style={st.answerItem}>
                <Text style={st.answerLabel}>{prettifyAnswerKey(key)}</Text>
                <Text style={st.answerValue}>{formatAnswerValue(value)}</Text>
              </View>
            ))}
          </ExpandableCard>
        )}

        {/* Tables Created */}
        {(report.summary?.tablesCreated?.length ?? 0) > 0 && (
          <ExpandableCard icon="server-outline" iconColor="#22C55E" title="Tabelle create" count={report.summary.tablesCreated.length}>
            {report.summary.tablesCreated.map(t => (
              <View key={t} style={st.tableRow}>
                <View style={st.tableDot} />
                <Text style={st.monoItem}>{t}</Text>
              </View>
            ))}
            {report.summary?.sqlExecuted && (
              <View style={st.sqlBox}>
                <Text style={st.sqlText}>{report.summary.sqlExecuted}</Text>
              </View>
            )}
          </ExpandableCard>
        )}

        {/* Env Vars */}
        {report.summary?.envVars && report.summary.envVars.length > 0 && (
          <ExpandableCard icon="key-outline" iconColor="#F59E0B" title="Variabili ambiente" count={report.summary.envVars.length}>
            {report.summary.envVars.map(v => (
              <Text key={v} style={st.monoItem}>{v}</Text>
            ))}
          </ExpandableCard>
        )}

        {/* Errors */}
        {creationErrors.map(a => (
          <View key={a.id} style={st.errorItem}>
            <Ionicons name="warning-outline" size={14} color="#EF4444" />
            <Text style={st.errorItemText}>{a.error || a.title}</Text>
          </View>
        ))}

        {/* Success indicator */}
        {showProjectCreatedSuccess && (
          <View style={st.successItem}>
            <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
            <Text style={st.successItemText}>Progetto creato con successo</Text>
          </View>
        )}

        {/* QA Actions from build report */}
        {(report.actions || []).filter(a => a.step?.startsWith('qa')).map(a => (
          <View key={a.id} style={[st.successItem, { backgroundColor: a.status === 'completed' ? '#22C55E10' : '#8B5CF610' }]}>
            <Ionicons
              name={a.status === 'completed' ? 'shield-checkmark' : a.status === 'failed' ? 'shield-half' : 'shield'}
              size={14}
              color={a.status === 'completed' ? '#22C55E' : a.status === 'failed' ? '#EF4444' : '#8B5CF6'}
            />
            <Text style={[st.successItemText, { color: a.status === 'completed' ? '#22C55E' : a.status === 'failed' ? '#EF4444' : '#8B5CF6' }]}>
              {a.title}
              {a.metadata?.qualityScore != null ? ` — Score: ${a.metadata.qualityScore}/10` : ''}
            </Text>
          </View>
        ))}
      </SectionHeader>
      )}

      {/* ═══ VERIFICA & TEST QA ═══ */}
      {verificationReport && (
        <SectionHeader
          icon="shield-checkmark-outline"
          iconColor="#22C55E"
          title="Verifica & Test QA"
          time={verificationReport.completedAt ? `${formatDate(verificationReport.completedAt)}, ${formatTime(verificationReport.completedAt)}` : undefined}
          defaultOpen={hasSparseCreationData}
        >
          <VerificationSection report={verificationReport} />
        </SectionHeader>
      )}

      {/* ═══ RUNTIME & ERRORI ═══ */}
      {(() => {
        if (runtimeActions.length === 0) return null;
        return (
          <SectionHeader
            icon="pulse-outline"
            iconColor={runtimeErrorCount > 0 ? '#EF4444' : runtimeFixedCount > 0 ? '#22C55E' : '#F59E0B'}
            title={`Runtime & Errori (${runtimeActions.length})`}
            time={`${runtimeErrorCount} non risolti, ${runtimeFixedCount} risolti${runtimeWarningCount > 0 ? `, ${runtimeWarningCount} warning` : ''}`}
          >
            {/* Summary bar */}
            <View style={st.errorSummaryBar}>
              {runtimeErrorCount > 0 && (
                <View style={st.errorSummaryItem}>
                  <View style={[st.errorSummaryDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={[st.errorSummaryText, { color: '#EF4444' }]}>{runtimeErrorCount} non risolti</Text>
                </View>
              )}
              {runtimeFixedCount > 0 && (
                <View style={st.errorSummaryItem}>
                  <View style={[st.errorSummaryDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={[st.errorSummaryText, { color: '#22C55E' }]}>{runtimeFixedCount} risolti</Text>
                </View>
              )}
              {runtimeWarningCount > 0 && (
                <View style={st.errorSummaryItem}>
                  <View style={[st.errorSummaryDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={[st.errorSummaryText, { color: '#F59E0B' }]}>{runtimeWarningCount} warning</Text>
                </View>
              )}
            </View>

            {runtimeActions.map(a => {
              const isFailed = a.displayStatus === 'failed';
              const isFixed = a.displayStatus === 'fixed';
              const bgColor = isFailed ? '#EF444410' : isFixed ? '#22C55E10' : '#F59E0B10';
              const iconName = isFailed ? 'close-circle' : isFixed ? 'checkmark-circle' : 'warning-outline';
              const iconColor = isFailed ? '#EF4444' : isFixed ? '#22C55E' : '#F59E0B';
              return (
                <View key={a.id} style={[st.runtimeItem, { backgroundColor: bgColor }]}>
                  <View style={st.runtimeItemHeader}>
                    <Ionicons name={iconName as any} size={16} color={iconColor} />
                    <Text style={[st.runtimeItemTitle, { color: iconColor }]}>
                      [{a.step}] {a.title}
                    </Text>
                    <Text style={st.runtimeItemStatus}>
                      {isFailed ? 'NON RISOLTO' : isFixed ? 'RISOLTO' : 'WARNING'}
                    </Text>
                  </View>
                  {a.error && (
                    <Text style={st.runtimeItemError} numberOfLines={4}>
                      {a.error.substring(0, 300)}
                    </Text>
                  )}
                  {a.fix && (
                    <View style={st.runtimeItemFix}>
                      <Ionicons name="checkmark" size={12} color="#22C55E" />
                      <Text style={st.runtimeItemFixText}>{a.fix}</Text>
                    </View>
                  )}
                  {a.metadata?.filesModified && (
                    <Text style={st.runtimeItemMeta}>
                      File: {(a.metadata.filesModified as string[]).join(', ')}
                    </Text>
                  )}
                </View>
              );
            })}

            {/* Debug info */}
            {report && (
              <View style={st.debugInfo}>
                <Text style={st.debugTitle}>Debug Info</Text>
                <Text style={st.debugText}>Modello: {report.summary?.aiModel || 'gemini-3-flash'}</Text>
                <Text style={st.debugText}>Token: {report.summary?.aiTokensUsed?.toLocaleString() ?? '?'}</Text>
                <Text style={st.debugText}>Costo generation: €{(report.summary?.aiGenerationCostEur ?? 0).toFixed(4)}</Text>
                <Text style={st.debugText}>Costo verify cheap: €{(report.summary?.aiVerifyCostEur ?? 0).toFixed(4)}</Text>
                <Text style={st.debugText}>Costo verify premium: €{(report.summary?.aiVerifyEscalationCostEur ?? 0).toFixed(4)}</Text>
                <Text style={st.debugText}>Costo AI totale: €{(report.summary?.aiTotalCostEur ?? 0).toFixed(4)}</Text>
                <Text style={st.debugText}>File generati: {report.summary?.filesGenerated ?? 0}</Text>
                <Text style={st.debugText}>Durata: {report.totalDurationMs ? (report.totalDurationMs / 1000).toFixed(1) + 's' : '?'}</Text>
              </View>
            )}
          </SectionHeader>
        );
      })()}

      {/* ═══ CHAT SESSIONS ═══ */}
      {report?.chatSessions?.map(chat => (
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

      {/* Actions */}
      <View style={st.actionsRow}>
        <TouchableOpacity style={st.refreshBtn} onPress={loadReport}>
          <Ionicons name="refresh-outline" size={14} color="#8B5CF6" />
          <Text style={st.refreshText}>Aggiorna</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.copyBtn} onPress={() => {
          const lines: string[] = [];
          lines.push(`=== PROJECT REPORT: ${report?.projectName || 'Unknown'} ===`);
          lines.push(`Tech: ${report?.technology || '?'} | Cloud: ${report?.cloudMode ? 'yes' : 'no'} | Status: ${report?.status || '?'}`);
          lines.push(`Created: ${report?.createdAt || '?'} | Duration: ${report?.totalDurationMs ? (report.totalDurationMs / 1000).toFixed(1) + 's' : '?'}`);
          lines.push(`Files: ${report?.summary?.filesGenerated ?? 0} | Model: ${report?.summary?.aiModel || '?'} | Tokens: ${report?.summary?.aiTokensUsed ?? 0}`);
          lines.push(`AI Cost Total: €${(report?.summary?.aiTotalCostEur ?? 0).toFixed(4)} | Generation: €${(report?.summary?.aiGenerationCostEur ?? 0).toFixed(4)} | Verify: €${(report?.summary?.aiVerifyCostEur ?? 0).toFixed(4)} | Premium: €${(report?.summary?.aiVerifyEscalationCostEur ?? 0).toFixed(4)}`);
          lines.push(`Issues found: ${report?.summary?.issuesFound ?? 0} | Fixed: ${report?.summary?.issuesFixed ?? 0}`);
          lines.push('');

          if (report?.summary?.creationPrompt?.trim()) {
            lines.push('--- PROMPT INIZIALE ---');
            lines.push(report.summary.creationPrompt.trim());
            lines.push('');
          }

          if (report?.summary?.creationAnswers && Object.keys(report.summary.creationAnswers).length > 0) {
            lines.push('--- RISPOSTE QUESTIONARIO ---');
            for (const [key, value] of Object.entries(report.summary.creationAnswers)) {
              lines.push(`${prettifyAnswerKey(key)}: ${formatAnswerValue(value)}`);
            }
            lines.push('');
          }

          // Runtime actions
          if (runtimeActions.length > 0) {
            lines.push('--- RUNTIME & ERRORS ---');
            for (const a of runtimeActions) {
              const icon = a.displayStatus === 'failed' ? '[FAIL]' : a.displayStatus === 'fixed' ? '[FIXED]' : '[OK]';
              lines.push(`${icon} [${a.step}] ${a.title}`);
              if (a.error) lines.push(`  Error: ${a.error}`);
              if (a.fix) lines.push(`  Fix: ${a.fix}`);
            }
            lines.push('');
          }

          // Verification
          if (verificationReport) {
            lines.push('--- VERIFICATION ---');
            lines.push(`Status: ${verificationReport.status || '?'}`);
            const attempts = verificationReport.backendVerification?.attempts || [];
            for (const att of attempts) {
              lines.push(`  Attempt #${att.attemptNumber}: ${att.status}`);
              for (const p of (att.pages || [])) {
                const hasErr = (p.errors?.length ?? 0) > 0 || p.checks?.hasError;
                lines.push(`    ${hasErr ? '[ERR]' : '[OK]'} ${p.path} (HTTP ${p.status ?? '?'})`);
                for (const e of (p.errors || [])) lines.push(`      ${e}`);
                for (const e of (p.checks?.jsErrors || [])) lines.push(`      JS: ${e}`);
              }
              for (const f of (att.fixes || [])) {
                lines.push(`    Fix: ${(f.filesModified || []).join(', ')} (${f.model || '?'}, ${f.duration ? (f.duration / 1000).toFixed(1) + 's' : '?'})`);
              }
            }
            lines.push('');
          }

          // Generated files
          if (report?.summary?.generatedFiles?.length) {
            lines.push('--- FILES GENERATED ---');
            for (const f of report.summary.generatedFiles) lines.push(`  ${f}`);
            lines.push('');
          }

          const text = lines.join('\n');
          Clipboard.setStringAsync(text).then(() => {
            Alert.alert('Copiato', 'Report copiato negli appunti');
          });
        }}>
          <Ionicons name="copy-outline" size={14} color="#F59E0B" />
          <Text style={st.copyText}>Copia tutto</Text>
        </TouchableOpacity>
      </View>
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
  costSummaryCard: { backgroundColor: '#111', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#3a2a07' },
  costSummaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  costSummaryTitle: { color: '#fef3c7', fontSize: 13, fontWeight: '700' },
  costSummarySubtitle: { color: '#a1a1aa', fontSize: 11, marginBottom: 12 },
  costSummaryHeroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  costSummaryHeroLabel: { color: '#a1a1aa', fontSize: 11, marginBottom: 4 },
  costSummaryHeroValue: { color: '#fbbf24', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  costSummaryBadgeColumn: { alignItems: 'flex-end', gap: 8 },
  costSummaryBadge: { backgroundColor: '#F59E0B18', borderWidth: 1, borderColor: '#F59E0B30', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  costSummaryComplexityBadge: { backgroundColor: '#8B5CF618', borderColor: '#8B5CF630' },
  costSummaryBadgeText: { color: '#fcd34d', fontSize: 10, fontWeight: '700' },
  costSummaryBreakdown: { flexDirection: 'row', gap: 8 },
  costBreakdownItem: { flex: 1, backgroundColor: '#0d0d0d', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#1f1f1f' },
  costBreakdownLabel: { color: '#71717a', fontSize: 10, fontWeight: '600', marginBottom: 4 },
  costBreakdownValue: { color: '#e4e4e7', fontSize: 12, fontWeight: '700' },

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
  promptText: { color: '#d4d4d8', fontSize: 12, lineHeight: 18 },
  answerItem: { gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  answerLabel: { color: '#a1a1aa', fontSize: 11, fontWeight: '600' },
  answerValue: { color: '#e4e4e7', fontSize: 12, lineHeight: 18 },

  // Errors / Success
  errorItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#EF444410', padding: 8, borderRadius: 8, marginBottom: 4 },
  errorItemText: { color: '#EF4444', fontSize: 11, flex: 1 },
  successItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#22C55E10', padding: 8, borderRadius: 8, marginBottom: 4 },
  successItemText: { color: '#22C55E', fontSize: 11 },

  // Runtime items (improved)
  errorSummaryBar: { flexDirection: 'row', gap: 12, marginBottom: 8, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#111', borderRadius: 8 },
  errorSummaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  errorSummaryDot: { width: 8, height: 8, borderRadius: 4 },
  errorSummaryText: { fontSize: 11, fontWeight: '600' },
  runtimeItem: { padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#1a1a1a' },
  runtimeItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  runtimeItemTitle: { fontSize: 12, fontWeight: '600', flex: 1 },
  runtimeItemStatus: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 0.5 },
  runtimeItemError: { color: '#999', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 6, lineHeight: 14 },
  runtimeItemFix: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  runtimeItemFixText: { color: '#22C55E', fontSize: 10, flex: 1 },
  runtimeItemMeta: { color: '#555', fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 4 },

  // Debug info
  debugInfo: { backgroundColor: '#0a0a0a', borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  debugTitle: { color: '#555', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  debugText: { color: '#444', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', paddingVertical: 1 },

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

  // Actions
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  refreshBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, backgroundColor: '#111', borderRadius: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  refreshText: { color: '#8B5CF6', fontSize: 12, fontWeight: '500' },
  copyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, backgroundColor: '#111', borderRadius: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  copyText: { color: '#F59E0B', fontSize: 12, fontWeight: '500' },
});
