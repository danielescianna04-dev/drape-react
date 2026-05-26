# Preview Refactor Plan

## Goal

Port the preview system from a layered, partially duplicated architecture to a single, explicit, testable flow without discarding the current runtime capabilities.

Guiding principles:

1. One canonical preview entrypoint
2. Explicit preview state machine
3. One orchestrator
4. Thin WebView layer
5. Structured error handling
6. Pure UI state screens
7. Real flow tests

This plan assumes:

- backend realtime logs WebSocket stays disabled
- project creation flow is out of scope
- supported preview stacks remain web-first unless explicitly expanded later

---

## Phase 0 - Freeze Product Scope

Before changing implementation, lock the product rules for preview:

- Do not re-enable the backend logs WebSocket path
- Preview officially supports only well-managed web stacks
- Console/CLI projects should use terminal-first preview behavior, not fake web preview
- The user-visible preview states should be limited to:
  - `Start`
  - `Preparing`
  - `Fixing`
  - `Ready`
  - `Env Required`
  - `Session Expired`
  - `Fatal Error`

Why:

- Prevents more local branching from being added
- Gives the refactor a clear UX target

Acceptance criteria:

- Team agrees on the above user-visible states
- No new preview branches are added before the architecture refactor starts

---

## Phase 1 - Choose the Canonical Flow and Remove Alternatives

### Files involved

- `/Users/daniele/bynot-react/src/features/terminal/components/PreviewPanel.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/components/preview/PreviewPanelV2.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/components/views/PreviewView.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/components/preview/PreviewStates.tsx`

### Changes

- Keep only one canonical preview panel flow
- Use `PreviewPanel.tsx` as the real production entrypoint
- Pull in the good ideas from `PreviewPanelV2.tsx`:
  - cleaner state-driven flow
  - fewer ad hoc UI branches
  - pure state rendering
- Mark `views/PreviewView.tsx` as legacy/mock and remove it from active wiring
- Delete it if it is not part of any real production path
- Keep `PreviewStates.tsx`, but expand it into the canonical pure UI state layer

### Why

- There are currently multiple preview philosophies in the repo
- This creates maintenance confusion and duplicated effort

### Acceptance criteria

- `PreviewPanel.tsx` is the only production preview panel
- `PreviewPanelV2.tsx` and `PreviewView.tsx` are either deleted or explicitly marked legacy and disconnected from the active flow

---

## Phase 2 - Introduce an Explicit Preview State Machine

### New files

- `/Users/daniele/bynot-react/src/features/terminal/preview/previewMachine.ts`
- `/Users/daniele/bynot-react/src/features/terminal/preview/previewMachine.types.ts`

### Proposed phases

```ts
type PreviewPhase =
  | 'idle'
  | 'preflight_env'
  | 'starting'
  | 'waiting_health'
  | 'loading_webview'
  | 'ready'
  | 'fixing'
  | 'session_expired'
  | 'fatal_error';
```

### Proposed state shape

```ts
interface PreviewState {
  phase: PreviewPhase;
  projectId: string | null;
  previewUrl: string | null;
  machineId: string | null;
  accessToken: string | null;
  hasWebUi: boolean;
  currentStep: 'analyzing' | 'cloning' | 'detecting' | 'booting' | 'installing' | 'starting' | 'ready' | null;
  progress: number;
  displayedMessage: string;
  startupLogs: PreviewLog[];
  terminalOutput: string[];
  envVarsRequired: Array<{ key: string; defaultValue?: string; required: boolean; description?: string }> | null;
  error: { kind: PreviewErrorKind; message: string; recoverable: boolean; raw?: string } | null;
  sessionExpiredMessage: string | null;
  webViewReady: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewportMode: 'mobile' | 'desktop';
  autoFix: {
    active: boolean;
    attempt: number;
    statusMessage: string | null;
  };
}
```

### Proposed events

