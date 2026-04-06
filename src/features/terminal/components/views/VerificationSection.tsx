import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenshotModal } from './ScreenshotModal';
import { config } from '../../../../config/config';
import { getAuthHeaders } from '../../../../core/api/getAuthToken';
import { useTerminalStore } from '../../../../core/terminal/terminalStore';

// ── Types ──

interface PageResult {
  path: string;
  status?: number;
  screenshot?: string;
  errors?: string[];
  checks?: {
    hasContent?: boolean;
    hasStyles?: boolean;
    hasError?: boolean;
    isBlank?: boolean;
    brokenImages?: number | string[];
    jsErrors?: string[];
  };
}

interface NavigationResult {
  element?: { type?: string; text?: string; href?: string };
  fromPage?: string;
  toPage?: string;
  result?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
  error?: string;
}

interface Fix {
  model?: string;
  filesModified?: string[];
  duration?: number;
}

interface BackendAttempt {
  attemptNumber: number;
  timestamp?: string;
  duration?: number;
  status: string;
  pages?: PageResult[];
  navigation?: NavigationResult[];
  fixes?: Fix[];
}

interface PreviewAttempt {
  attemptNumber: number;
  timestamp: string;
  status: string;
  jsErrors: string[];
  rootChildren: number;
  screenshotBase64: string | null;
}

interface VerificationReport {
  status?: string;
  backendVerification?: {
    attempts: BackendAttempt[];
    totalDuration?: number;
  };
  previewVerification?: {
    attempts: PreviewAttempt[];
    totalDuration?: number;
  };
}

// ── QA Report Types ──

interface VisualIssue {
  page?: string;
  type?: string;
  severity?: string;
  description?: string;
  suggestion?: string;
}

interface QAAttempt {
  cycle: number;
  functionalIssues: number;
  visualIssues: number;
  criticalHighCount: number;
  visualAnalysis?: VisualIssue[];
  fix?: { applied: boolean; filesModified: string[] };
}

interface QAReport {
  status?: string;
  qualityScore?: number;
  totalIssues?: number;
  attempts?: QAAttempt[];
}

interface Props {
  report: VerificationReport & { qaReport?: QAReport };
}

// ── Helpers ──

const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const resultColor = (result?: string): string => {
  switch (result) {
    case 'ok': return '#22C55E';
    case 'redirect_loop': return '#F59E0B';
    case 'blank_page': return '#F59E0B';
    case 'error_page': return '#EF4444';
    case 'no_change': return '#666';
    case 'js_error': return '#EF4444';
    default: return '#555';
  }
};

const resultLabel = (result?: string): string => {
  switch (result) {
    case 'ok': return 'OK';
    case 'redirect_loop': return 'Redirect loop';
    case 'blank_page': return 'Pagina bianca';
    case 'error_page': return 'Errore';
    case 'no_change': return 'Nessuna azione';
    case 'js_error': return 'JS Error';
    default: return result ?? 'Sconosciuto';
  }
};

const statusColor = (status?: string): string => {
  switch (status) {
    case 'passed': return '#22C55E';
    case 'failed': return '#EF4444';
    case 'partial': return '#F59E0B';
    default: return '#555';
  }
};

const statusLabel = (status?: string): string => {
  switch (status) {
    case 'passed': return 'Superato';
    case 'failed': return 'Fallito';
    case 'partial': return 'Parziale';
    default: return status ?? '—';
  }
};

const formatDuration = (ms?: number): string => {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

// ── Screenshot Thumbnail ──

interface ThumbnailProps {
  base64?: string;
  width: number;
  height: number;
  label?: string;
  onPress: () => void;
}

const ScreenshotThumbnail = ({ base64, width, height, label, onPress }: ThumbnailProps) => {
  if (!base64) return null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ marginRight: 6 }}>
      <Image
        source={{ uri: `data:image/png;base64,${base64}` }}
        style={{ width, height, borderRadius: 6, borderWidth: 1, borderColor: '#1a1a1a' }}
        resizeMode="cover"
      />
      {label ? <Text style={st.thumbLabel}>{label}</Text> : null}
    </TouchableOpacity>
  );
};

