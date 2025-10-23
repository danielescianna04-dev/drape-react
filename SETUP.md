# 🚀 Drape Setup Guide

Complete setup guide for new developers joining the project.

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- Google Cloud SDK (`gcloud`)
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

## Quick Setup (5 minutes)

### 1. Clone Repository

```bash
git clone https://github.com/danielescianna04-dev/drape-react.git
cd drape-react
```

### 2. Install Dependencies

```bash
npm run setup
```

This will:
- Copy `.env.example` to `.env`
- Install frontend dependencies
- Install backend dependencies
- Show your local IP for mobile development

### 3. Configure Environment Variables

Update `.env` with your local IP (shown in setup output):

```bash
# Replace with your local IP
EXPO_PUBLIC_API_URL=http://192.168.0.XXX:3000
EXPO_PUBLIC_WS_URL=ws://192.168.0.XXX:3000
```

**Firebase credentials are already configured** - no need to change them!

### 4. Setup Backend Authentication

```bash
npm run setup:backend
```

This will:
- Enable required Google Cloud APIs
- Create service account
- Generate authentication key
- Configure backend `.env`

### 5. Start Backend

```bash
cd backend
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json node server.js
```

Or add to your shell profile:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/backend/service-account-key.json"
```

### 6. Start App

In a new terminal:
```bash
npm start
```

Then press:
- `i` for iOS Simulator
- `a` for Android Emulator
- `w` for Web Browser

## Configuration Details

### Firebase (Already Configured)

The project uses Firebase project: `drape-mobile-ide`

Credentials in `.env`:
- ✅ API Key
- ✅ Auth Domain
- ✅ Project ID
- ✅ Storage Bucket
- ✅ Messaging Sender ID
- ✅ App ID

**No action needed** - these are shared across all developers.

### Google Cloud Service Account

Each developer needs their own service account key:

1. Run `npm run setup:backend`
2. Key saved to `backend/service-account-key.json`
3. **DO NOT commit this file** (already in `.gitignore`)

### GitHub OAuth (Optional)

For private repository access:
1. Go to https://github.com/settings/developers
2. Create OAuth App
3. Update `EXPO_PUBLIC_GITHUB_CLIENT_ID` in `.env`

## Troubleshooting

### Backend Connection Error

**Problem**: `Network Error` or `Request failed with status code 503`

**Solution**: Update `EXPO_PUBLIC_API_URL` in `.env` with your local IP:

```bash
# Find your IP
ipconfig getifaddr en0  # Mac
ipconfig                # Windows
```

### Firestore Permission Denied

**Problem**: `PERMISSION_DENIED: Missing or insufficient permissions`

**Solution**: Run `npm run setup:backend` to create service account with correct permissions.

### Firebase Connection Errors

**Problem**: `WebChannelConnection RPC 'Listen' stream errored`

**Solution**: Check Firestore rules at https://console.firebase.google.com/project/drape-mobile-ide/firestore/rules

Should be:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## Project Structure

```
drape-react/
├── .env                          # Your local config (not committed)
├── .env.example                  # Template with placeholders
├── backend/
│   ├── server.js                 # Express backend
│   ├── service-account-key.json  # Your auth key (not committed)
│   └── .env                      # Backend config
├── src/
│   ├── config/firebase.ts        # Firebase initialization
│   └── features/                 # App features
└── scripts/
    └── setup-backend.sh          # Backend setup script
```

## Security Notes

### Files NOT Committed (in .gitignore)

- `.env` - Your local environment variables
- `backend/service-account-key.json` - Your Google Cloud credentials
- `backend/.env` - Backend configuration

### Files Committed (Safe to Share)

- `.env.example` - Template without secrets
- Firebase config in `.env` - Public API keys (safe for client-side)
- All source code

## Team Collaboration

### Sharing Firebase Access

All developers use the same Firebase project: `drape-mobile-ide`

To add new team members:
1. Go to https://console.firebase.google.com/project/drape-mobile-ide/settings/iam
2. Add their Google account with "Editor" role

### Sharing Google Cloud Access

To add new team members:
1. Go to https://console.cloud.google.com/iam-admin/iam?project=drape-mobile-ide
2. Add their Google account with "Editor" role
3. They run `npm run setup:backend` to create their own service account

## Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup.

## Support

- Issues: https://github.com/danielescianna04-dev/drape-react/issues
- Docs: https://github.com/danielescianna04-dev/drape-react/wiki