```ts
type PreviewEvent =
  | { type: 'START_REQUESTED' }
  | { type: 'PREFLIGHT_ENV_MISSING'; vars: any[] }
  | { type: 'STARTUP_STEP'; step: string; message?: string; progress?: number }
  | { type: 'HEALTH_OK'; url: string }
  | { type: 'HEALTH_RETRY'; message?: string }
  | { type: 'WEBVIEW_READY' }
  | { type: 'WEBVIEW_BUILD_ERROR'; message: string }
  | { type: 'WEBVIEW_RUNTIME_ERROR'; message: string }
  | { type: 'ENV_ERROR'; message: string; vars?: any[] }
  | { type: 'AUTOFIX_STARTED'; attempt: number; message?: string }
  | { type: 'AUTOFIX_SUCCEEDED' }
  | { type: 'AUTOFIX_FAILED'; message: string }
  | { type: 'SESSION_EXPIRED'; message: string }
  | { type: 'STOP_REQUESTED' }
  | { type: 'RETRY_REQUESTED' }
  | { type: 'FATAL_ERROR'; error: any };
```

### Why

- Today the UI derives state from many booleans and refs
- That makes transitions fragile and hard to reason about

### Acceptance criteria

- `PreviewPanel` renders from `state.phase`
- Preview branches are reduced to phase-based rendering instead of compound conditional logic

---

## Phase 3 - Split `usePreviewServerLifecycle`

### File to split

- `/Users/daniele/bynot-react/src/features/terminal/hooks/usePreviewServerLifecycle.ts`

### New hooks

- `/Users/daniele/bynot-react/src/features/terminal/preview/hooks/usePreviewSession.ts`
- `/Users/daniele/bynot-react/src/features/terminal/preview/hooks/usePreviewPreflight.ts`
- `/Users/daniele/bynot-react/src/features/terminal/preview/hooks/usePreviewHealth.ts`
- `/Users/daniele/bynot-react/src/features/terminal/preview/hooks/usePreviewStartupFlow.ts`
- `/Users/daniele/bynot-react/src/features/terminal/preview/hooks/usePreviewRecovery.ts`
- `/Users/daniele/bynot-react/src/features/terminal/preview/hooks/usePreviewNavigation.ts`

### Responsibilities

#### `usePreviewSession`

- preview URL per project
- preview token
- machine ID
- clear preview session
- persistence through `uiStore`

#### `usePreviewPreflight`

- environment variable preflight
- `skipNextPreflight`
- open env vars tab when needed
- normalize env-related errors

#### `usePreviewHealth`

- quick health check
- health polling
- health interval lifecycle
- health response interpretation

#### `usePreviewStartupFlow`

- startup SSE/log stream
- progress
- startup steps
- loading messages
- startup timeout
- transition toward ready

#### `usePreviewRecovery`

- retry preview
- auto-fix triggering
- session expired handling
- fatal vs recoverable error policy

#### `usePreviewNavigation`

- viewport mode
- current preview URL
- back/forward state
- toolbar-facing navigation state

### Why

- The current lifecycle hook does too much
- It mixes state, network logic, logs, UI transitions, env vars, auto-fix, and persistence

### Acceptance criteria

- No preview hook should exceed roughly 300-400 lines
- Each hook should have one clear responsibility

---

## Phase 4 - Make `PreviewWebView` Thin

### File to refactor

- `/Users/daniele/bynot-react/src/features/terminal/components/PreviewWebView.tsx`

### New files

- `/Users/daniele/bynot-react/src/features/terminal/preview/webview/previewWebViewBridge.ts`
- `/Users/daniele/bynot-react/src/features/terminal/preview/webview/previewWebViewInjectedScript.ts`
- `/Users/daniele/bynot-react/src/features/terminal/preview/webview/previewWebViewEvents.ts`

### `PreviewWebView` should do only this

- render the WebView
- receive clean props
- use injected JS from a dedicated module
- emit structured events:
  - `onReady`
  - `onBuildError`
  - `onRuntimeError`
  - `onEnvError`
  - `onNavigationState`
  - `onElementSelected`

### `PreviewWebView` should stop doing this

- directly setting preview business state
- deciding when to stop the preview
- deciding when to move to fixing vs error
- owning preview business logic