// ── Stats Bar ──

interface StatsBarProps {
  pagesCount: number;
  clicksCount: number;
  fixesCount: number;
  overallStatus?: string;
}

const StatsBar = ({ pagesCount, clicksCount, fixesCount, overallStatus }: StatsBarProps) => (
  <View style={st.statsRow}>
    <View style={st.statItem}>
      <Text style={st.statValue}>{pagesCount}</Text>
      <Text style={st.statLabel}>Pagine</Text>
    </View>
    <View style={st.statDivider} />
    <View style={st.statItem}>
      <Text style={st.statValue}>{clicksCount}</Text>
      <Text style={st.statLabel}>Click</Text>
    </View>
    <View style={st.statDivider} />
    <View style={st.statItem}>
      <Text style={st.statValue}>{fixesCount}</Text>
      <Text style={st.statLabel}>Fix</Text>
    </View>
    <View style={st.statDivider} />
    <View style={st.statItem}>
      <View style={[st.statusDot, { backgroundColor: statusColor(overallStatus) }]} />
      <Text style={[st.statLabel, { color: statusColor(overallStatus) }]}>{statusLabel(overallStatus)}</Text>
    </View>
  </View>
);

// ── Page Card ──

interface PageCardProps {
  page: PageResult;
  onScreenshotPress: (base64: string, title: string) => void;
}

const PageCard = ({ page, onScreenshotPress }: PageCardProps) => {
  const hasErrors = (page.errors?.length ?? 0) > 0 || page.checks?.hasError || page.checks?.isBlank;
  const dotColor = hasErrors ? '#EF4444' : '#22C55E';

  return (
    <View style={st.pageCard}>
      {page.screenshot ? (
        <TouchableOpacity
          onPress={() => onScreenshotPress(page.screenshot!, page.path)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: `data:image/png;base64,${page.screenshot}` }}
            style={st.pageThumbnail}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ) : (
        <View style={[st.pageThumbnail, st.pageThumbnailPlaceholder]}>
          <Ionicons name="image-outline" size={20} color="#333" />
        </View>
      )}
      <View style={st.pageInfo}>
        <View style={st.pagePathRow}>
          <View style={[st.pageDot, { backgroundColor: dotColor }]} />
          <Text style={st.pagePath} numberOfLines={1}>{page.path}</Text>
        </View>
        {page.status != null && (
          <Text style={st.pageStatus}>HTTP {page.status}</Text>
        )}
        {page.errors?.map((err, i) => (
          <Text key={i} style={st.pageError} numberOfLines={2}>{err}</Text>
        ))}
        {page.checks?.jsErrors?.map((err, i) => (
          <Text key={`js-${i}`} style={st.pageError} numberOfLines={1}>{err}</Text>
        ))}
        {(typeof page.checks?.brokenImages === 'number' ? page.checks.brokenImages > 0 : (page.checks?.brokenImages?.length ?? 0) > 0) ? (
          <Text style={st.pageWarning}>
            {typeof page.checks?.brokenImages === 'number' ? page.checks.brokenImages : page.checks?.brokenImages?.length} immagini rotte
          </Text>
        ) : null}
      </View>
    </View>
  );
};

// ── Navigation Item ──

interface NavItemProps {
  nav: NavigationResult;
  onScreenshotPress: (base64: string, title: string) => void;
}

