# Development Guide

## Prerequisites

- Node.js 20.11+
- npm or yarn
- Xcode (iOS development)
- Android Studio (Android development)
- EAS CLI (`npm install -g eas-cli`)
- Firebase project (drapev2)

## Initial Setup

### 1. Clone and Install

```bash
git clone <repo-url>
cd drape-react

# Automated setup (installs deps + creates .env)
npm run setup

# Or manual
npm install
cp .env.example .env   # Fill in values
```

### 2. Backend Setup

```bash
# Setup backend dependencies
npm run setup:backend

# Or manual
cd backend-ts
npm install
cp .env.example .env   # Fill in API keys
npm run build
```

### 3. Environment Configuration

**Frontend** (`.env` in root):
```
EXPO_PUBLIC_FIREBASE_API_KEY=<your-key>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=drapev2.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=drapev2
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=drapev2.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<your-id>
EXPO_PUBLIC_FIREBASE_APP_ID=<your-id>
EXPO_PUBLIC_GITHUB_CLIENT_ID=<your-id>
EXPO_PUBLIC_API_URL=https://drape.info
EXPO_PUBLIC_WS_URL=wss://drape.info
```

**Backend** (`.env` in `backend-ts/`):
```
FIREBASE_SERVICE_ACCOUNT_KEY=./serviceAccountKey.json
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
GROQ_API_KEY=gsk_...
RESEND_API_KEY=re_...
GITHUB_CLIENT_SECRET=...
PORT=3000
```

## Running Locally

### Frontend Only (points to production backend)
```bash
npm start              # Expo dev server (LAN mode)
# Scan QR with Expo Go, or press:
# i → iOS simulator
# a → Android emulator
# w → Web browser
```

### Frontend + Backend
```bash
npm run start:all      # Runs both concurrently
```

### Backend Only
```bash
npm run backend        # Node.js Express server
# Or for hot-reload:
cd backend-ts
npm run dev            # ts-node-dev with auto-restart
```

### Platform-Specific
```bash
npm run ios            # Build and run on iOS simulator
npm run android        # Build and run on Android emulator
npm run web            # Web browser with Expo
```

## Project Scripts

| Script | Description |
|---|---|
| `npm start` | Start Expo dev server (LAN) |
| `npm run start:all` | Start frontend + backend concurrently |
| `npm run start:clean` | Start Expo without cache |
| `npm run backend` | Start backend server |
| `npm run setup` | Run automated setup |
| `npm run setup:backend` | Setup backend deps |
| `npm run ip` | Get local IP for dev |
| `npm run ios` | Run on iOS simulator |
| `npm run android` | Run on Android emulator |
| `npm run web` | Run in web browser |
| `npm test` | Run tests (Vitest) |
| `npm run test:ui` | Tests with UI dashboard |
| `npm run test:coverage` | Tests with coverage report |
| `npm run test:watch` | Tests in watch mode |

## Testing

### Run Tests
```bash
npm test                  # Run all tests
npm run test:coverage     # With coverage report
npm run test:watch        # Watch mode
npm run test:ui           # Vitest UI dashboard
```

### Test Stack
- **Framework**: Vitest 4
- **Testing Library**: @testing-library/react-native
- **Coverage**: @vitest/coverage-v8
- **DOM**: happy-dom / jsdom

### Writing Tests
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react-native';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeTruthy();
  });
});
```

## Building for Production

### EAS Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Build for platforms
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

### Build Profiles (eas.json)

| Profile | Distribution | Channel | Use Case |
|---|---|---|---|
| `development` | Internal | development | Dev client builds |
| `preview` | Internal | preview | TestFlight / APK testing |
| `production` | Store | production | App Store / Play Store release |

Production builds auto-increment version numbers.

### Backend Build
```bash
cd backend-ts
npm run build          # Compiles TypeScript → dist/
npm start              # Runs compiled JS
```

## Deployment

### Frontend (App Updates)

**OTA Updates** (no store review needed):
```bash
eas update --channel production --message "Bug fix description"
```

**Native Builds** (requires store review):
```bash
eas build --platform all --profile production
eas submit --platform all
```

### Backend

Deploy to Hetzner VPS:
```bash
# Build
cd backend-ts
npm run build

# Deploy (via SCP)
scp -i ~/.ssh/id_ed25519_drape -r dist/ root@77.42.1.116:/opt/drape-backend/
scp -i ~/.ssh/id_ed25519_drape package.json root@77.42.1.116:/opt/drape-backend/

# On server
ssh -i ~/.ssh/id_ed25519_drape root@77.42.1.116
cd /opt/drape-backend
npm install --production
systemctl restart drape-backend
```

### Static Website

The marketing website (drape-dev.it) deploys automatically:
```bash
git push origin main   # Triggers GitHub Actions → rsync to server
```

## Code Style

### State Management
- Use Zustand stores for all shared state
- Access stores outside React with `getState()` / `setState()`
- Keep stores focused (one concern per store)

### Component Organization
- Follow atomic design: atoms → molecules → organisms
- Terminal components stay in `features/terminal/components/`
- Shared components go in `shared/components/`

### File Conventions
- PascalCase for components: `FileExplorer.tsx`
- camelCase for services: `aiService.ts`
- kebab-case for backend: `agent-loop.service.ts`
- Stores end in `Store`: `authStore.ts`, `useProjectStore.ts`

### TypeScript
- Strict mode enabled
- Use interfaces for object shapes
- Use Zod for runtime validation (backend)
- Avoid `any` - use `unknown` with type guards

## Common Tasks

### Add a New Screen
1. Create screen in `src/features/<feature>/`
2. Add screen state to `App.tsx` state machine
3. Add navigation case in screen renderer
4. Update `useNavigationStore` if needed

### Add a New API Endpoint
1. Create or update route in `backend-ts/src/routes/`
2. Create service logic in `backend-ts/src/services/`
3. Add types in `backend-ts/src/types/`
4. Register route in `backend-ts/src/routes/index.ts`
5. Add client-side call in `src/core/` service

### Add a New Agent Tool
1. Create tool in `backend-ts/src/tools/`
2. Export from `backend-ts/src/tools/index.ts`
3. Register in `agent-tools.service.ts`
4. Tool receives `{ input, projectId }` and returns string result

### Add a New Zustand Store
1. Create store in `src/core/<domain>/`
2. Use `create` from zustand
3. Export both hook (`useMyStore`) and static access (`useMyStore.getState()`)
4. Persist to AsyncStorage if needed

### Add a Translation
1. Add key to `src/i18n/locales/en/<namespace>.json`
2. Add Italian translation to `src/i18n/locales/it/<namespace>.json`
3. Use in component: `const { t } = useTranslation(); t('namespace:key')`

## Troubleshooting

### Expo Start Fails
```bash
npx expo start --clear    # Clear Metro cache
rm -rf node_modules && npm install   # Fresh install
```

### iOS Build Fails
```bash
cd ios && pod install      # Reinstall CocoaPods
npx expo run:ios --clean   # Clean build
```

### Backend TypeScript Errors
```bash
cd backend-ts
npm run typecheck          # Check without building
```

### WebSocket Connection Issues
- Verify `EXPO_PUBLIC_WS_URL` points to correct server
- Check Nginx WebSocket proxy config (`proxy_set_header Upgrade`)
- Verify Firebase ID token is valid and not expired
