# OpenCode Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Drape's custom agent loop with OpenCode running inside containers, translating its JSON output to Drape's SSE events so the frontend stays unchanged.

**Architecture:** OpenCode `serve` runs in each container on port 4096. Backend adapter receives user messages, forwards to OpenCode via `run --attach --format json`, parses JSONL output, and emits Drape SSE events. Frontend is untouched.

**Tech Stack:** OpenCode CLI (npm opencode-ai), Node.js adapter, existing SSE infrastructure

**OpenCode JSON Event Format (verified by testing):**
```jsonl
{"type":"step_start","sessionID":"...","part":{"type":"step-start"}}
{"type":"text","sessionID":"...","part":{"type":"text","text":"Hello!"}}
{"type":"tool_use","sessionID":"...","part":{"type":"tool","tool":"read","callID":"...","state":{"status":"completed","input":{...},"output":"...","title":"..."}}}
{"type":"step_finish","sessionID":"...","part":{"type":"step-finish","reason":"stop|tool-calls","cost":0.005,"tokens":{...}}}
{"type":"error","sessionID":"...","error":{"name":"...","data":{"message":"..."}}}
```

**Env vars for providers:**
- `ANTHROPIC_API_KEY` → Claude models
- `GOOGLE_GENERATIVE_AI_API_KEY` → Gemini models (NOT GEMINI_API_KEY)
- `OPENAI_API_KEY` → GPT models
- `GROQ_API_KEY` → Groq models

---

### Task 1: Install OpenCode in Docker workspace image

**Files:**
- Modify: `backend-ts/Dockerfile.workspace`
- Create: `backend-ts/templates/opencode.json`
- Modify: `backend-ts/workspace-agent.js` (add OpenCode serve startup)

- [ ] **Step 1: Add OpenCode to Dockerfile.workspace**

Add after the existing npm install line:
```dockerfile
# Install OpenCode AI agent
RUN npm install -g opencode-ai@1.2.27
```
Pin the version to avoid breaking changes.

- [ ] **Step 2: Create opencode.json config template**

Create `backend-ts/templates/opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "google/gemini-2.5-flash",
  "agent": {
    "build": {
      "tools": ["edit", "write", "bash", "glob", "grep", "read", "webfetch"],
      "system": "You are a coding assistant for a mobile app development platform. The preview runs on a 390px phone screen. Design mobile-first. Use responsive Tailwind classes. For user-facing text use Italian unless told otherwise. Never use icon libraries that aren't installed — check package.json first. Use react-icons if available. For images use <img> not <Image> from next/image with external URLs."
    }
  },
  "mode": {
    "acceptEdits": {
      "permission": {
        "edit": "always",
        "write": "always",
        "bash": "always",
        "read": "always",
        "glob": "always",
        "grep": "always",
        "webfetch": "always"
      }
    }
  },
  "instructions": ["AGENTS.md"]
}
```

- [ ] **Step 3: Copy opencode.json in Dockerfile**

Add to Dockerfile.workspace before WORKDIR:
```dockerfile
COPY templates/opencode.json /home/coder/.config/opencode/config.json
```

- [ ] **Step 4: Start OpenCode serve in workspace-agent.js**

In `backend-ts/workspace-agent.js`, add after the server starts:
```javascript
// Start OpenCode serve in background
const { spawn } = require('child_process');
const opencodeServe = spawn('opencode', ['serve', '--port', '4096'], {
  cwd: '/home/coder/project',
  env: { ...process.env, HOME: '/home/coder' },
  stdio: 'ignore',
  detached: true,
});
opencodeServe.unref();
addLog('[agent] OpenCode serve started on port 4096');
```

- [ ] **Step 5: Pass API keys to container env in docker.service.ts**

Modify `backend-ts/src/services/docker.service.ts` createContainer Env array — add:
```typescript
`ANTHROPIC_API_KEY=${config.anthropicApiKey || ''}`,
`GOOGLE_GENERATIVE_AI_API_KEY=${config.geminiApiKey || ''}`,
`OPENAI_API_KEY=${config.openaiApiKey || ''}`,
`GROQ_API_KEY=${config.groqApiKey || ''}`,
```

- [ ] **Step 6: Build and test Docker image**

```bash
cd backend-ts && docker build -f Dockerfile.workspace -t drape-workspace:latest .
docker run --rm drape-workspace:latest opencode --version
# Expected: 1.2.27
```

- [ ] **Step 7: Commit**

```bash
git add backend-ts/Dockerfile.workspace backend-ts/templates/opencode.json backend-ts/workspace-agent.js backend-ts/src/services/docker.service.ts
git commit -m "feat: install OpenCode in workspace container"
```

---

### Task 2: Create OpenCode adapter service

**Files:**
- Create: `backend-ts/src/services/opencode-adapter.service.ts`

