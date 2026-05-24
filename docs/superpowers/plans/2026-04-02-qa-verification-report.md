# QA Verification Report & Preview Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the preview invisible until verification passes, use Claude Sonnet 4.6 in dev for all AI agents, persist all verification data (screenshots, clicks, paths, fixes), and show a full QA report in Project History.

**Architecture:** Three layers of change: (1) Frontend preview gate + model switch in `usePreviewAutoFix`, (2) Backend persistence of verification data in `.bynot/verification-report.json` with a new API endpoint, (3) New UI section in `BuildReportView` to render the full QA report with screenshot grid and navigation test results.

**Tech Stack:** React Native, Expo, TypeScript, Puppeteer (backend), react-native-view-shot (frontend)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/preview/usePreviewAutoFix.ts` | Modify | Model switch (dev→claude), accumulate report data, send to backend |
| `src/features/terminal/components/PreviewPanel.tsx` | Modify | Preview gate: hide WebView until verified |
| `src/features/terminal/components/PreviewVerifyingScreen.tsx` | Create | Loading screen "Controllo qualità in corso..." |
| `src/features/terminal/components/views/BuildReportView.tsx` | Modify | Add QA section, fetch verification report |
| `src/features/terminal/components/views/VerificationSection.tsx` | Create | QA report section with screenshot grid + nav results |
| `src/features/terminal/components/views/ScreenshotModal.tsx` | Create | Fullscreen screenshot viewer modal |
| `backend-ts/scripts/e2e-check.js` | Modify | Return ALL screenshots (not just errors) |
| `backend-ts/src/services/verify-project.service.ts` | Modify | Persist full VerificationReport to .bynot/verification-report.json |
| `backend-ts/src/routes/workstation.routes.ts` | Modify | Add GET/POST verification-report endpoints |

---

### Task 1: Model switch — Claude Sonnet 4.6 in dev

**Files:**
- Modify: `src/hooks/preview/usePreviewAutoFix.ts:176-184`

- [ ] **Step 1: Change hardcoded model to env-based selection**

In `src/hooks/preview/usePreviewAutoFix.ts`, replace line 179:

```typescript
// OLD:
model: 'gemini-3-flash', // Fast model for fixes

// NEW:
model: (process.env.EXPO_PUBLIC_ENV === 'development' || process.env.EXPO_PUBLIC_ENV === 'preview')
  ? 'claude-sonnet-4-6'
  : 'gemini-3-flash',
```

- [ ] **Step 2: Verify the change compiles**

Run: Metro bundler should reload without errors. Check terminal for bundling errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/preview/usePreviewAutoFix.ts
git commit -m "feat: use claude-sonnet-4-6 for auto-fix in dev environment"
```

---

### Task 2: Preview gate — Hide WebView until verified

**Files:**
- Create: `src/features/terminal/components/PreviewVerifyingScreen.tsx`
- Modify: `src/features/terminal/components/PreviewPanel.tsx`

- [ ] **Step 1: Create PreviewVerifyingScreen component**

Create `src/features/terminal/components/PreviewVerifyingScreen.tsx`:

```typescript
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  statusMessage?: string;
}

export const PreviewVerifyingScreen = ({ statusMessage }: Props) => (
  <View style={styles.container}>
    <View style={styles.iconContainer}>
      <Ionicons name="shield-checkmark-outline" size={36} color="#8B5CF6" />
    </View>
    <ActivityIndicator size="small" color="#8B5CF6" style={styles.spinner} />
    <Text style={styles.title}>Controllo qualità in corso...</Text>
    {statusMessage ? (
      <Text style={styles.subtitle}>{statusMessage}</Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  spinner: {
    marginBottom: 16,
  },
  title: {
    color: '#ddd',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  subtitle: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Modify PreviewPanel to gate WebView visibility**

In `src/features/terminal/components/PreviewPanel.tsx`, add the import at top:

```typescript
import { PreviewVerifyingScreen } from './PreviewVerifyingScreen';
```

Find the section where `PreviewWebView` is rendered. The WebView must remain mounted (for preflight checks) but hidden until `autoFix.state === 'verified'`. Wrap the WebView render area:

```typescript
{/* Preview gate: show verifying screen until auto-fix confirms OK */}
{autoFix.state !== 'verified' && autoFix.state !== 'idle' && serverStatus === 'running' && (
  <PreviewVerifyingScreen statusMessage={autoFix.statusMessage} />
)}

