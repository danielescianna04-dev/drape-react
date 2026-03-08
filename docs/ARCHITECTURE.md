# Architecture

## System Overview

Drape is a monorepo with two main packages:

```
┌──────────────────────────────────────────────┐
│                   Mobile App                  │
│           React Native + Expo + TS            │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Screens │  │  Stores  │  │  Services  │  │
│  │ (features│  │ (Zustand)│  │ (API/WS)   │  │
│  └──────────┘  └──────────┘  └────────────┘  │
└───────────────────────┬──────────────────────┘
                        │ HTTPS / WSS
                        ▼
┌──────────────────────────────────────────────┐
│              Hetzner VPS (Nginx)              │
│         drape.info (Let's Encrypt)            │
│                                               │
│  ┌──────────────────────────────────────────┐ │
│  │          Backend (Express.js + TS)        │ │
│  │                                           │ │
│  │  ┌────────┐  ┌──────────┐  ┌──────────┐  │ │
│  │  │ Routes │  │ Services │  │ AI SDKs  │  │ │
│  │  │ (REST) │  │ (Docker, │  │ (Claude, │  │ │
│  │  │        │  │  Files)  │  │ GPT, etc)│  │ │
│  │  └────────┘  └──────────┘  └──────────┘  │ │
│  └──────────────────────────────────────────┘ │
│                                               │
│  ┌─────────────────────┐  ┌────────────────┐  │
│  │   Docker Containers │  │  File System   │  │
│  │   (per workspace)   │  │  (projects)    │  │
│  └─────────────────────┘  └────────────────┘  │
└───────────────────────┬──────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────┐
│             Firebase (drapev2)                │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │   Auth   │  │Firestore │  │  Storage   │  │
│  └──────────┘  └──────────┘  └────────────┘  │
└──────────────────────────────────────────────┘
```

## Frontend Architecture

### Screen State Machine

The app uses a manual state machine in `App.tsx` instead of deep navigation stacks:

```
splash → auth → onboarding → home
                                ↕
                          create / terminal / allProjects / settings / plans
```

Each screen is rendered conditionally. The `useNavigationStore` handles pending navigation between screens.

### State Management (Zustand)

All stores use Zustand with `getState()`/`setState()` for access outside React components.

| Store | File | Purpose |
|---|---|---|
| `authStore` | `core/auth/` | User session, Firebase auth, device tracking |
| `useChatStore` | `core/terminal/chatStore` | Chat history, sessions, folders |
| `useWorkstationStore` | `core/terminal/workstationStore` | Active workstation, project files |
| `useUIStore` | `core/terminal/uiStore` | Loading states, preview URL, logs |
| `useTerminalStore` | `core/terminal/` | Merged facade over chat + workstation + UI |
| `useProjectStore` | `core/projects/` | Project list, CRUD operations |
| `useTabStore` | `core/tabs/` | Open file tabs |
| `useIAPStore` | `core/iap/` | Products, purchases, plan status |
| `useNavigationStore` | `core/navigation/` | Cross-screen navigation intents |
| `useFileCacheStore` | `core/cache/` | In-memory file content cache |
| `useGitCacheStore` | `core/cache/` | Cached repository metadata |

### Component Architecture (Atomic Design)

```
shared/components/
├── atoms/          # Primitive UI elements
│   ├── Button, IconButton
│   ├── Input, TextInput
│   ├── StatusBadge
│   └── SafeText
│
├── molecules/      # Composed components
│   ├── ChatInput (message composer with attachments)
│   ├── BashCommandCard
│   ├── FileEditCard
│   ├── LoadingCard
│   └── FluidTabSwitcher
│
├── organisms/      # Complex sections
│   ├── PanelHeader
│   └── EmptyState
│
├── modals/         # Modal dialogs
├── agent/          # Agent-specific UI
└── icons/          # Custom SVG icons
```

### Terminal Screen Components (Main IDE)

The terminal screen is the largest feature with 50+ components:

| Component | Purpose |
|---|---|
| `Sidebar` | Panel navigation with icons (file explorer, chat, agent, preview, git, secrets, settings) |
| `FileExplorer` | Project file tree with context menus |
| `FileViewer` | Code editor with syntax highlighting |
| `ChatPanel` | AI conversation interface |
| `AgentChatPanel` | Autonomous agent interaction |
| `PreviewPanel` | Live web app preview |
| `PreviewWebView` | WebView rendering of preview |
| `PreviewAIChat` | Chat overlay while previewing |
| `PreviewEnvVarsForm` | Environment variable editor |
| `PreviewServerStatus` | Dev server status indicator |
| `PreviewToolbar` | Preview navigation controls |
| `PreviewPublishSheet` | Deploy/publish flow |
| `TerminalView` | Command output display |
| `TerminalItem` | Primary command/output card |
| `GitPanel` | Git operations UI |
| `SecretsPanel` | Environment variable management |
| `SettingsPanel` | IDE settings |
| `TabBar` | File tab management |
| `AutocompleteBar` | Command suggestions |
| `VSCodeSidebar` | VS Code-style sidebar |
| `FigmaPanel` | Figma integration |
| `SupabasePanel` | Supabase integration |
| `MultitaskingPanel` | Multi-task management |
| `WelcomeView` | First-time experience |
| `ImportGitHubModal` | Clone repository flow |
| `ConnectRepoModal` | Auth-required repository |
| `GitHubAuthModal` | GitHub OAuth flow |
| `GitAuthPopup` | Inline auth widget |
| `CloneWidget` | Clone progress |
| `IntegrationsFAB` | Floating action button for integrations |

### Custom Hooks

| Hook | File | Purpose |
|---|---|---|
| `useAgentStream` | `hooks/useAgentStream.ts` | Stream agent SSE responses |
| `useKeyboardShortcuts` | `hooks/useKeyboardShortcuts.ts` | Keyboard shortcut bindings |
| `useOTAUpdates` | `hooks/app/` | Expo OTA update checks |
| `useFileSync` | `hooks/business/` | WebSocket file synchronization |
| `useBackendLogs` | `hooks/business/` | Stream backend logs to terminal |

### Real-Time Communication

**WebSocket Service** (`core/websocket/`):
- TLS connection to `wss://drape.info`
- Firebase ID token authentication
- File change events: `file_created`, `file_deleted`, `subscribed_files`
- Subscription model: `subscribe_files` per project
- Exponential backoff reconnection (max 5 attempts)
- Heartbeat ping/pong

## Backend Architecture

### Route Structure

All routes are in `backend-ts/src/routes/`:

| Route File | Base Path | Purpose |
|---|---|---|
| `workstation.routes` | `/workstation` | Project CRUD, file operations, workspace lifecycle |
| `ai.routes` | `/ai` | Chat, code analysis, file modification |
| `agent.routes` | `/agent` | Agent execution, tool management |
| `git.routes` | `/git` | Clone, commit, push, pull, branch, PR |
| `github.routes` | `/github` | GitHub repo browser, user data |
| `gitlab.routes` | `/gitlab` | GitLab integration |
| `bitbucket.routes` | `/bitbucket` | Bitbucket integration |
| `fly.routes` | `/fly` | Container/preview server management |
| `auth.routes` | `/auth` | Email verification, password reset |
| `iap.routes` | `/iap` | In-app purchase validation |
| `notification.routes` | `/notification` | Push notifications |
| `health.routes` | `/health` | System health checks |

### Service Layer

Core services in `backend-ts/src/services/`:

| Service | Purpose |
|---|---|
| `ai-provider.service` | Unified interface to Claude, GPT-4, Gemini, Groq |
| `agent-loop.service` | Autonomous agent execution loop |
| `agent-tools.service` | Tool registration and routing |
| `workspace.service` | Workspace lifecycle management |
| `docker.service` | Docker container management via Dockerode |
| `container-lifecycle.service` | Container start/stop/monitor |
| `file.service` | File read/write/delete operations |
| `file-watcher.service` | Chokidar file system watching |
| `dev-server.service` | Development server management |
| `preview.service` | Web preview serving |
| `project-detector.service` | Framework/language detection |
| `dependency.service` | Dependency installation |
| `firebase.service` | Firebase Admin SDK operations |
| `email.service` | Transactional email via Resend |
| `notification.service` | Push notification dispatch |
| `apple-iap.service` | Apple receipt validation |
| `github-activity.service` | GitHub API operations |
| `session.service` | User session management |
| `memory.service` | Agent memory persistence |
| `conversation-store` | Chat conversation storage |
| `metrics.service` | Usage metrics tracking |
| `hooks.service` | Lifecycle hooks |
| `mcp-client` | Model Context Protocol client |
| `reengagement.service` | User re-engagement campaigns |

