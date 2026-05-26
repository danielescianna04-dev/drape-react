# API Reference

Base URL: `https://bynot.it`

All protected endpoints require a Firebase ID token in the `Authorization: Bearer <token>` header.

## Health & System

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Backend health status, uptime, memory |
| GET | `/health/version-check` | No | Check if app needs native update |
| GET | `/health/logs/stream` | No | SSE stream of backend logs |
| GET | `/health/logs/recent` | No | Recent logs (paginated, default 100) |
| GET | `/health/stats/system-status` | No | Per-user system status (tokens, projects, storage) |
| GET | `/health/ai/budget/:userId` | No | AI budget status (spending vs plan limit) |

## Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/send-verification` | No | Send email verification for registration |

## AI Chat

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/ai/chat` | Yes | Streaming chat (SSE). Body: `{ message, history, model, projectContext }` |
| POST | `/ai/chat/generate-title` | Yes | Generate short title for conversation (max 7 words) |
| POST | `/ai/recommend` | Yes | AI tech stack recommendation from project description |

## Agent

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/agent/tools` | Yes | List available tool definitions |
| GET | `/agent/status` | Yes | Agent capabilities and version |
| POST | `/agent/stream` | Yes | SSE streaming agent execution |
| POST | `/agent/run/fast` | Yes | Fast mode agent execution (SSE) |
| POST | `/agent/run/plan` | Yes | Plan mode agent execution (SSE) |
| POST | `/agent/run/execute` | Yes | Execute mode agent execution (SSE) |
| GET | `/agent/conversation/:projectId` | Yes | Load saved conversation for project |
| DELETE | `/agent/conversation/:projectId` | Yes | Delete saved conversation |
| POST | `/agent/execute-tool` | Yes | Execute single tool with input |
| GET | `/agent/plan/:projectId` | Yes | Get pending plan for project |
| POST | `/agent/approve-plan` | Yes | Approve or reject pending plan |

## Git Operations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/git/status/:projectId` | Yes | Git status, branch, changes, last 10 commits |
| POST | `/git/fetch/:projectId` | Yes | Fetch all remote branches |
| POST | `/git/pull/:projectId` | Yes | Pull latest changes |
| POST | `/git/push/:projectId` | Yes | Push commits to remote |
| POST | `/git/commit/:projectId` | Yes | Stage files and create commit |
| POST | `/git/checkout/:projectId` | Yes | Checkout or create branch |
| GET | `/git/branches/:projectId` | Yes | List all local branches |
| POST | `/git/init/:projectId` | Yes | Initialize git repo, optionally push to remote |
| POST | `/git/remote-branches` | Yes | List remote branches without cloning |
| POST | `/git/stash/:projectId` | Yes | Stash operations (push, pop, list) |

## GitHub

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/github/device-flow` | No | Start GitHub OAuth device flow |
| POST | `/github/poll-device` | No | Poll device code for access token |
| GET | `/github/user` | Bearer | Get authenticated GitHub user info |
| GET | `/github/repos` | Bearer | List user's repositories (paginated) |

## GitLab

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/oauth/gitlab/authorize` | No | Generate GitLab OAuth URL with state |
| POST | `/oauth/gitlab/callback` | No | Exchange auth code for access token |
| POST | `/oauth/gitlab/refresh` | No | Refresh GitLab access token |
| GET | `/oauth/gitlab/user` | Bearer | Get GitLab user info |
| GET | `/oauth/gitlab/repos` | Bearer | List GitLab projects (paginated) |