### Why

- Right now both the lifecycle hook and the WebView behave like orchestrators
- This creates double ownership of state transitions

### Acceptance criteria

- `PreviewWebView.tsx` only emits structured events
- `PreviewPanel` or the preview machine owns all business transitions

---

## Phase 5 - Unify the Preview State Screens

### Existing files involved

- `/Users/daniele/bynot-react/src/features/terminal/components/PreviewServerStatus.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/components/previewStatusScreens.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/components/preview/PreviewStates.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/components/PreviewVerifyingScreen.tsx`

### New target folder

- `/Users/daniele/bynot-react/src/features/terminal/preview/components/`

### New pure state components

- `PreviewStateStart.tsx`
- `PreviewStateLoading.tsx`
- `PreviewStateFixing.tsx`
- `PreviewStateEnvRequired.tsx`
- `PreviewStateSessionExpired.tsx`
- `PreviewStateFatalError.tsx`

### Rules

- Pure UI only
- No fetches
- No preview orchestration hooks
- Receive state and callbacks via props

### Additional cleanup

- Extract `CustomStartCommand` into its own component
- Merge duplicated state UI from `PreviewServerStatus` and `PreviewStates`
- Either merge `PreviewVerifyingScreen` into loading or remove it

### Acceptance criteria

- Preview state UI lives in one folder
- Each state component stays small and focused

---

## Phase 6 - Separate Web Preview from Console Preview

### Problem

The current preview path mixes:

- Web preview in a WebView
- Console projects rendered through terminal behavior

### New files

- `/Users/daniele/bynot-react/src/features/terminal/preview/components/PreviewSurfaceWeb.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/preview/components/PreviewSurfaceConsole.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/preview/previewCapabilities.ts`

### Capability API

```ts
export function getPreviewCapability(projectType: string): 'web' | 'console' | 'unsupported'
```

### Changes

- `PreviewPanel` should branch at a high level:
  - `web` -> `PreviewSurfaceWeb`
  - `console` -> `PreviewSurfaceConsole`
  - `unsupported` -> unsupported UI state

### Why

- Reduces mixed logic
- Makes web preview easier to reason about

### Acceptance criteria

- Web and console rendering paths are fully separated
- No mixed web/console business logic in the same rendering component

---

## Phase 7 - Centralize Error Detection and Classification

### New files

- `/Users/daniele/bynot-react/src/features/terminal/preview/errors/previewErrorClassifier.ts`
- `/Users/daniele/bynot-react/src/features/terminal/preview/errors/previewEnvVarExtractor.ts`

### Error kinds

```ts
type PreviewErrorKind =
  | 'missing_env'
  | 'build_failure'
  | 'runtime_failure'
  | 'server_unreachable'
  | 'session_expired'
  | 'missing_token'
  | 'transient_proxy'
  | 'unknown';
```

### Functions to create

- `classifyPreviewError(raw: string, source: 'health' | 'webview' | 'logs'): PreviewError`
- `extractMissingEnvVars(raw: string): string[]`
- `isTransientPreviewError(raw: string): boolean`

### Remove duplication from

- `/Users/daniele/bynot-react/src/features/terminal/hooks/usePreviewServerLifecycle.ts`
- `/Users/daniele/bynot-react/src/features/terminal/components/PreviewWebView.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/hooks/usePreviewStartup.ts`

### Why

- Error heuristics are currently duplicated and inconsistent

### Acceptance criteria

- All preview error parsing lives in one place
- Frontend preview layers use the shared classifier instead of ad hoc regex logic

---

## Phase 8 - Push More Semantics to the Backend

### Backend files involved

- `/Users/daniele/bynot-react/backend-ts/src/services/preview.service.ts`
- Any preview-related backend routes/services used by startup and health checks
- `/Users/daniele/bynot-react/backend-ts/docs/superpowers/plans/2026-04-03-preview-quality-hardening.md`

### Target behavior

Backend responses should prefer structured payloads instead of generic text.

Example:

```json
{
  "status": "error",
  "kind": "missing_env",
  "message": "Missing environment variables",
  "variables": ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
  "recoverable": true
}
```

Or:

```json
{
  "status": "starting",
  "phase": "installing",
  "message": "Installing dependencies"
}
```

### Why

- Frontend should not need to infer everything from text
- Structured payloads reduce regex-heavy heuristics

### Acceptance criteria

- Common preview failures have structured backend payloads:
  - missing env
  - session expired
  - startup failure
  - health pending
  - ready

---

## Phase 9 - Unify Progress, Startup Logs, and Timeline

### Problem

Current preview startup UI is spread across:

- startup steps
- smooth progress
- preview logs
- terminal output
- health retry messages

### New file

- `/Users/daniele/bynot-react/src/features/terminal/preview/previewTimeline.ts`

### Proposed shape

```ts
interface PreviewTimelineEntry {
  type: 'step' | 'log' | 'warning' | 'error' | 'system';
  step?: 'analyzing' | 'cloning' | 'detecting' | 'booting' | 'installing' | 'starting' | 'ready';
  message: string;
  timestamp: number;
}
```

### Changes

- `usePreviewStartup` should emit timeline + progress + current step
- `PreviewStateLoading` should read from one coherent startup model

### Why

- Progress and logs currently feel like separate subsystems

### Acceptance criteria

- Loading state uses a unified data model for:
  - current step
  - progress
  - displayed message
  - relevant logs

---

## Phase 10 - Decide the Auto-Fix Policy

### Current issue

Two conflicting UX philosophies exist:

- show an error and offer fix
- hide errors and auto-fix first

### Recommended policy

- Recoverable errors:
  - enter `fixing`
  - try auto-fix for a limited number of attempts
  - if successful, return to loading or ready
- Unrecoverable errors:
  - enter `fatal_error`
  - show a small set of clear actions

### Fatal error CTAs

- `Retry`
- `Open Environment Variables` when `kind === 'missing_env'`
- `Ask AI to Fix`

### Where to implement

- `usePreviewRecovery.ts`

### Why

- This removes ad hoc branching around `autoFix.isFixing` and related refs

### Acceptance criteria

- Auto-fix strategy is explicit and centralized
- UI transitions do not depend on scattered autofix flags

---

## Phase 11 - Clean Up Preview Toolbar and URL Routing

### Files involved

- `/Users/daniele/bynot-react/src/features/terminal/components/PreviewToolbar.tsx`
- `/Users/daniele/bynot-react/src/features/terminal/components/PreviewWebView.tsx`

### New file

- `/Users/daniele/bynot-react/src/features/terminal/preview/navigation/previewNavigationAdapter.ts`

### Responsibilities

- normalize preview URL
- distinguish:
  - canonical preview URL
  - current navigation URL
- handle subdomain preview vs legacy path preview
- prevent rewrite loops

### Why

- URL and navigation rules currently live inline in the WebView layer

### Acceptance criteria

- Path rewriting and navigation normalization are removed from inline WebView business logic

---

## Phase 12 - Formalize Supported Preview Stacks

### Files involved

- `/Users/daniele/bynot-react/src/features/terminal/components/PreviewPanel.tsx`
- `/Users/daniele/bynot-react/src/core/preview/projectDetector.ts`

### Suggested capability map

```ts
const PREVIEW_CAPABILITIES = {
  react: 'web_supported',
  nextjs: 'web_supported',
  vue: 'web_supported',
  astro: 'web_supported',
  html: 'web_supported',
  static: 'web_supported',
  expo: 'unsupported',
  'python-console': 'console_supported',
  'javascript-console': 'console_supported',
};
```

### Changes

- Stop inferring support via loose `includes`
- Use a formal capability map aligned to real product support

### Why

- Preview support should match actual runtime and UX support

### Acceptance criteria

- Preview support detection is explicit and maintainable
- Unsupported stacks are handled consistently

---

## Phase 13 - Add Real Preview Tests

### New tests

