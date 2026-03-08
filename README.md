# Drape - Mobile AI IDE

> React Native + Expo + TypeScript

Mobile-first code editor with multi-model AI, GitHub integration, autonomous agent, and live web preview. Build, edit, and deploy code from your phone.

## Quick Start

```bash
# Install dependencies (frontend + backend)
npm run setup

# Start frontend + backend together
npm run start:all

# Or separately
npm start            # Expo dev server
npm run backend      # Backend (Express.js)

# Run on platform
npm run ios          # iOS (requires Xcode)
npm run android      # Android emulator
npm run web          # Web browser
```

## Features

### Code Editor
- Syntax highlighting for 20+ languages
- File explorer with drag-and-drop
- Tab management with multi-file editing
- Undo/redo support
- Autocomplete suggestions

### AI Assistant
- Multi-model: Claude, GPT-4, Gemini, Groq
- Context-aware chat with project knowledge
- Code generation, analysis, and debugging
- Conversation history with folders
- Model selection per conversation

### Autonomous Agent
- Task-based autonomous execution
- Tool system: glob, grep, web search, web fetch, todo management
- Streaming responses with real-time tool output
- Agent loop with multi-step reasoning
- MCP (Model Context Protocol) client support

### Live Preview
- Real-time web app preview in-app
- Dev server management (start/stop/restart)
- Environment variables editor
- Port mapping and custom domains
- AI chat while previewing

### Git Integration
- GitHub, GitLab, Bitbucket, Gitea support
- Clone, commit, push, pull
- Branch management
- Pull request creation
- Multi-account token management

### Project Management
- Git projects (clone from remote)
- Personal projects (local-only)
- Project detection (framework, dependencies, build commands)
- Secrets/environment variable management

### In-App Purchases
- Starter (free), Go, Pro plans
- Monthly and annual billing
- Apple App Store + Google Play
- Server-side receipt validation

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React Native 0.81 | Cross-platform mobile framework |
| Expo 54 | Build toolchain and native modules |
| TypeScript 5.9 | Type safety |
| Zustand 5 | State management |
| React Navigation 7 | Screen navigation |
| React Query | Server state and caching |
| i18next | Internationalization (IT, EN) |
| Reanimated 4 | Animations |
| WebView | Preview and terminal rendering |
| react-native-iap | In-app purchases |

### Backend
| Technology | Purpose |
|---|---|
| Express.js 4.21 | HTTP server |
| TypeScript 5.5 | Type safety |
| Firebase Admin 12 | Auth, Firestore, Storage |
| Vercel AI SDK 6 | Unified AI provider interface |
| Dockerode 4 | Container management |
| Chokidar 4 | File system watching |
| WebSocket (ws) | Real-time file sync |
| Resend | Transactional email |
| Zod 4 | Schema validation |

### Infrastructure
| Component | Technology |
|---|---|
| Hosting | Hetzner VPS |
| Reverse Proxy | Nginx + Let's Encrypt |
| Database | Firebase Firestore |
| Auth | Firebase Auth |
| Storage | Firebase Storage |
| Push Notifications | Expo Notifications |
| OTA Updates | Expo Updates |
| CI/CD | GitHub Actions + EAS Build |

## Project Structure