## Bitbucket

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/oauth/bitbucket/authorize` | No | Generate Bitbucket OAuth URL |
| POST | `/oauth/bitbucket/callback` | No | Exchange auth code for access token |
| POST | `/oauth/bitbucket/refresh` | No | Refresh Bitbucket access token |
| GET | `/oauth/bitbucket/user` | Bearer | Get Bitbucket user info |
| GET | `/oauth/bitbucket/repos` | Bearer | List Bitbucket repositories (paginated) |

## Workstation (File Operations)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/workstation/:projectId/files` | Yes | List project files |
| POST | `/workstation/read-file` | Yes | Read single file content |
| POST | `/workstation/write-file` | Yes | Write/create file |
| POST | `/workstation/edit-file` | Yes | Edit file with string replacement |
| POST | `/workstation/undo-file` | Yes | Revert file to previous content |
| POST | `/workstation/create-folder` | Yes | Create new folder |
| POST | `/workstation/delete-file` | Yes | Delete file |
| POST | `/workstation/list-directory` | Yes | List files in directory (with filtering) |
| POST | `/workstation/glob-files` | Yes | Find files matching glob pattern |
| POST | `/workstation/search-files` | Yes | Search files by regex |
| GET | `/workstation/:projectId/search` | Yes | Legacy search endpoint |
| POST | `/workstation/execute-command` | Yes | Execute shell command in project |
| POST | `/workstation/read-multiple-files` | Yes | Read multiple files at once |
| POST | `/workstation/edit-multiple-files` | Yes | Edit multiple files at once |
| DELETE | `/workstation/:projectId` | Yes | Delete entire project |
| POST | `/workstation/create` | Yes | Create new project from repository |
| POST | `/workstation/create-with-template` | Yes | Create project with starter template |
| GET | `/workstation/templates` | Yes | List available templates |
| GET | `/workstation/create-status/:taskId` | Yes | Get project creation status |

## Fly (Container & Preview)

### Project Management
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/fly/clone` | Yes | Quick warmup/clone project |
| POST | `/fly/project/create` | Yes | Create new project (local or from repo) |
| GET | `/fly/project/:id/files` | Yes | List project files |
| GET | `/fly/project/:id/file` | Yes | Read file (query: `path`) |
| POST | `/fly/project/:id/file` | Yes | Write/create file |
| POST | `/fly/project/:id/folder` | Yes | Create folder |
| POST | `/fly/project/:id/move` | Yes | Move/rename file or folder |
| POST | `/fly/project/:id/upload-files` | Yes | Bulk upload files |
| POST | `/fly/project/:id/exec` | Yes | Execute shell command |
| GET | `/fly/project/:id/env` | Yes | Read environment variables |
| POST | `/fly/project/:id/env` | Yes | Write environment variables |
| POST | `/fly/project/:id/env/analyze` | Yes | Analyze env var references |

### Preview & Publishing
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/fly/preview/start` | Yes | Start preview server (SSE streaming) |
| POST | `/fly/preview/stop` | Yes | Stop active preview |
| GET | `/fly/preview/context/:projectId` | Yes | Lightweight project context for AI |
| GET | `/fly/project/:id/published` | Yes | Check if project is published |
| POST | `/fly/project/:id/publish` | Yes | Build and publish as static site |
| DELETE | `/fly/project/:id/published` | Yes | Remove published site |

### Session & Container
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/fly/heartbeat` | Yes | Keep-alive signal |
| POST | `/fly/release` | Yes | Release container, stop preview |
| POST | `/fly/reload` | Yes | Reload project (NVMe sync) |
| POST | `/fly/session` | Yes | Create/manage session |
| POST | `/fly/pool/recycle` | Yes | Recycle idle containers |
| GET | `/fly/status` | Yes | System status and containers |
| GET | `/fly/vms` | Yes | List running containers |
| GET | `/fly/diagnostics` | Yes | Diagnostics (sessions, containers) |
| GET | `/fly/logs/:projectId` | Yes | SSE log stream from container |
| POST | `/fly/error-report` | Yes | Report client-side errors |

## In-App Purchases

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/iap/verify-receipt` | Yes | Verify Apple IAP receipt, update plan |
| POST | `/iap/apple-webhook` | No | Apple App Store Server Notifications v2 |

## Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/notifications/register` | Yes | Register FCM token |
| POST | `/notifications/send` | Yes | Send notification to user |
| POST | `/notifications/send-batch` | Yes | Send notification to multiple users |
| POST | `/notifications/preferences` | Yes | Update notification preferences |
| GET | `/notifications/preferences/:userId` | Yes | Get notification preferences |
| DELETE | `/notifications/unregister/:userId` | Yes | Unregister FCM token |
| POST | `/notifications/test/:userId` | Yes | Send test notification |

---

**Total: 96 endpoints** (18 public, 78 protected)
