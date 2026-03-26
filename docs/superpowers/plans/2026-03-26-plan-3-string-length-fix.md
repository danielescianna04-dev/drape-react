# Plan 3: Fix Preview "String Length Exceeds Limit" Crash

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "String length exceeds limit" crash in React Native's XMLHttpRequest when loading the preview of generated projects.

**Architecture:** The crash occurs because React Native's XMLHttpRequest concatenates response text (`this._response += responseText`) and hits the JS engine's string size limit (~512MB on JSC, ~256MB on Hermes). This happens when the WebSocket file watcher or SSE streaming sends too much data. The fix is to limit response accumulation and use streaming properly.

**Tech Stack:** React Native, WebSocket (ws), EventSource polyfill

---

### Task 1: Diagnose the exact source of the oversized response

**Files:**
- Read: `src/features/terminal/components/PreviewPanel.tsx`
- Read: `src/features/terminal/components/PreviewWebView.tsx`
- Read: `src/hooks/useWebSocket.ts` or equivalent WebSocket hook

- [ ] **Step 1: Search for XMLHttpRequest usage patterns**

Search the codebase for fetch calls, EventSource, or WebSocket connections that could accumulate large responses during preview. The error is in XMLHttpRequest.js line 391 (`this._response += responseText`), which means a non-streaming HTTP response or SSE connection is accumulating text beyond the string limit.

```bash
grep -rn "EventSource\|new WebSocket\|fetch.*stream\|responseType" src/features/terminal/ --include="*.ts" --include="*.tsx" | head -20
```

- [ ] **Step 2: Check the file watcher WebSocket for large payloads**

The file watcher sends file contents over WebSocket when files change. A generated project with 20+ files could trigger a burst of large file-content messages. Check if the WebSocket accumulates messages.

- [ ] **Step 3: Check SSE/streaming connections in the preview**

The agent chat and preview use SSE (Server-Sent Events). If the preview reconnects to an SSE endpoint that replays the full generation history, the accumulated response could exceed the limit.

- [ ] **Step 4: Identify the specific connection causing the crash**

Add temporary logging to narrow down which fetch/WebSocket/SSE connection triggers the error. The call stack shows `__didReceiveIncrementalData` which is React Native's internal fetch handling — this means it's a regular `fetch()` call (not WebSocket) that returns a very large response.

### Task 2: Apply the fix

**Files:**
- Modify: The file identified in Task 1

- [ ] **Step 1: If the issue is a large fetch response**

Add `response.body` streaming or paginate the response. For large file listings or file content, implement pagination or lazy loading:

```typescript
// Instead of loading all files at once:
const response = await fetch(`${apiUrl}/workstation/${id}/files`);
const allFiles = await response.json(); // THIS CAN BE HUGE

// Load file tree (metadata only), then load content on demand:
const response = await fetch(`${apiUrl}/workstation/${id}/files?metadata=true`);
const fileTree = await response.json(); // Small: just paths and sizes
```

- [ ] **Step 2: If the issue is SSE accumulation**

Set `responseType` to avoid string accumulation, or close and reconnect SSE periodically:

```typescript
// Add to the fetch/EventSource configuration
const controller = new AbortController();
const response = await fetch(url, { signal: controller.signal });

// Or for XMLHttpRequest-based polyfills, reset periodically
```

- [ ] **Step 3: Test the fix**

Create a cloud mode project, navigate to preview, verify no crash. Check all 14 logs are gone.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: prevent String length exceeds limit crash in preview"
```
