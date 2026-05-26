# Bynot Desktop — Electron App Specification

## Overview

Build **Bynot Desktop**, a macOS desktop application using **Electron + React + TypeScript** that replicates the core functionality of the Bynot mobile app (React Native). The visual style should be inspired by **OpenAI Codex** — minimal, dark, with a monospaced terminal-centric aesthetic.

The app connects to the **existing Bynot backend** (no backend rewrite needed). Everything runs on the same infrastructure.

---

## Existing Infrastructure (DO NOT Rebuild)

### Backend Servers (Hetzner VPS: 77.42.1.116)

| Environment | URL | Port | Service | Deploy Script |
|---|---|---|---|---|
| **Dev** | `https://dev.bynot.it` | 3002 | `bynot-backend-dev` | `deploy-dev.sh` |
| **Prod** | `https://bynot.it` | 3001 | `bynot-backend` | `deploy.sh` |

- SSH: `root@77.42.1.116` port `49222`, key `~/.ssh/id_ed25519_bynot`
- Backend source: `backend-ts/` (Express + TypeScript + Docker)
- Projects stored on NVMe at `/data/projects/{projectId}`
- Published sites at `/data/published/{slug}`

### Firebase Projects

| Environment | Project ID | Auth Domain | API Key |
|---|---|---|---|
| **Dev** | `bynot-dev` | `bynot-dev.firebaseapp.com` | `AIzaSyApLi3ZCoaJxE9PKV617LczwOGnffyHca4` |
| **Prod** | `bynotv2` | `bynotv2.firebaseapp.com` | `AIzaSyAJkZyI2b_77f8XWfP1anWdmWlaTotx930` |

**Dev Firebase full config:**
```
API_KEY=AIzaSyApLi3ZCoaJxE9PKV617LczwOGnffyHca4
AUTH_DOMAIN=bynot-dev.firebaseapp.com
PROJECT_ID=bynot-dev
STORAGE_BUCKET=bynot-dev.firebasestorage.app
MESSAGING_SENDER_ID=127888670449
APP_ID=1:127888670449:web:d7de3fe78034aaa74b3350
```

**Prod Firebase full config:**
```
API_KEY=AIzaSyAJkZyI2b_77f8XWfP1anWdmWlaTotx930
AUTH_DOMAIN=bynotv2.firebaseapp.com
PROJECT_ID=bynotv2
STORAGE_BUCKET=bynotv2.firebasestorage.app
MESSAGING_SENDER_ID=76009555388
APP_ID=1:76009555388:ios:2152442e43e04855ccd7b9
```

**Firestore Collections:**
- `users/{userId}` — user doc (plan, subscription, creationCounters, presence)
- `users/{userId}/projects` — user's projects
- `users/{userId}/workstations` — user's workstations
- `user_projects/{projectId}` — project metadata (userId, previewCount, status)
- `projects/{projectId}` — global project data
- `conversations/{id}` — stored chat conversations

### Docker Containers

Each project gets a Docker container (`bynot-workspace:latest`) with:
- **User**: `coder` (UID 1000)
- **Resources**: 4 CPUs, 4GB RAM
- **Network**: `bynot-net` (bridge)
- **Mounts**:
  - `/data/projects/{projectId}` → `/home/coder/project`
  - `/data/pnpm-store` → `/home/coder/volumes/pnpm-store` (ro)
  - `/data/cache` → `/data/cache`
  - `/opt/flutter` → `/opt/flutter` (ro)
