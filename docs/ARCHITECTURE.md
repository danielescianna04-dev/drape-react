# Architecture

## Frontend structure

- `App.tsx` is still the root shell, but the app is organized by feature areas under `src/features`.
- `src/core` contains cross-feature state and services:
  - auth, tabs, terminal, workstation, github, git accounts, caching
- `src/features` contains product surfaces:
  - auth, projects, onboarding, settings, terminal, splash
- `src/pages/Chat` contains the main project workspace/chat screen and its chat-specific helpers.
- `src/shared` contains reusable UI, theme, types, utilities, and cross-feature molecules/organisms.

## Navigation and app flow

- The app currently uses a screen-state orchestration pattern in `App.tsx` rather than a fully declarative navigator for every route.
- High-level flow:
  1. splash / bootstrap
  2. auth
  3. consent and onboarding
  4. home/projects
  5. terminal/chat workspace
- The terminal workspace itself is tab-driven through `useTabStore`, with `VSCodeSidebar` acting as the shell around chat, preview, terminal, git, browser, env vars, tasks, database, and related views.

## Agent chat flow

- Frontend agent streaming is handled by `src/hooks/api/useAgentStream.ts`.
- The mobile/web client connects to backend agent endpoints with SSE (`/agent/run/fast`, `/agent/run/plan`, `/agent/run/execute`).
- Backend routing lives in `backend-ts/src/routes/agent.routes.ts`.
- The backend resolves the project container/workspace, then streams execution through OpenCode in the container via `backend-ts/src/services/opencode-adapter.service.ts`.
- Important distinction:
  - agent chat execution uses SSE + backend + OpenCode in containers
  - the disabled WebSocket service only concerns realtime backend log streaming, not the core agent path

## Frontend/backend/container relationship

- Frontend owns interaction state, tab UI, and stream rendering.
- Backend owns authorization, project ownership checks, container provisioning, agent orchestration, and filesystem/tool execution.
- Containers are the execution boundary for project code, commands, file edits, and OpenCode runs.
- `workspaceService` and Docker-related services in `backend-ts` bridge project identity to a live execution environment.

## State model

- Zustand stores are the primary client state mechanism.
- Key stores:
  - `useAuthStore`: user/auth/profile lifecycle
  - `useTabStore`: workspace tabs and tab-local content
  - `useTerminalStore`: terminal/project state compatibility layer
  - `useUIStore`: preview/UI affordances and cross-component workspace UI state
  - `useWorkstationStore`: current project/workstation and repository metadata

## Testing strategy

- Current repo testing uses Vitest with a jsdom environment.
- Existing coverage is still light and should keep expanding around:
  - tab/store behavior
  - chat helper logic
  - agent stream event normalization
  - preview lifecycle helpers
  - auth and settings flows
  - backend service helpers and route-level logic

## Current technical priorities

- Continue reducing monolithic files:
  - `ChatPage.tsx`
  - `TerminalItem.tsx`
  - `GitSheet.tsx`
  - `App.tsx`
- Prefer extracting:
  - pure helpers
  - feature-local typed view components
  - store adapters/selectors
  - event-normalization utilities
- Keep removing dead feature branches and backup artifacts from the tree so maintenance cost stays bounded.