- `/Users/daniele/bynot-react/src/__tests__/preview/previewMachine.test.ts`
- `/Users/daniele/bynot-react/src/__tests__/preview/previewErrorClassifier.test.ts`
- `/Users/daniele/bynot-react/src/__tests__/preview/previewEnvVarExtractor.test.ts`
- `/Users/daniele/bynot-react/src/__tests__/preview/previewNavigationAdapter.test.ts`
- `/Users/daniele/bynot-react/src/__tests__/preview/usePreviewHealth.test.ts`
- `/Users/daniele/bynot-react/src/__tests__/preview/usePreviewPreflight.test.ts`

### Minimum scenarios

- start success path
- health retry then success
- missing env vars enters env flow
- session expired
- recoverable build error
- runtime env error
- auto-fix success path
- auto-fix exhausted -> fatal error
- web preview vs console preview
- navigation rewrite does not loop

### Why

- Preview is one of the highest-risk flows in the product
- It needs flow-level tests, not only helper tests

### Acceptance criteria

- Preview has direct test coverage for critical runtime flows

---

## Phase 14 - Final Cleanup

### Cleanup tasks

- remove dead preview code
- remove now-unused props
- reduce `any`
- reduce `as any`
- consolidate shared preview types into:
  - `/Users/daniele/bynot-react/src/features/terminal/preview/types.ts`
- normalize naming conventions:
  - `PreviewState*`
  - `usePreview*`
  - `preview*Adapter`
  - `preview*Classifier`

### Why

- Large refactors usually leave naming, imports, and old compatibility helpers behind

### Acceptance criteria

- Preview code has one clear structure
- No duplicated legacy entrypoints remain
- Type safety is improved

---

## Recommended Execution Order

Use this implementation order:

1. Consolidate one active preview flow and disconnect legacy preview paths
2. Introduce `previewMachine.ts` and types
3. Refactor `PreviewPanel.tsx` to render by machine phase
4. Split `usePreviewServerLifecycle.ts` into focused hooks
5. Reduce `PreviewWebView.tsx` to a renderer/event emitter
6. Extract centralized error and env classification
7. Unify preview state UI into pure components
8. Separate web preview and console preview
9. Move URL/navigation logic into an adapter
10. Add preview tests
11. Remove legacy preview code completely

---

## Suggested Delivery Strategy

For better reviewability, split the work into two main PRs:

### PR 1

- canonical preview flow
- state machine
- lifecycle split
- thin WebView
- unified preview state UI

### PR 2

- structured backend preview errors
- preview cleanup
- stronger typing
- deeper preview tests

---

## Suggested Prompt for Claude

```text
Refactor the preview system into a single canonical architecture.

Goals:
- one canonical PreviewPanel flow
- explicit preview state machine
- split lifecycle logic into focused hooks
- make PreviewWebView a thin renderer/event emitter
- centralize preview error classification
- unify all preview state screens
- separate web preview from console preview
- remove legacy/duplicate preview paths
- keep current behavior working while simplifying architecture
- preserve disabled websocket backend logs behavior

Implement in this order:
1. create previewMachine.ts + types
2. refactor PreviewPanel.tsx to render by machine phase
3. split usePreviewServerLifecycle.ts into smaller hooks
4. extract preview error classifier/env var extractor
5. simplify PreviewWebView.tsx
6. consolidate preview UI states into pure components
7. add tests for preview flows

Files to target:
- src/features/terminal/components/PreviewPanel.tsx
- src/features/terminal/hooks/usePreviewServerLifecycle.ts
- src/features/terminal/hooks/usePreviewStartup.ts
- src/features/terminal/components/PreviewWebView.tsx
- src/features/terminal/components/PreviewServerStatus.tsx
- src/features/terminal/components/previewStatusScreens.tsx
- src/features/terminal/components/preview/PreviewPanelV2.tsx
- src/features/terminal/components/views/PreviewView.tsx
- src/core/preview/projectDetector.ts
- backend-ts preview-related services if needed for structured error payloads

Do not re-enable backend logs websocket.
Do not touch project creation feature.
Keep typecheck and tests green at each step.
```