{/* WebView — mounted for preflight but visually hidden until verified */}
<View style={[
  { flex: 1 },
  (autoFix.state !== 'verified' && autoFix.state !== 'idle' && serverStatus === 'running')
    ? { opacity: 0, position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none' }
    : {}
]}>
  {/* existing PreviewWebView render here */}
</View>
```

Note: `autoFix.state === 'idle'` is included so the WebView shows normally when no auto-fix is active (e.g. returning to a project that was already verified).

- [ ] **Step 3: Verify the preview gate works**

Open a project preview in the simulator. The WebView should be hidden with "Controllo qualità in corso..." visible. After the preflight check passes (2.5s), the WebView should appear.

- [ ] **Step 4: Commit**

```bash
git add src/features/terminal/components/PreviewVerifyingScreen.tsx src/features/terminal/components/PreviewPanel.tsx
git commit -m "feat: preview gate - hide WebView until QA verification passes"
```

---

### Task 3: Backend — e2e-check.js returns ALL screenshots

**Files:**
- Modify: `backend-ts/scripts/e2e-check.js`

- [ ] **Step 1: Find the screenshot logic in e2e-check.js**

Read `backend-ts/scripts/e2e-check.js` and locate where screenshots are taken conditionally (only on error). Change the logic to ALWAYS take a screenshot for every page.

In the Phase 1 loop (page analysis), find the conditional screenshot and make it unconditional:

```javascript
// OLD (approximate):
if (pageResult.errors.length > 0 || pageResult.checks.isBlank) {
  pageResult.screenshot = await page.screenshot({ encoding: 'base64', type: 'png' });
}

// NEW:
pageResult.screenshot = await page.screenshot({ encoding: 'base64', type: 'png' });
```

In the Phase 2 loop (click testing), ensure screenshots are taken for EVERY click result (before and after), not just errors:

```javascript
// Take screenshot before click
clickResult.screenshotBefore = await page.screenshot({ encoding: 'base64', type: 'png' });

// ... perform click ...

// Take screenshot after click
clickResult.screenshotAfter = await page.screenshot({ encoding: 'base64', type: 'png' });
```

- [ ] **Step 2: Verify the script runs**

The script runs inside Docker containers, so test by reading the file and checking for syntax errors:

```bash
node -c backend-ts/scripts/e2e-check.js
```

Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add backend-ts/scripts/e2e-check.js
git commit -m "feat: e2e-check captures screenshots for ALL pages and clicks"
```

---

### Task 4: Backend — Persist VerificationReport

**Files:**
- Modify: `backend-ts/src/services/verify-project.service.ts`

- [ ] **Step 1: Read the current verify-project.service.ts**

Read the full file to understand the current `verify()` and `verifyAndFixProject()` functions. Identify where `e2e-check.js` output is parsed and where `autoFix()` runs.

- [ ] **Step 2: Add VerificationReport accumulation**

At the top of `verifyAndFixProject()`, create a report object:

```typescript
const verificationReport = {
  projectId,
  createdAt: new Date().toISOString(),
  completedAt: '',
  status: 'passed' as 'passed' | 'failed' | 'partial',
  backendVerification: {
    attempts: [] as any[],
    totalDuration: 0,
  },
};
const reportStartTime = Date.now();
```

Inside the verify/fix loop, after each `verify()` call, push to the attempts array:

```typescript
verificationReport.backendVerification.attempts.push({
  attemptNumber: attempt + 1,
  timestamp: new Date().toISOString(),
  duration: attemptDuration,
  status: lastResult.passed ? 'passed' : (fixApplied ? 'fixed' : 'failed'),
  pages: lastResult.pages || [],       // From e2e-check.js output
  navigation: lastResult.navigation || [], // From e2e-check.js output
  fixes: fixApplied ? [{
    model: 'claude-4-6-sonnet',
    filesModified: fixedFiles,
    duration: fixDuration,
  }] : undefined,
});
```

- [ ] **Step 3: Write the report file at the end of verifyAndFixProject()**

After the verify/fix loop completes:

```typescript
verificationReport.completedAt = new Date().toISOString();
verificationReport.status = lastResult.passed ? 'passed' : 'failed';
verificationReport.backendVerification.totalDuration = Date.now() - reportStartTime;

// Persist to project directory
try {
  await fileService.writeFile(projectId, '.bynot/verification-report.json',
    JSON.stringify(verificationReport, null, 2));
} catch (err) {
  console.warn('[Verify] Failed to save verification report:', err);
}
```

- [ ] **Step 4: Commit**

```bash
git add backend-ts/src/services/verify-project.service.ts
git commit -m "feat: persist verification report with screenshots and navigation results"
```

---

### Task 5: Backend — API endpoints for verification report

**Files:**
- Modify: `backend-ts/src/routes/workstation.routes.ts`

- [ ] **Step 1: Add GET endpoint for verification report**

After the existing `build-report` endpoint (line ~471), add:

```typescript
// GET /workstation/:projectId/verification-report
workstationRouter.get('/:projectId/verification-report', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId || 'anonymous';

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const result = await fileService.readFile(projectId, '.bynot/verification-report.json');
  if (!result.success || !result.data) {
    return res.json({ success: true, report: null });
  }

  try {
    const report = JSON.parse(result.data.content);
    res.json({ success: true, report });
  } catch {
    res.json({ success: true, report: null });
  }
}));
```

- [ ] **Step 2: Add POST endpoint for frontend verification data**

This endpoint lets the frontend (Agente 2) append its verification data:

```typescript
// POST /workstation/:projectId/verification-report
workstationRouter.post('/:projectId/verification-report', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId || 'anonymous';
  const { previewVerification } = req.body;

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Read existing report (from backend E2E) or create new
  let report: any = { projectId, backendVerification: null, previewVerification: null };
  const existing = await fileService.readFile(projectId, '.bynot/verification-report.json');
  if (existing.success && existing.data) {
    try { report = JSON.parse(existing.data.content); } catch {}
  }

  // Merge preview verification data
  report.previewVerification = previewVerification;
  report.completedAt = new Date().toISOString();

  await fileService.writeFile(projectId, '.bynot/verification-report.json',
    JSON.stringify(report, null, 2));

  res.json({ success: true });
}));
```

- [ ] **Step 3: Commit**

```bash
git add backend-ts/src/routes/workstation.routes.ts
git commit -m "feat: API endpoints for verification report GET/POST"
```

---

### Task 6: Frontend — usePreviewAutoFix accumulates and sends report

**Files:**
- Modify: `src/hooks/preview/usePreviewAutoFix.ts`

- [ ] **Step 1: Add report accumulation ref**

After `const conversationRef = useRef<any[]>([]);` (line 82), add:

```typescript
const reportRef = useRef<{
  attempts: Array<{
    attemptNumber: number;
    timestamp: string;
    status: string;
    jsErrors: string[];
    rootChildren: number;
    screenshotBase64: string | null;
    fixModel?: string;
    fixDuration?: number;
  }>;
}>({ attempts: [] });
```

- [ ] **Step 2: Record each check result in reportCheckResult()**

In `reportCheckResult()` (line 281), before the if/else, add:

```typescript
reportRef.current.attempts.push({
  attemptNumber: fixAttempt + 1,
  timestamp: new Date().toISOString(),
  status: (!hasErrors && !isBlankScreen) ? 'passed' : 'failed',
  jsErrors: result.jsErrors,
  rootChildren: result.rootChildren,
  screenshotBase64: result.screenshotBase64,
});
```

- [ ] **Step 3: Send report to backend when verified**

In `reportCheckResult()`, inside the `if (!hasErrors && !isBlankScreen)` block, after `setState('verified')`, add:

```typescript
// Send preview verification data to backend
if (projectId) {
  const authToken = await getAuthToken(true);
  fetch(`${config.apiUrl}/workstation/${projectId}/verification-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      previewVerification: {
        attempts: reportRef.current.attempts,
        totalDuration: Date.now() - (reportRef.current.attempts[0]
          ? new Date(reportRef.current.attempts[0].timestamp).getTime()
          : Date.now()),
      },
    }),
  }).catch(err => console.warn('[AutoFix] Failed to save report:', err));
}
```

Note: `reportCheckResult` needs to become `async`. Change its signature:

```typescript
const reportCheckResult = useCallback(async (result: CheckResult) => {
```

- [ ] **Step 4: Reset report on reset()**

In `reset()` (line 104), add:

```typescript
reportRef.current = { attempts: [] };
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/preview/usePreviewAutoFix.ts
git commit -m "feat: auto-fix accumulates verification report and sends to backend"
```

---

### Task 7: Frontend — ScreenshotModal component

**Files:**
- Create: `src/features/terminal/components/views/ScreenshotModal.tsx`

- [ ] **Step 1: Create fullscreen screenshot viewer**

Create `src/features/terminal/components/views/ScreenshotModal.tsx`:

```typescript
import React from 'react';
import { Modal, View, Image, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  visible: boolean;
  screenshotBase64: string;
  title?: string;
  onClose: () => void;
}

export const ScreenshotModal = ({ visible, screenshotBase64, title, onClose }: Props) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.header}>
        {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : <View />}
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      <Image
        source={{ uri: `data:image/png;base64,${screenshotBase64}` }}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
  },
  title: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    marginRight: 16,
  },
  image: {
    flex: 1,
    width: SCREEN_WIDTH,
    marginBottom: 40,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/terminal/components/views/ScreenshotModal.tsx
git commit -m "feat: fullscreen screenshot viewer modal for QA report"
```

---

### Task 8: Frontend — VerificationSection component

**Files:**
- Create: `src/features/terminal/components/views/VerificationSection.tsx`

- [ ] **Step 1: Create the QA report section**

Create `src/features/terminal/components/views/VerificationSection.tsx`:

```typescript
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenshotModal } from './ScreenshotModal';

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
    brokenImages?: string[];
    jsErrors?: string[];
  };
}