- [ ] **Step 1: Create the adapter service**

This service translates OpenCode JSONL output → Drape SSE events.

```typescript
// backend-ts/src/services/opencode-adapter.service.ts
import axios from 'axios';
import { log } from '../utils/logger';

// OpenCode JSON event types (from testing)
interface OpenCodeEvent {
  type: 'step_start' | 'text' | 'tool_use' | 'step_finish' | 'error';
  timestamp: number;
  sessionID: string;
  part?: {
    type: string;
    text?: string;
    tool?: string;
    callID?: string;
    state?: {
      status: string;
      input: any;
      output: string;
      title: string;
    };
    reason?: string;
    cost?: number;
    tokens?: {
      total: number;
      input: number;
      output: number;
      reasoning: number;
    };
  };
  error?: {
    name: string;
    data: { message: string };
  };
}

// Drape SSE event (existing format)
interface DrapeSSEEvent {
  type: string;
  data?: any;
}

// Model name mapping
const MODEL_MAP: Record<string, string> = {
  'gemini-3-flash': 'google/gemini-2.5-flash',
  'gemini-3.1-pro': 'google/gemini-2.5-pro',
  'claude-4-6-sonnet': 'anthropic/claude-sonnet-4-20250514',
  'claude-4-6-opus': 'anthropic/claude-opus-4-20250514',
  'gpt-5-3': 'openai/gpt-4.1',
  'claude-3.5-haiku': 'anthropic/claude-haiku-4-20250414',
};

export function mapDrapeModelToOpenCode(drapeModel: string): string {
  return MODEL_MAP[drapeModel] || drapeModel;
}

/**
 * Send a message to OpenCode serve and stream the response,
 * translating each OpenCode JSON event to a Drape SSE event.
 */
export async function streamOpenCodeResponse(
  agentUrl: string,
  message: string,
  model: string,
  sessionId?: string,
  onEvent: (event: DrapeSSEEvent) => void = () => {},
): Promise<void> {
  const openCodeUrl = agentUrl.replace(/:\d+$/, ':4096');
  const openCodeModel = mapDrapeModelToOpenCode(model);

  // Build command args
  const args = ['run', '--format', 'json', '--model', openCodeModel];
  if (sessionId) {
    args.push('--session', sessionId, '--continue');
  }
  args.push(message);

  log.info(`[OpenCode] Sending to ${openCodeUrl}: model=${openCodeModel}, session=${sessionId || 'new'}`);

  // Emit initial processing event
  onEvent({ type: 'processing', data: { status: 'starting' } });

  try {
    // Call OpenCode via its HTTP API (serve mode)
    // OpenCode serve exposes POST /sessions/{id}/messages or similar
    // For now, use exec to run opencode run --attach
    const response = await axios.post(
      `${openCodeUrl}/sessions/run`,
      { message, model: openCodeModel, sessionId },
      {
        responseType: 'stream',
        timeout: 300000, // 5 min max
        headers: { 'Content-Type': 'application/json' },
      }
    );

    let buffer = '';
    let iterationCount = 0;
    let totalCost = 0;
    let totalTokens = { input: 0, output: 0 };

    response.data.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event: OpenCodeEvent = JSON.parse(line);
          const drapeEvents = translateEvent(event, iterationCount);
          for (const de of drapeEvents) {
            onEvent(de);
          }

          // Track state
          if (event.type === 'step_start') iterationCount++;
          if (event.type === 'step_finish' && event.part) {
            totalCost += event.part.cost || 0;
            if (event.part.tokens) {
              totalTokens.input += event.part.tokens.input;
              totalTokens.output += event.part.tokens.output;
            }
          }
        } catch { /* skip non-JSON lines */ }
      }
    });

    await new Promise<void>((resolve, reject) => {
      response.data.on('end', () => {
        // Emit usage and completion
        onEvent({
          type: 'usage',
          data: {
            costEur: totalCost,
            tokensUsed: totalTokens,
            contextWindowPercent: 0,
          },
        });
        onEvent({ type: 'complete', data: {} });
        onEvent({ type: 'done', data: {} });
        resolve();
      });
      response.data.on('error', (err: Error) => {
        onEvent({ type: 'error', data: { message: err.message } });
        reject(err);
      });
    });
  } catch (err: any) {
    log.error(`[OpenCode] Stream error: ${err.message}`);
    onEvent({ type: 'error', data: { message: err.message } });
    onEvent({ type: 'done', data: {} });
  }
}

/**
 * Translate a single OpenCode event to one or more Drape SSE events.
 */
function translateEvent(event: OpenCodeEvent, iteration: number): DrapeSSEEvent[] {
  const events: DrapeSSEEvent[] = [];

  switch (event.type) {
    case 'step_start':
      events.push({
        type: 'iteration_start',
        data: { iteration },
      });
      break;

    case 'text':
      if (event.part?.text) {
        events.push({
          type: 'text_delta',
          data: { text: event.part.text },
        });
      }
      break;

    case 'tool_use': {
      const part = event.part;
      if (!part) break;
      const toolName = part.tool || 'unknown';
      const callID = part.callID || `tool-${Date.now()}`;
      const state = part.state;

      // Emit tool_start
      events.push({
        type: 'tool_start',
        data: {
          toolId: callID,
          tool: toolName,
          input: state?.input || {},
        },
      });

      // Emit tool_input with the input data
      events.push({
        type: 'tool_input',
        data: {
          toolId: callID,
          tool: toolName,
          input: state?.input || {},
        },
      });

      // If completed, emit tool_complete
      if (state?.status === 'completed') {
        events.push({
          type: 'tool_complete',
          data: {
            toolId: callID,
            tool: toolName,
            result: state.output || '',
            title: state.title || '',
          },
        });
      } else if (state?.status === 'error') {
        events.push({
          type: 'tool_error',
          data: {
            toolId: callID,
            tool: toolName,
            error: state.output || 'Tool execution failed',
          },
        });
      }
      break;
    }

    case 'step_finish':
      // Usage info emitted at stream end, not per step
      break;

    case 'error':
      events.push({
        type: 'error',
        data: {
          message: event.error?.data?.message || 'Unknown error',
          name: event.error?.name || 'Error',
        },
      });
      break;
  }

  return events;
}

/**
 * Check if OpenCode serve is running in a container.
 */
export async function isOpenCodeReady(agentUrl: string): Promise<boolean> {
  const openCodeUrl = agentUrl.replace(/:\d+$/, ':4096');
  try {
    const res = await axios.get(`${openCodeUrl}/health`, { timeout: 3000 });
    return res.status === 200;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend-ts/src/services/opencode-adapter.service.ts
git commit -m "feat: create OpenCode adapter service"
```