const NavItem = ({ nav, onScreenshotPress }: NavItemProps) => {
  const color = resultColor(nav.result);
  const label = resultLabel(nav.result);

  return (
    <View style={st.navItem}>
      <View style={st.navHeader}>
        {nav.element?.type ? (
          <View style={st.navBadge}>
            <Text style={st.navBadgeText}>{nav.element.type}</Text>
          </View>
        ) : null}
        <Text style={st.navElementText} numberOfLines={1}>
          {nav.element?.text || nav.element?.href || '—'}
        </Text>
        <View style={[st.navResultBadge, { backgroundColor: `${color}20` }]}>
          <Text style={[st.navResultText, { color }]}>{label}</Text>
        </View>
      </View>

      {(nav.fromPage || nav.toPage) ? (
        <View style={st.navRoute}>
          <Text style={st.navPath} numberOfLines={1}>{nav.fromPage || '/'}</Text>
          <Ionicons name="arrow-forward" size={10} color="#444" />
          <Text style={st.navPath} numberOfLines={1}>{nav.toPage || '/'}</Text>
        </View>
      ) : null}

      {nav.error ? (
        <Text style={st.navError} numberOfLines={2}>{nav.error}</Text>
      ) : null}

      <View style={st.navScreenshots}>
        <ScreenshotThumbnail
          base64={nav.screenshotBefore}
          width={80}
          height={60}
          label="Prima"
          onPress={() => onScreenshotPress(nav.screenshotBefore!, `${nav.fromPage || '/'} - Prima`)}
        />
        <ScreenshotThumbnail
          base64={nav.screenshotAfter}
          width={80}
          height={60}
          label="Dopo"
          onPress={() => onScreenshotPress(nav.screenshotAfter!, `${nav.toPage || '/'} - Dopo`)}
        />
      </View>
    </View>
  );
};

// ── Fix Timeline Item ──

interface FixItemProps {
  fix: Fix;
  attemptNumber: number;
}

const FixItem = ({ fix, attemptNumber }: FixItemProps) => (
  <View style={st.fixItem}>
    <View style={st.fixTimeline}>
      <View style={st.fixDot} />
      <View style={st.fixLine} />
    </View>
    <View style={st.fixContent}>
      <View style={st.fixHeader}>
        <Text style={st.fixAttempt}>Tentativo #{attemptNumber}</Text>
        {fix.model ? <Text style={st.fixModel}>{fix.model}</Text> : null}
        {fix.duration != null ? (
          <Text style={st.fixDuration}>{formatDuration(fix.duration)}</Text>
        ) : null}
      </View>
      {fix.filesModified?.map((f, i) => (
        <View key={i} style={st.fixFileRow}>
          <Text style={st.fixFileIcon}>~</Text>
          <Text style={st.fixFilePath}>{f}</Text>
        </View>
      ))}
    </View>
  </View>
);

// ── Collapsible Section ──