interface ClickResult {
  element?: { type?: string; text?: string; href?: string };
  fromPage?: string;
  toPage?: string;
  result?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
  error?: string;
}

interface FixAction {
  model?: string;
  filesModified?: string[];
  duration?: number;
}

interface VerificationAttempt {
  attemptNumber: number;
  timestamp?: string;
  duration?: number;
  status: string;
  pages?: PageResult[];
  navigation?: ClickResult[];
  fixes?: FixAction[];
}

interface VerificationData {
  attempts: VerificationAttempt[];
  totalDuration?: number;
}

interface VerificationReport {
  status?: string;
  backendVerification?: VerificationData;
  previewVerification?: VerificationData;
}

interface Props {
  report: VerificationReport;
}

const resultColor = (result?: string) => {
  switch (result) {
    case 'ok':
    case 'passed': return '#22C55E';
    case 'redirect_loop': return '#F59E0B';
    case 'no_change': return '#F59E0B';
    default: return '#EF4444';
  }
};

const resultLabel = (result?: string) => {
  switch (result) {
    case 'ok': return 'OK';
    case 'redirect_loop': return 'Redirect loop';
    case 'blank_page': return 'Pagina bianca';
    case 'error_page': return 'Errore';
    case 'no_change': return 'Nessuna azione';
    case 'js_error': return 'JS Error';
    default: return result || 'N/A';
  }
};