---

### Task 3: Replace agent routes to use OpenCode

**Files:**
- Modify: `backend-ts/src/routes/agent.routes.ts`

- [ ] **Step 1: Import the adapter**

At top of `agent.routes.ts`:
```typescript
import { streamOpenCodeResponse, mapDrapeModelToOpenCode, isOpenCodeReady } from '../services/opencode-adapter.service';
```

- [ ] **Step 2: Replace the POST /agent/run/fast handler**

Find the existing handler for `/run/fast` (or `/stream`). Replace the agent loop call with OpenCode:

```typescript
agentRouter.post('/run/fast', requireAuth, asyncHandler(async (req, res) => {
  const { projectId, prompt, model, history, images, thinkingLevel } = req.body;
  const userId = req.userId!;

  // Get container session
  const session = await workspaceService.getOrCreateContainer(projectId, userId);
  if (!session?.agentUrl) {
    return res.status(503).json({ error: 'Container not ready' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Send events as SSE
  const sendEvent = (event: { type: string; data?: any }) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Stream from OpenCode
  try {
    await streamOpenCodeResponse(
      session.agentUrl,
      prompt,
      model || 'gemini-3-flash',
      `project-${projectId}`, // session ID = project ID for persistence
      sendEvent,
    );
  } catch (err: any) {
    sendEvent({ type: 'error', data: { message: err.message } });
    sendEvent({ type: 'done', data: {} });
  }

  res.end();
}));
```

- [ ] **Step 3: Handle client disconnect**

Add disconnect detection:
```typescript
let clientDisconnected = false;
res.on('close', () => { clientDisconnected = true; });
```

And check in sendEvent:
```typescript
const sendEvent = (event) => {
  if (res.writableEnded || clientDisconnected) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};
```

- [ ] **Step 4: Keep heartbeat alive**

Add keepalive to prevent mobile proxy timeouts:
```typescript
const heartbeat = setInterval(() => {
  if (clientDisconnected) { clearInterval(heartbeat); return; }
  sendEvent({ type: 'heartbeat', data: { status: 'processing' } });
}, 5000);

// Clear on completion
// ... after streamOpenCodeResponse
clearInterval(heartbeat);
```

- [ ] **Step 5: Commit**

```bash
git add backend-ts/src/routes/agent.routes.ts
git commit -m "feat: route agent requests through OpenCode"
```

---

### Task 4: Handle OpenCode serve API format

**Files:**
- Modify: `backend-ts/src/services/opencode-adapter.service.ts`

The OpenCode `serve` API may not have a simple `/sessions/run` endpoint. We need to verify and adapt.

- [ ] **Step 1: Test OpenCode serve API**

```bash
# In container, start serve and check endpoints
opencode serve --port 4096 &
sleep 2
curl http://localhost:4096/ 2>&1
curl http://localhost:4096/health 2>&1
```