interface CollapsibleProps {
  icon: string;
  iconColor: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const Collapsible = ({ icon, iconColor, title, count, defaultOpen = false, children }: CollapsibleProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={st.collapsible}>
      <TouchableOpacity
        style={st.collapsibleHeader}
        onPress={() => setOpen(prev => !prev)}
        activeOpacity={0.7}
      >
        <Ionicons name={icon as any} size={15} color={iconColor} />
        <Text style={st.collapsibleTitle}>{title}</Text>
        {count != null ? (
          <View style={st.collapsibleBadge}>
            <Text style={st.collapsibleBadgeText}>{count}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color="#555" />
      </TouchableOpacity>
      {open ? <View style={st.collapsibleBody}>{children}</View> : null}
    </View>
  );
};

// ── Main Component ──

export const VerificationSection: React.FC<Props> = ({ report }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalScreenshot, setModalScreenshot] = useState('');
  const [modalTitle, setModalTitle] = useState('');
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});
  const [navScreenshots, setNavScreenshots] = useState<Record<string, string>>({});
  const currentProjectId = useTerminalStore(s => s.currentWorkstation?.id);

  // Fetch page + navigation screenshots from dedicated endpoint
  useEffect(() => {
    if (!currentProjectId) return;
    getAuthHeaders().then(headers => {
      fetch(`${config.apiUrl}/workstation/${currentProjectId}/screenshots`, { headers })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            if (data.screenshots) setScreenshots(data.screenshots);
            if (data.navScreenshots) setNavScreenshots(data.navScreenshots);
          }
        })
        .catch(() => {});
    }).catch(() => {});
  }, [currentProjectId]);

  const openScreenshot = useCallback((base64: string, title: string) => {
    setModalScreenshot(base64);
    setModalTitle(title);
    setModalVisible(true);
  }, []);

  const closeScreenshot = useCallback(() => {
    setModalVisible(false);
  }, []);

  // Aggregate data from latest backend attempt
  const backendAttempts = report.backendVerification?.attempts ?? [];
  const latestAttempt = backendAttempts.length > 0
    ? backendAttempts[backendAttempts.length - 1]
    : undefined;

  // Merge fetched screenshots into page data (pages may have screenshot stripped)
  const rawPages = latestAttempt?.pages ?? [];
  const allPages = rawPages.map(p => ({
    ...p,
    screenshot: p.screenshot || screenshots[p.path] || undefined,
  }));
  // Merge fetched nav screenshots — robust key: fromPage|type|text|before/after
  const rawNavigation = latestAttempt?.navigation ?? [];
  const allNavigation = rawNavigation.map(n => {
    const navKey = `${n.fromPage || '/'}|${n.element?.type || ''}|${n.element?.text || ''}`;
    return {
      ...n,
      screenshotBefore: n.screenshotBefore || navScreenshots[navKey + '|before'] || undefined,
      screenshotAfter: n.screenshotAfter || navScreenshots[navKey + '|after'] || undefined,
    };
  });
  const allFixes = backendAttempts.flatMap(a =>
    (a.fixes ?? []).map(f => ({ ...f, attemptNumber: a.attemptNumber }))
  );

  const totalPagesCount = allPages.length;
  const totalClicksCount = allNavigation.length;
  const totalFixesCount = allFixes.length;

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Ionicons name="shield-checkmark-outline" size={18} color="#8B5CF6" />
        <Text style={st.headerTitle}>Verifica QA</Text>
      </View>

      {/* Stats Bar */}
      <StatsBar
        pagesCount={totalPagesCount}
        clicksCount={totalClicksCount}
        fixesCount={totalFixesCount}
        overallStatus={report.status}
      />

      {/* Pages Grid */}
      {totalPagesCount > 0 ? (
        <Collapsible
          icon="browsers-outline"
          iconColor="#3B82F6"
          title="Pagine testate"
          count={totalPagesCount}
          defaultOpen
        >
          <View style={st.pagesGrid}>
            {allPages.map((page, i) => (
              <PageCard
                key={`${page.path}-${i}`}
                page={page}
                onScreenshotPress={openScreenshot}
              />
            ))}
          </View>
        </Collapsible>
      ) : null}

      {/* Navigation Tests */}
      {totalClicksCount > 0 ? (
        <Collapsible
          icon="navigate-outline"
          iconColor="#8B5CF6"
          title="Test navigazione"
          count={totalClicksCount}
        >
          {allNavigation.map((nav, i) => (
            <NavItem
              key={i}
              nav={nav}
              onScreenshotPress={openScreenshot}
            />
          ))}
        </Collapsible>
      ) : null}

      {/* Fix History */}
      {totalFixesCount > 0 ? (
        <Collapsible
          icon="hammer-outline"
          iconColor="#F59E0B"
          title="Cronologia fix"
          count={totalFixesCount}
        >
          {allFixes.map((fix, i) => (
            <FixItem
              key={i}
              fix={fix}
              attemptNumber={fix.attemptNumber}
            />
          ))}
        </Collapsible>
      ) : null}

      {/* Preview Verification */}
      {(report.previewVerification?.attempts?.length ?? 0) > 0 ? (
        <Collapsible
          icon="eye-outline"
          iconColor="#22C55E"
          title="Preview verification"
          count={report.previewVerification!.attempts.length}
        >
          {report.previewVerification!.attempts.map((attempt, i) => (
            <View key={i} style={st.previewAttempt}>
              <View style={st.previewHeader}>
                <Text style={st.previewAttemptLabel}>#{attempt.attemptNumber}</Text>
                <View style={[st.navResultBadge, { backgroundColor: `${statusColor(attempt.status)}20` }]}>
                  <Text style={[st.navResultText, { color: statusColor(attempt.status) }]}>
                    {statusLabel(attempt.status)}
                  </Text>
                </View>
                {attempt.rootChildren > 0 ? (
                  <Text style={st.previewMeta}>{attempt.rootChildren} nodi</Text>
                ) : null}
              </View>
              {attempt.jsErrors.length > 0 ? (
                <View style={st.previewErrors}>
                  {attempt.jsErrors.map((err, j) => (
                    <Text key={j} style={st.pageError} numberOfLines={2}>{err}</Text>
                  ))}
                </View>
              ) : null}
              {attempt.screenshotBase64 ? (
                <ScreenshotThumbnail
                  base64={attempt.screenshotBase64}
                  width={80}
                  height={60}
                  label="Preview"
                  onPress={() => openScreenshot(attempt.screenshotBase64!, `Preview #${attempt.attemptNumber}`)}
                />
              ) : null}
            </View>
          ))}
        </Collapsible>
      ) : null}

      {/* QA Report — Visual Analysis + Quality Score */}
      {report.qaReport && (
        <Collapsible
          icon="eye-outline"
          iconColor="#8B5CF6"
          title="Analisi Visiva AI"
          count={report.qaReport.attempts?.length}
          defaultOpen
        >
          {/* Quality Score */}
          {report.qaReport.qualityScore != null && (
            <View style={st.qaScoreRow}>
              <Text style={st.qaScoreLabel}>Quality Score</Text>
              <View style={[st.qaScoreBadge, {
                backgroundColor: report.qaReport.qualityScore >= 8 ? 'rgba(34,197,94,0.15)' :
                  report.qaReport.qualityScore >= 5 ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)'
              }]}>
                <Text style={[st.qaScoreValue, {
                  color: report.qaReport.qualityScore >= 8 ? '#22C55E' :
                    report.qaReport.qualityScore >= 5 ? '#EAB308' : '#EF4444'
                }]}>{report.qaReport.qualityScore}/10</Text>
              </View>
              <View style={[st.qaStatusBadge, {
                backgroundColor: report.qaReport.status === 'verified' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'
              }]}>
                <Text style={[st.qaStatusText, {
                  color: report.qaReport.status === 'verified' ? '#22C55E' : '#EF4444'
                }]}>{report.qaReport.status === 'verified' ? 'Verificato' : 'Non superato'}</Text>
              </View>
            </View>
          )}

          {/* Attempts */}
          {report.qaReport.attempts?.map((attempt, i) => (
            <View key={i} style={st.qaAttemptCard}>
              <View style={st.qaAttemptHeader}>
                <Text style={st.qaAttemptTitle}>Ciclo {attempt.cycle}</Text>
                <Text style={st.qaAttemptDetail}>
                  {attempt.functionalIssues} funzionali | {attempt.visualIssues} visivi | {attempt.criticalHighCount} critici
                </Text>
              </View>

              {/* Visual Issues */}
              {attempt.visualAnalysis && attempt.visualAnalysis.length > 0 && (
                <View style={st.qaIssuesList}>
                  {attempt.visualAnalysis.slice(0, 8).map((issue, j) => (
                    <View key={j} style={st.qaIssueRow}>
                      <View style={[st.qaIssueDot, {
                        backgroundColor: issue.severity === 'critical' ? '#EF4444' :
                          issue.severity === 'high' ? '#F97316' :
                          issue.severity === 'medium' ? '#EAB308' : '#555'
                      }]} />
                      <Text style={st.qaIssueText} numberOfLines={2}>
                        {issue.page ? `${issue.page}: ` : ''}{issue.description}
                      </Text>
                      {issue.type && (
                        <View style={st.qaIssueTypeBadge}>
                          <Text style={st.qaIssueTypeText}>{issue.type}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Fix Applied */}
              {attempt.fix?.applied && Array.isArray(attempt.fix?.filesModified) && attempt.fix.filesModified.length > 0 && (
                <View style={st.qaFixRow}>
                  <Ionicons name="hammer-outline" size={12} color="#22C55E" />
                  <Text style={st.qaFixText}>
                    {attempt.fix.filesModified.length} file fixati: {attempt.fix.filesModified.join(', ')}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </Collapsible>
      )}

      {/* Screenshot Modal */}
      <ScreenshotModal
        visible={modalVisible}
        screenshotBase64={modalScreenshot}
        title={modalTitle}
        onClose={closeScreenshot}
      />
    </View>
  );
};

// ── Styles ──

const st = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: '#555',
    fontSize: 10,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#222',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 2,
  },

  // Collapsible
  collapsible: {
    backgroundColor: '#111',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    overflow: 'hidden',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  collapsibleTitle: {
    color: '#bbb',
    fontSize: 13,
    fontWeight: '600',
  },
  collapsibleBadge: {
    backgroundColor: '#8B5CF620',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  collapsibleBadgeText: {
    color: '#8B5CF6',
    fontSize: 10,
    fontWeight: '600',
  },
  collapsibleBody: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },

  // Pages Grid
  pagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pageCard: {
    width: '48%',
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  pageThumbnail: {
    width: '100%',
    height: 100,
    backgroundColor: '#0a0a0a',
  },
  pageThumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageInfo: {
    padding: 8,
    gap: 2,
  },
  pagePathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pagePath: {
    color: '#aaa',
    fontSize: 11,
    fontFamily: MONO_FONT,
    flex: 1,
  },
  pageStatus: {
    color: '#555',
    fontSize: 10,
  },
  pageError: {
    color: '#EF4444',
    fontSize: 10,
    marginTop: 2,
  },
  pageWarning: {
    color: '#F59E0B',
    fontSize: 10,
    marginTop: 2,
  },

  // Navigation Items
  navItem: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBadge: {
    backgroundColor: '#8B5CF620',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  navBadgeText: {
    color: '#8B5CF6',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  navElementText: {
    color: '#ccc',
    fontSize: 12,
    flex: 1,
  },
  navResultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  navResultText: {
    fontSize: 10,
    fontWeight: '600',
  },
  navRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  navPath: {
    color: '#777',
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  navError: {
    color: '#EF4444',
    fontSize: 10,
    marginTop: 4,
  },
  navScreenshots: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 6,
  },

  // Thumbnails
  thumbLabel: {
    color: '#555',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2,
  },

  // Fix History
  fixItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  fixTimeline: {
    alignItems: 'center',
    width: 20,
    paddingTop: 4,
  },
  fixDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  fixLine: {
    flex: 1,
    width: 1,
    backgroundColor: '#1a1a1a',
    marginTop: 2,
  },
  fixContent: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 10,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  fixHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  fixAttempt: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
  },
  fixModel: {
    color: '#8B5CF6',
    fontSize: 10,
    fontFamily: MONO_FONT,
  },
  fixDuration: {
    color: '#555',
    fontSize: 10,
    marginLeft: 'auto',
  },
  fixFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 1,
  },
  fixFileIcon: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    width: 12,
  },
  fixFilePath: {
    color: '#666',
    fontSize: 10,
    fontFamily: MONO_FONT,
    flex: 1,
  },

  // Preview Verification
  previewAttempt: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  previewAttemptLabel: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  previewMeta: {
    color: '#555',
    fontSize: 10,
    marginLeft: 'auto',
  },
  previewErrors: {
    marginBottom: 6,
    gap: 2,
  },

  // QA Report
  qaScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  qaScoreLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
  },
  qaScoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  qaScoreValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  qaStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  qaStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  qaAttemptCard: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  qaAttemptHeader: {
    marginBottom: 6,
  },
  qaAttemptTitle: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  qaAttemptDetail: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  qaIssuesList: {
    gap: 4,
    marginBottom: 6,
  },
  qaIssueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qaIssueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  qaIssueText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    flex: 1,
  },
  qaIssueTypeBadge: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  qaIssueTypeText: {
    color: '#8B5CF6',
    fontSize: 9,
    fontWeight: '600',
  },
  qaFixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  qaFixText: {
    color: '#22C55E',
    fontSize: 10,
    flex: 1,
  },
});