export const VerificationSection = ({ report }: Props) => {
  const [screenshotModal, setScreenshotModal] = useState<{ visible: boolean; base64: string; title: string }>({
    visible: false, base64: '', title: '',
  });

  const openScreenshot = (base64: string, title: string) => {
    setScreenshotModal({ visible: true, base64, title });
  };

  // Collect all data from latest attempt of each agent
  const backendAttempts = report.backendVerification?.attempts || [];
  const previewAttempts = report.previewVerification?.attempts || [];
  const latestBackend = backendAttempts[backendAttempts.length - 1];
  const allPages = latestBackend?.pages || [];
  const allNavigation = latestBackend?.navigation || [];
  const totalFixes = backendAttempts.filter(a => a.fixes && a.fixes.length > 0).length
    + previewAttempts.filter(a => a.status === 'failed').length;
  const totalPages = allPages.length;
  const totalClicks = allNavigation.length;
  const overallStatus = report.status || 'unknown';

  return (
    <View>
      {/* Stats bar */}
      <View style={s.statsRow}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{totalPages}</Text>
          <Text style={s.statLabel}>Pagine</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{totalClicks}</Text>
          <Text style={s.statLabel}>Click</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{totalFixes}</Text>
          <Text style={s.statLabel}>Fix</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Ionicons
            name={overallStatus === 'passed' ? 'checkmark-circle' : 'warning'}
            size={18}
            color={overallStatus === 'passed' ? '#22C55E' : '#F59E0B'}
          />
          <Text style={[s.statLabel, { marginTop: 2 }]}>
            {overallStatus === 'passed' ? 'OK' : 'Fix'}
          </Text>
        </View>
      </View>

      {/* Pages grid */}
      {allPages.length > 0 && (
        <View style={s.subsection}>
          <Text style={s.subsectionTitle}>Pagine testate</Text>
          <View style={s.pageGrid}>
            {allPages.map((pg, i) => {
              const hasError = pg.checks?.hasError || pg.checks?.isBlank || (pg.errors && pg.errors.length > 0);
              return (
                <TouchableOpacity
                  key={`${pg.path}-${i}`}
                  style={s.pageCard}
                  onPress={() => pg.screenshot && openScreenshot(pg.screenshot, pg.path)}
                  activeOpacity={pg.screenshot ? 0.7 : 1}
                >
                  {pg.screenshot ? (
                    <Image
                      source={{ uri: `data:image/png;base64,${pg.screenshot}` }}
                      style={s.pageThumbnail}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[s.pageThumbnail, s.pageThumbnailEmpty]}>
                      <Ionicons name="image-outline" size={20} color="#333" />
                    </View>
                  )}
                  <View style={s.pageInfo}>
                    <Text style={s.pagePath} numberOfLines={1}>{pg.path}</Text>
                    <View style={[s.statusDot, { backgroundColor: hasError ? '#EF4444' : '#22C55E' }]} />
                  </View>
                  {hasError && pg.errors && pg.errors.length > 0 && (
                    <Text style={s.pageError} numberOfLines={2}>{pg.errors[0]}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Navigation tests */}
      {allNavigation.length > 0 && (
        <View style={s.subsection}>
          <Text style={s.subsectionTitle}>Test navigazione</Text>
          {allNavigation.map((nav, i) => (
            <View key={i} style={s.navItem}>
              <View style={s.navHeader}>
                <View style={[s.navTypeBadge, { backgroundColor: nav.element?.type === 'link' ? '#3B82F620' : '#8B5CF620' }]}>
                  <Text style={[s.navTypeText, { color: nav.element?.type === 'link' ? '#3B82F6' : '#8B5CF6' }]}>
                    {nav.element?.type || 'click'}
                  </Text>
                </View>
                <Text style={s.navText} numberOfLines={1}>"{nav.element?.text || '?'}"</Text>
                <View style={[s.navResultDot, { backgroundColor: resultColor(nav.result) }]} />
                <Text style={[s.navResult, { color: resultColor(nav.result) }]}>{resultLabel(nav.result)}</Text>
              </View>
              <Text style={s.navPath}>{nav.fromPage} → {nav.toPage || '—'}</Text>
              {nav.error && <Text style={s.navError}>{nav.error}</Text>}
              {(nav.screenshotBefore || nav.screenshotAfter) && (
                <View style={s.navScreenshots}>
                  {nav.screenshotBefore && (
                    <TouchableOpacity onPress={() => openScreenshot(nav.screenshotBefore!, `Before: ${nav.element?.text}`)}>
                      <Image source={{ uri: `data:image/png;base64,${nav.screenshotBefore}` }} style={s.navThumb} />
                      <Text style={s.navThumbLabel}>Prima</Text>
                    </TouchableOpacity>
                  )}
                  {nav.screenshotAfter && (
                    <TouchableOpacity onPress={() => openScreenshot(nav.screenshotAfter!, `After: ${nav.element?.text}`)}>
                      <Image source={{ uri: `data:image/png;base64,${nav.screenshotAfter}` }} style={s.navThumb} />
                      <Text style={s.navThumbLabel}>Dopo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Fix history */}
      {totalFixes > 0 && (
        <View style={s.subsection}>
          <Text style={s.subsectionTitle}>Fix applicati</Text>
          {backendAttempts.filter(a => a.fixes && a.fixes.length > 0).map((attempt, i) => (
            <View key={`fix-${i}`} style={s.fixItem}>
              <View style={s.fixHeader}>
                <Ionicons name="hammer-outline" size={14} color="#F59E0B" />
                <Text style={s.fixTitle}>Tentativo {attempt.attemptNumber}</Text>
                {attempt.duration && (
                  <Text style={s.fixDuration}>{Math.round(attempt.duration / 1000)}s</Text>
                )}
              </View>
              {attempt.fixes?.map((fix, j) => (
                <View key={j}>
                  {fix.model && <Text style={s.fixDetail}>Modello: {fix.model}</Text>}
                  {fix.filesModified?.map(f => (
                    <Text key={f} style={s.fixFile}>~ {f}</Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Screenshot modal */}
      <ScreenshotModal
        visible={screenshotModal.visible}
        screenshotBase64={screenshotModal.base64}
        title={screenshotModal.title}
        onClose={() => setScreenshotModal(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const s = StyleSheet.create({
  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statLabel: { color: '#555', fontSize: 10, marginTop: 1 },
  statDivider: { width: 1, height: 20, backgroundColor: '#222' },

  subsection: { marginBottom: 14 },
  subsectionTitle: { color: '#888', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  // Page grid
  pageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pageCard: { width: '48%' as any, backgroundColor: '#111', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#1a1a1a' },
  pageThumbnail: { width: '100%', height: 100 },
  pageThumbnailEmpty: { backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  pageInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6 },
  pagePath: { color: '#aaa', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
  pageError: { color: '#EF4444', fontSize: 9, paddingHorizontal: 8, paddingBottom: 6 },

  // Navigation
  navItem: { backgroundColor: '#111', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#1a1a1a' },
  navHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  navTypeText: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase' },
  navText: { color: '#ccc', fontSize: 11, flex: 1 },
  navResultDot: { width: 6, height: 6, borderRadius: 3 },
  navResult: { fontSize: 10, fontWeight: '500' },
  navPath: { color: '#555', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 4 },
  navError: { color: '#EF4444', fontSize: 10, marginTop: 4 },
  navScreenshots: { flexDirection: 'row', gap: 8, marginTop: 8 },
  navThumb: { width: 80, height: 60, borderRadius: 6, backgroundColor: '#0a0a0a' },
  navThumbLabel: { color: '#555', fontSize: 9, textAlign: 'center', marginTop: 2 },

  // Fixes
  fixItem: { backgroundColor: '#111', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#1a1a1a' },
  fixHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fixTitle: { color: '#F59E0B', fontSize: 12, fontWeight: '600', flex: 1 },
  fixDuration: { color: '#555', fontSize: 10 },
  fixDetail: { color: '#666', fontSize: 10, marginBottom: 2 },
  fixFile: { color: '#F59E0B', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', paddingVertical: 1 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/terminal/components/views/VerificationSection.tsx
git commit -m "feat: QA verification section component with screenshot grid and nav results"
```

---

### Task 9: Frontend — Integrate VerificationSection into BuildReportView

**Files:**
- Modify: `src/features/terminal/components/views/BuildReportView.tsx`

- [ ] **Step 1: Add import and state for verification report**

At top of `BuildReportView.tsx`, add:

```typescript
import { VerificationSection } from './VerificationSection';
```

Inside the component, after `const [report, setReport] = useState<BuildReport | null>(null);` add:

```typescript
const [verificationReport, setVerificationReport] = useState<any>(null);
```

- [ ] **Step 2: Fetch verification report alongside build report**

Inside `loadReport()`, after the existing build report fetch, add:

```typescript
// Also fetch verification report
try {
  const vUrl = `${config.apiUrl}/workstation/${currentProjectId}/verification-report`;
  const vRes = await fetch(vUrl, { headers, signal: controller.signal });
  const vData = await vRes.json();
  if (vData.success && vData.report) {
    setVerificationReport(vData.report);
  }
} catch {}
```

- [ ] **Step 3: Add QA section in the render**

After the Creazione `</SectionHeader>` closing tag (around line 275) and before the Chat Sessions section, add:

```typescript
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
```

- [ ] **Step 4: Verify it renders**

Open a project in the simulator, go to Project History tab. If a verification report exists, the QA section should appear.

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/components/views/BuildReportView.tsx
git commit -m "feat: integrate QA verification section into Project History"
```

---

## Execution Order

Tasks 1-2 are frontend-only (model switch + preview gate).
Tasks 3-5 are backend-only (e2e screenshots + persistence + API).
Tasks 6-9 are frontend (report accumulation + UI).

Tasks 1 and 2 can run in parallel.
Tasks 3, 4, 5 must be sequential.
Tasks 7 and 8 can run in parallel.
Task 9 depends on 7 and 8.
Task 6 depends on 5 (API endpoint must exist).