### Agent Tool System

Tools available to the AI agent (`backend-ts/src/tools/`):

| Tool | Description |
|---|---|
| `glob` | File pattern matching |
| `grep` | Content search with regex |
| `web-fetch` | Fetch and parse web pages |
| `web-search` | Web search queries |
| `todo-write` | Task list management |
| `skill-loader` | Dynamic skill loading |

### AI Provider Integration

The backend uses the Vercel AI SDK (`ai` package) for a unified interface:

```
User Request
    │
    ▼
ai-provider.service
    │
    ├── @ai-sdk/anthropic  → Claude (3.5 Sonnet, Haiku, Opus)
    ├── @ai-sdk/openai     → GPT-4, GPT-4o
    ├── @ai-sdk/google     → Gemini Pro, Flash
    └── groq-sdk           → Llama, Mixtral
```

Model selection can be automatic (`auto`) or user-specified per conversation.

### Container Architecture

Each workspace runs in an isolated Docker container:

```
User creates project
    │
    ▼
workspace.service  →  docker.service  →  Docker Container
    │                                         │
    ├── Clone repository                      ├── Isolated filesystem
    ├── Install dependencies                  ├── Dev server
    ├── Start dev server                      ├── Port mapping
    └── Watch files (chokidar)                └── WebSocket sync
```

## Authentication Flow

```
1. User opens app
2. Firebase Auth state listener checks session
3. If authenticated:
   a. Load user document from Firestore
   b. Register device (presence heartbeat)
   c. Check active device (concurrent session guard)
   d. Establish WebSocket connection
   e. Navigate to home/terminal
4. If not authenticated:
   a. Show AuthScreen
   b. Sign in via Email/Password, Apple, or Google
   c. Backend creates/updates user document
   d. Email verification sent (Resend)
   e. Navigate to onboarding (first time) or home
```

## Data Flow

### AI Chat Message

```
User types message
    │
    ▼
ChatInput → useChatStore.sendMessage()
    │
    ▼
aiService.sendMessage(message, history, model)
    │
    ▼
POST /ai/chat { message, history, model, projectContext }
    │
    ▼
ai-provider.service → Selected AI SDK → AI Provider API
    │
    ▼
SSE stream response → Frontend renders incrementally
    │
    ▼
useChatStore.addMessage(response)
```

### Agent Execution

```
User requests autonomous task
    │
    ▼
AgentChatPanel → useAgentStream()
    │
    ▼
POST /agent/execute { task, projectId }
    │
    ▼
agent-loop.service:
    ├── 1. Analyze task
    ├── 2. Select tools
    ├── 3. Execute tool (glob, grep, file edit, etc.)
    ├── 4. Evaluate result
    ├── 5. Repeat until complete
    └── 6. Return final response
    │
    ▼
SSE stream → Frontend shows tool calls + results in real-time
```

### File Sync

```
File changed on server (chokidar)
    │
    ▼
file-watcher.service → WebSocket broadcast
    │
    ▼
websocketService (client) receives event
    │
    ▼
useFileSync hook → useWorkstationStore.updateFile()
    │
    ▼
FileExplorer re-renders with updated tree
```

## Internationalization

- Framework: i18next + react-i18next
- Languages: Italian (`it`), English (`en`)
- Storage: AsyncStorage via `useLanguageStore` (Zustand)
- Translation files: `src/i18n/locales/{it,en}/`

## Caching Strategy

| Cache | Storage | TTL | Purpose |
|---|---|---|---|
| File cache | In-memory (Zustand) | Session | Avoid re-fetching file contents |
| Git cache | In-memory (Zustand) | Session | Cache repository metadata |
| API cache | React Query | Configurable | Server state deduplication |
| Auth token | Firebase SDK | Auto-refresh | ID token for API calls |
| Language | AsyncStorage | Persistent | User language preference |
| Onboarding | AsyncStorage | Persistent | Onboarding completion flag |

## Security

- All API calls over HTTPS (TLS via Let's Encrypt)
- Firebase ID token required for all authenticated endpoints
- Rate limiting on all routes (express-rate-limit)
- JWT validation via `jose` library
- Container isolation per workspace
- Secrets stored in Expo SecureStore (device) or environment variables (server)
- Firestore security rules enforce user-scoped access