- **Software inside**: Node.js, Python, Go, Rust, Flutter, pnpm, git
- **OpenCode pre-installed**: The AI coding agent `opencode` is already installed in every container. The backend uses `opencode run --attach --format json` via `docker exec` to stream AI responses. Model mapping: Bynot model names → OpenCode provider/model format.
- **API keys injected as env vars**: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`
- **Dev server** runs on port 3000 inside container, mapped to a dynamic host port (49152+)
- **Idle reaper**: containers destroyed after 15 min of inactivity

### OpenCode Integration

The backend uses OpenCode as the AI agent engine inside containers:

```typescript
// Model mapping (Bynot → OpenCode)
'gemini-3-flash'    → 'google/gemini-3-flash-preview'
'gemini-3.1-pro'    → 'google/gemini-3.1-pro-preview'
'claude-4-6-sonnet' → 'anthropic/claude-sonnet-4-6'
'claude-4-6-opus'   → 'anthropic/claude-opus-4-6'
'gpt-5-4'           → 'openai/gpt-5.4'
```

OpenCode JSONL events are translated to Bynot SSE events by `opencode-adapter.service.ts`. Event types: `step_start`, `text`, `tool_use`, `step_finish`, `error`.

---

## Complete API Surface

### Authentication
All protected endpoints require `Authorization: Bearer {firebaseIdToken}`. The backend verifies tokens with Firebase Admin SDK and caches them for 5 minutes.

### Public Endpoints (No Auth)
```
GET  /health                              → { status: 'ok' }
GET  /logs/stream                         → SSE log stream
GET  /p/:slug                             → Published static sites
GET  /files/:projectId/browse?token=...   → HTML file browser page
GET  /files/:projectId/download?path=...&token=... → File download
GET  /files/:projectId/download-zip?token=...      → Project ZIP download
POST /auth/send-verification              → { email, displayName? }
POST /auth/send-password-reset            → { email }
POST /iap/apple-webhook                   → Apple Store Server Notifications v2
GET  /github/callback                     → GitHub OAuth callback
GET  /oauth/gitlab/callback               → GitLab OAuth callback
GET  /oauth/bitbucket/callback            → Bitbucket OAuth callback
```

### Agent Endpoints (`/agent/*` — requireAuth)
```
GET  /agent/tools                         → List available tools
GET  /agent/status                        → Agent status + capabilities
POST /agent/stream                        → SSE stream (main AI chat)
     Body: { prompt, projectId, model?, conversationHistory?, images?, thinkingLevel? }
POST /agent/run/fast                      → Quick AI response
POST /agent/run/plan                      → Generate execution plan
POST /agent/run/execute                   → Execute plan
POST /agent/tool                          → Execute single tool
     Body: { projectId, tool, input }
```

### Fly/Container Endpoints (`/fly/*` — requireAuth)
```
POST /fly/clone                           → Create container + clone repo
     Body: { projectId, repositoryUrl?, githubToken?, branch? }
POST /fly/preview/start                   → Full setup: container + install + dev server (SSE)
     Body: { projectId, repositoryUrl?, githubToken? }
POST /fly/preview/stop                    → Stop dev server
     Body: { projectId }
POST /fly/release                         → Destroy container
     Body: { projectId }
GET  /fly/project/:id/files               → List project files
GET  /fly/project/:id/file?path=...       → Read file content
POST /fly/project/:id/file                → Write file
     Body: { path, content }
POST /fly/project/:id/exec               → Execute command in container
     Body: { command }
GET  /fly/project/:id/preview-status      → Dev server status
GET  /fly/status                          → System status (public, no auth)
```

### Git Endpoints (`/git/*` — requireAuth)
```
GET  /git/status/:projectId               → Branch, changes, commits, ahead/behind
POST /git/fetch/:projectId                → Fetch from remote
POST /git/pull/:projectId                 → Pull from remote
POST /git/push/:projectId                 → Push to remote
POST /git/commit/:projectId               → Create commit { message }
POST /git/checkout/:projectId             → Switch branch { branch }
POST /git/create-branch/:projectId        → New branch { branch }
```
Git token passed via `x-git-token` header. URL rewriting for GitHub/GitLab/Bitbucket auth.

### AI Chat Endpoints (`/ai/*` — requireAuth)
```
POST /ai/chat                             → SSE stream of { type: 'text'|'thinking' }
     Body: { prompt, selectedModel, conversationHistory?, thinkingLevel? }
POST /ai/chat/generate-title              → Generate chat title { message }
POST /ai/recommend                        → Project recommendation { description }
```

### Database Endpoints (`/db/*` — requireAuth)
```
GET  /db/discover/:projectId              → Find databases (SQLite, PG, Supabase, Neon)
GET  /db/tables/:projectId/:db            → List tables with row counts
GET  /db/schema/:projectId/:db            → Full schema (columns, types, FKs)
POST /db/query/:projectId/:db             → Execute SQL { sql }
```

### Workstation Endpoints (`/workstation/*` — requireAuth)
```
POST /workstation/create                  → Create project { name, template?, repositoryUrl? }
GET  /workstation/:projectId/files        → List files
GET  /workstation/:projectId/file         → Read file { path }
POST /workstation/:projectId/file         → Write file { path, content }
DELETE /workstation/:projectId            → Delete project + container
```

### Notification Endpoints (`/notifications/*` — requireAuth)
```
POST /notifications/register              → Register push token
POST /notifications/unregister            → Unregister push token
```

### IAP Endpoints (`/iap/*`)
```
POST /iap/verify-receipt                  → Verify Apple receipt (requireAuth)
     Body: { transactionId, productId? }
```

---

## WebSocket Protocol

**Connect**: `wss://{host}?token={firebaseIdToken}`

### Client → Server Messages
```json
{ "type": "ping" }
{ "type": "subscribe_files", "projectId": "..." }
{ "type": "unsubscribe_files", "projectId": "..." }
{ "type": "subscribe_logs", "projectId": "..." }
{ "type": "subscribe", "workstationId": "..." }
{ "type": "terminal_start", "projectId": "...", "cols": 80, "rows": 24 }
{ "type": "terminal_input", "data": "<base64>" }
{ "type": "terminal_resize", "cols": 120, "rows": 30 }
```

### Server → Client Messages
```json
{ "type": "connected", "version": "2.0.2", "architecture": "docker-ts" }
{ "type": "pong", "timestamp": 1234567890 }
{ "type": "subscribed_files", "projectId": "..." }
{ "type": "file_change", "projectId": "...", "action": "add|modify|delete", "path": "..." }
{ "type": "backend_log", "log": { "timestamp": "...", "level": "...", "message": "..." } }
{ "type": "terminal_started" }
{ "type": "terminal_output", "data": "<base64>" }
{ "type": "terminal_exit" }
{ "type": "terminal_error", "message": "..." }
{ "type": "error", "message": "..." }
{ "type": "shutdown" }
```

---

## Pricing Tiers

| Plan | Projects (created/cloned/local) | Storage | AI Budget/mo | Previews/project |
|---|---|---|---|---|
| **Free** | 2 / 1 / 1 | 1 GB | €1.00 | 20 |
| **Go** | 10 / 5 / 3 | 5 GB | €7.50 | Unlimited |
| **Pro** | 50 / 25 / 10 | 20 GB | €50.00 | Unlimited |
| **Team** | 200 / 100 / 20 | 50 GB | €200.00 | 300 |

AI model costs tracked per-token with cached token discount (1/4 rate). USD→EUR: 0.92.

---

## Electron App Architecture

### Tech Stack
- **Framework**: Electron (latest)
- **Renderer**: React 19 + TypeScript
- **Bundler**: Vite
- **State**: Zustand (same as mobile app)
- **Styling**: Tailwind CSS (Codex-like aesthetic)
- **Terminal**: xterm.js (full PTY via WebSocket)
- **Editor**: Monaco Editor (VS Code engine)
- **Auth**: Firebase JS SDK (web) — same as mobile, reuse existing Firebase projects
- **HTTP**: Axios
- **WebSocket**: Native WebSocket API

### Visual Design (Codex-inspired)
- Dark background (#0a0a0a to #111)
- Monospaced fonts (JetBrains Mono / SF Mono)
- Minimal chrome, no gradients
- Single-column layout: sidebar (projects/chat list) + main area
- Terminal-first feel — the AI chat looks like a terminal conversation
- Subtle borders (rgba(255,255,255,0.08))
- Purple accent (#8B5CF6) for interactive elements (matching Bynot brand)
- No unnecessary animations — fast, snappy transitions

### Window Layout
```
┌──────────────────────────────────────────────────┐
│ Traffic lights          Bynot Desktop    ⚙️      │
├────────┬─────────────────────────────────────────┤
│        │ Tab bar: Chat | Terminal | Files | ...   │
│ Side   │─────────────────────────────────────────│
│ bar    │                                         │
│        │  Main content area                      │
│ • Projects  │  (Chat / Terminal / Editor /        │
│ • Chats     │   Preview / Database / Git)        │
│ • Settings  │                                    │
│        │                                         │
│        │                                         │
│        ├─────────────────────────────────────────│
│        │ Input bar: [model selector] [prompt...] │
└────────┴─────────────────────────────────────────┘
```

### Core Features (Priority Order)

#### P0 — Must Have
1. **Auth**: Firebase email/password + Google + GitHub OAuth login
2. **Project List**: Show user's projects from Firestore, create new from template/repo
3. **AI Chat**: Streaming AI responses via `/agent/stream` SSE, model selector, conversation history
4. **Terminal**: Full PTY terminal via WebSocket (`terminal_start`/`terminal_input`/`terminal_output`)
5. **File Explorer**: Tree view of project files via `/fly/project/:id/files`
6. **Code Editor**: Monaco editor for file editing via `/fly/project/:id/file` (read/write)
7. **Preview**: Embedded webview showing dev server output (`https://{projectId}.bynot.it/` or proxy URL)
8. **Git**: Status, commit, push, pull, branch switch via `/git/*` endpoints

#### P1 — Should Have
9. **Database Viewer**: Discover + query databases via `/db/*` endpoints
10. **File Watcher**: Real-time file change notifications via WebSocket
11. **Build Reports**: Display build/install logs
12. **Search**: Global file search (grep) via `/fly/project/:id/grep`

#### P2 — Nice to Have
13. **Multiple tabs/splits**: Split editor and terminal side by side
14. **Keyboard shortcuts**: Cmd+P (file search), Cmd+` (terminal), Cmd+Enter (send prompt)
15. **Drag & drop**: Upload local files to project container
16. **Theming**: Light/dark mode toggle
17. **Desktop notifications**: Build complete, AI response ready
18. **Stripe billing**: Replace Apple IAP with Stripe for desktop plans

### Auth Flow (Desktop)
1. Show login screen with Email + Google + GitHub options
2. Firebase JS SDK handles auth (same as web — `signInWithPopup` for OAuth)
3. Get `idToken` from Firebase user object
4. Store refresh token securely (Electron `safeStorage`)
5. All API calls: `Authorization: Bearer {idToken}`
6. WebSocket connect: `wss://dev.bynot.it?token={idToken}`

### Dev/Prod Switching
- Use environment variable `BYNOT_ENV=development|production`
- Dev: `https://dev.bynot.it`, Firebase project `bynot-dev`
- Prod: `https://bynot.it`, Firebase project `bynotv2`
- Config file selects the right Firebase credentials and API URL

### Desktop-Specific Additions (NOT in mobile)
- **Monaco Editor** with full IntelliSense, syntax highlighting, multi-cursor
- **Split panes**: Editor + Terminal side by side
- **Local file upload**: Drag files from Finder into project
- **Clipboard integration**: Copy/paste code seamlessly
- **Native menus**: macOS menu bar with standard shortcuts
- **Auto-update**: electron-updater for OTA desktop updates

### What NOT to Build
- No custom backend — use the existing `backend-ts` as-is
- No container management code — the backend handles all Docker orchestration
- No AI agent logic — the backend runs OpenCode in containers
- No Apple IAP — desktop uses Stripe (or free during beta)
- No push notifications initially — desktop notifications via Electron API
- No React Native dependencies — pure React + web APIs

---

## Project Structure
```
bynot-desktop/
├── electron/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # Preload script (IPC bridge)
│   └── updater.ts           # Auto-update logic
├── src/
│   ├── App.tsx              # Root component
│   ├── main.tsx             # React entry point
│   ├── config/
│   │   ├── firebase.ts      # Firebase init (dev/prod)
│   │   └── config.ts        # API URLs, env detection
│   ├── core/
│   │   ├── auth/            # Auth store (Zustand)
│   │   ├── api/             # API client (Axios + auth interceptor)
│   │   ├── websocket/       # WebSocket service
│   │   ├── projects/        # Project store
│   │   └── chat/            # Chat store + history
│   ├── features/
│   │   ├── chat/            # AI chat UI (streaming, markdown, code blocks)
│   │   ├── terminal/        # xterm.js terminal
│   │   ├── editor/          # Monaco editor
│   │   ├── files/           # File tree explorer
│   │   ├── preview/         # Embedded webview preview
│   │   ├── git/             # Git status, commit, push UI
│   │   ├── database/        # Database viewer
│   │   └── settings/        # Settings panel
│   ├── shared/
│   │   ├── components/      # Shared UI components
│   │   ├── hooks/           # Shared React hooks
│   │   └── types/           # TypeScript types
│   └── styles/
│       └── globals.css      # Tailwind + custom styles
├── package.json
├── electron-builder.yml     # Build config for macOS DMG
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Key Implementation Notes

1. **SSE Streaming**: The `/agent/stream` endpoint returns Server-Sent Events. Use `EventSource` or `fetch` with `ReadableStream` to consume them. Events: `text` (AI response chunk), `thinking` (reasoning), `tool_use` (tool execution), `tool_result`, `error`, `done`.

2. **Terminal PTY**: Connect via WebSocket, send `terminal_start`, then pipe `terminal_input`/`terminal_output` to xterm.js. Data is base64-encoded.

3. **Preview iframe**: Use `<webview>` tag (Electron) or `<iframe>` pointing to `https://{projectId}.bynot.it/`. The backend handles all proxying.

4. **File editing**: Read file via `GET /fly/project/:id/file?path=...`, edit in Monaco, save via `POST /fly/project/:id/file` with `{ path, content }`.

5. **OpenCode in containers**: The AI agent runs inside the container via `opencode`. The backend handles all the orchestration — the desktop app just calls `/agent/stream` and displays results. No need to understand OpenCode internals.

6. **Google OAuth for desktop**: Use `signInWithPopup(auth, googleProvider)` — Electron can handle popup windows for OAuth. Register `http://localhost` as authorized redirect URI in Google Cloud Console.

7. **GitHub OAuth**: The existing backend handles the OAuth flow at `/github/callback`. Open the GitHub auth URL in a browser window, capture the redirect.