- [ ] **Step 2: If serve API doesn't support direct HTTP streaming, use exec fallback**

Replace the HTTP call in the adapter with a container exec approach:
```typescript
// Instead of HTTP to OpenCode serve, exec opencode run in the container
const execResult = await dockerService.execStream(
  containerId,
  ['opencode', 'run', '--attach', 'http://localhost:4096', '--format', 'json', '--model', model, message],
  { cwd: '/home/coder/project' }
);
```

- [ ] **Step 3: Commit adaptations**

```bash
git commit -am "fix: adapt to OpenCode serve API format"
```

---

### Task 5: Create AGENTS.md for each template

**Files:**
- Create: `backend-ts/templates/react/AGENTS.md`
- Create: `backend-ts/templates/nextjs/AGENTS.md`
- Create: `backend-ts/templates/vue/AGENTS.md`
- (one per template)

- [ ] **Step 1: Create Next.js AGENTS.md**

```markdown
# Next.js Project

This is a Next.js 15 App Router project with React 19 and Tailwind CSS v4.

## Structure
- `app/` — Pages and layouts (App Router)
- `app/components/` — Reusable components
- `app/globals.css` — Tailwind v4 setup with @theme inline
- `app/layout.tsx` — Root layout (imports globals.css)

## Rules
- Use `'use client'` for any component with hooks or event handlers
- Use `<img>` for images, NOT `<Image>` from next/image (external URLs break)
- react-icons is installed — use it for all icons
- Keep the dark theme from the template design system
- Mobile-first: base styles for 390px, then sm:/md:/lg: breakpoints
- If you need a Context Provider, include it in layout.tsx but KEEP the `import './globals.css'` line
```

- [ ] **Step 2: Create generic AGENTS.md for other templates**

Repeat for react, vue, nuxt, svelte, astro, angular, remix, solid, html, flask, django, fastapi, laravel, expo, flutter.

- [ ] **Step 3: Commit**

```bash
git add backend-ts/templates/*/AGENTS.md
git commit -m "feat: add AGENTS.md instructions for all templates"
```

---

### Task 6: Update config to pass correct env var names

**Files:**
- Modify: `backend-ts/src/config/index.ts`

- [ ] **Step 1: Verify env var names match OpenCode expectations**

OpenCode uses:
- `ANTHROPIC_API_KEY` ✅ (same as ours)
- `GOOGLE_GENERATIVE_AI_API_KEY` ❌ (we have `GEMINI_API_KEY`)
- `OPENAI_API_KEY` ✅ (same)
- `GROQ_API_KEY` ✅ (same)

- [ ] **Step 2: Map GEMINI_API_KEY to GOOGLE_GENERATIVE_AI_API_KEY in container env**

In docker.service.ts, when creating container:
```typescript
`GOOGLE_GENERATIVE_AI_API_KEY=${config.geminiApiKey || ''}`,
```

- [ ] **Step 3: Commit**

```bash
git commit -am "fix: map GEMINI_API_KEY to GOOGLE_GENERATIVE_AI_API_KEY for OpenCode"
```

---

### Task 7: Test end-to-end with Gemini (free)

- [ ] **Step 1: Build Docker image**
```bash
docker build -f Dockerfile.workspace -t drape-workspace:latest .
```

- [ ] **Step 2: Deploy backend**
```bash
bash deploy.sh
```

- [ ] **Step 3: Create a test project in the app**

- [ ] **Step 4: Send a chat message and verify:**
- Text streaming works
- Tool calls (read, write) show in UI
- Files actually get modified
- Preview refreshes

- [ ] **Step 5: Test with each provider** (one "hello" each to verify connection)
- Gemini ✅
- Claude (quick test)
- GPT (quick test)

- [ ] **Step 6: Fix any issues found**

- [ ] **Step 7: Commit and deploy**
```bash
git commit -am "feat: OpenCode integration complete"
bash deploy.sh
```

---

### Task 8: Clean up old agent code

**Files:**
- Remove: `backend-ts/src/services/agent-loop.service.ts` (keep as backup renamed)
- Remove: `backend-ts/src/services/agent-tools.service.ts`
- Remove: `backend-ts/src/tools/` directory
- Remove: `backend-ts/src/services/claude-code-system-prompt.txt`

- [ ] **Step 1: Rename old files to .bak (don't delete yet)**
```bash
mv agent-loop.service.ts agent-loop.service.ts.bak
mv agent-tools.service.ts agent-tools.service.ts.bak
```

- [ ] **Step 2: Remove old tool definitions**
```bash
mv tools/ tools.bak/
```

- [ ] **Step 3: Verify everything still compiles**
```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**
```bash
git commit -am "chore: archive old agent loop (replaced by OpenCode)"
```