```
drape-react/
├── src/
│   ├── core/                  # Business logic & state
│   │   ├── auth/              # Firebase authentication
│   │   ├── ai/                # AI service client
│   │   ├── agent/             # Agent execution
│   │   ├── github/            # GitHub API & OAuth
│   │   ├── git/               # Multi-provider git
│   │   ├── projects/          # Project CRUD
│   │   ├── workstation/       # Workstation lifecycle
│   │   ├── terminal/          # Terminal stores (chat, UI, workstation)
│   │   ├── iap/               # In-app purchases
│   │   ├── websocket/         # Real-time file sync
│   │   ├── cache/             # File & git caching
│   │   ├── tabs/              # Tab management
│   │   ├── firebase/          # Firebase config
│   │   ├── api/               # Axios client + auth tokens
│   │   ├── preview/           # Preview state
│   │   ├── toast/             # Toast notifications
│   │   ├── clone/             # Clone operations
│   │   ├── cloud/             # Cloud services
│   │   ├── history/           # Command history
│   │   ├── navigation/        # Cross-screen navigation
│   │   ├── onboarding/        # Onboarding flow
│   │   ├── services/          # Push, device, live activities
│   │   └── migrations/        # Data migrations
│   │
│   ├── features/              # Screen modules
│   │   ├── auth/              # Login/register screens
│   │   ├── projects/          # Project management screens
│   │   ├── terminal/          # Main IDE screen (50+ components)
│   │   ├── workstation/       # Workstation screens
│   │   ├── settings/          # Settings screen
│   │   ├── onboarding/        # Plan onboarding
│   │   └── splash/            # Splash screen
│   │
│   ├── shared/
│   │   ├── components/        # Reusable UI (atomic design)
│   │   │   ├── atoms/         # Button, Input, Badge, etc.
│   │   │   ├── molecules/     # ChatInput, CommandCard, etc.
│   │   │   ├── organisms/     # PanelHeader, EmptyState, etc.
│   │   │   ├── modals/        # Modal dialogs
│   │   │   ├── agent/         # Agent UI components
│   │   │   └── icons/         # Custom SVG icons
│   │   ├── theme/             # Colors, typography, spacing
│   │   └── utils/             # Helpers and utilities
│   │
│   ├── hooks/                 # Custom React hooks
│   │   ├── api/               # API data fetching
│   │   ├── business/          # Business logic hooks
│   │   ├── engine/            # Core engine hooks
│   │   ├── app/               # OTA updates, lifecycle
│   │   └── ui/                # Animations, keyboard
│   │
│   ├── config/                # App configuration
│   ├── i18n/                  # Translations (IT, EN)
│   ├── providers/             # React context providers
│   ├── navigation/            # Navigation setup
│   ├── constants/             # App constants
│   └── pages/                 # Standalone pages
│
├── backend-ts/                # Backend
│   └── src/
│       ├── routes/            # 13 route handlers
│       ├── services/          # 26 business services
│       ├── tools/             # Agent tools (glob, grep, web, etc.)
│       ├── middleware/        # Auth, rate limiting
│       ├── types/             # TypeScript types
│       └── utils/             # Utilities
│
├── App.tsx                    # Root component + screen state machine
├── app.json                   # Expo configuration
├── eas.json                   # EAS Build profiles
└── firestore.rules            # Firestore security rules
```

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design, state management, data flow |
| [API Reference](docs/API.md) | Backend endpoints and services |
| [Development Guide](docs/DEVELOPMENT.md) | Setup, build, deploy, and testing |

## Environment Variables

### Frontend (.env)
```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=drapev2
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_GITHUB_CLIENT_ID=
EXPO_PUBLIC_API_URL=https://drape.info
EXPO_PUBLIC_WS_URL=wss://drape.info
EXPO_PUBLIC_ENV=production
```

### Backend (.env)
```
FIREBASE_SERVICE_ACCOUNT_KEY=     # Path to serviceAccountKey.json
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_API_KEY=
GROQ_API_KEY=
RESEND_API_KEY=
GITHUB_CLIENT_SECRET=
```

## Plans

| Feature | Starter | Go | Pro |
|---|---|---|---|
| Price | Free | $19.99/mo ($4.99 first month) | $34.99/mo |
| Annual | - | $15.99/mo | $27.99/mo |
| Projects | 3 + 2 cloned | 10 + 5 cloned | 50 + 25 cloned |
| Previews | 5/month | 20/month | Unlimited |
| AI Budget | Limited | Standard | Unlimited |
| Storage | 1 GB | 5 GB | 10 GB |

## App Info

| | |
|---|---|
| Bundle ID | com.drape.app |
| Version | 2.0.2 |
| Platforms | iOS, Android, Web |
| Orientation | Portrait |
| Theme | Dark mode default |
| Firebase Project | drapev2 |
| Backend URL | https://drape.info |
| App Store | [Download](https://apps.apple.com/app/drape/id6758354741) |

## License

Proprietary - All rights reserved.
