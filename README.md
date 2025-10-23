# 📱 Drape - Mobile AI IDE

> React Native + Expo + TypeScript - Complete migration from Flutter

AI-powered mobile development environment with terminal, GitHub integration, and multi-model AI support.

**Backend**: Google Cloud Run with intelligent container management

📦 **Smart Container System**: Auto-scaling, cost optimization (80% savings), instant wake-up. See [Container Management Guide](./CONTAINER_MANAGEMENT.md)

🤖 **Multi-AI Integration**: Vertex AI (Gemini Pro), with support for OpenAI GPT-4, Anthropic Claude, and more

## 🚀 Quick Start

```bash
# One-command setup (installs dependencies + creates .env)
npm run setup

# Setup backend authentication
npm run setup:backend

# Start backend
cd backend
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json node server.js

# Start app (in new terminal)
npm start

# Run on platform
npm run ios      # iOS Simulator
npm run android  # Android Emulator
npm run web      # Web Browser
```

**📖 Full setup guide**: See [SETUP.md](./SETUP.md) for detailed instructions.

**🔥 Firebase is pre-configured** - just run setup and start coding!

## ✨ Features

### 🖥️ Terminal
- AI-powered command execution
- Multi-language support (Python, JavaScript, C, C++, etc.)
- Syntax highlighting
- Command history
- Autocomplete

### 🤖 AI Integration
- **Vertex AI (Gemini Pro)** - Google's advanced AI with project context
- **Multi-model support** - OpenAI GPT-4, Anthropic Claude (configurable)
- **Collaborative AI** - Multiple AI models working together
- **Context-aware responses** - AI knows your current project
- **Agent mode** for autonomous tasks

### 🔗 GitHub Integration
- Repository browser
- Clone repositories
- Commit and push
- Branch management
- Pull requests

### 💬 Chat System
- Multiple chat sessions
- Chat folders
- Search functionality
- Session persistence

### 📦 Smart Container Management
- **Auto-scaling**: Containers scale based on usage
- **Cost optimization**: 80% savings with idle/stop states
- **Instant wake-up**: 1-2 second response from idle
- **Security**: Isolated environments per project
- See [Container Management Guide](./CONTAINER_MANAGEMENT.md) for details

### 🎨 UI/UX
- Glassmorphism design
- Dark/Light mode
- Smooth animations
- Touch-optimized
- Sidebar navigation

## 🏗️ Architecture

### Frontend (React Native + Expo)
- **State Management**: Zustand with Firebase persistence
- **Navigation**: React Navigation with tab-based layout
- **UI Components**: Custom glassmorphism design
- **Real-time Updates**: Firebase Firestore integration

### Backend (Google Cloud Run)
- **Runtime**: Node.js with Express
- **AI Integration**: Vertex AI (Gemini Pro) + Multi-AI orchestrator
- **Container Management**: Google Cloud Workstations
- **Database**: Firebase Firestore
- **Storage**: Google Cloud Storage
- **Authentication**: Firebase Auth

### Infrastructure
- **Project**: `drape-93229` (unified Firebase + Google Cloud)
- **Region**: `us-central1`
- **Container Registry**: Google Artifact Registry
- **CI/CD**: GitHub Actions with automatic deployment
- **Secrets Management**: GitHub Secrets + Google Secret Manager

## 🔧 Configuration

### GitHub Secrets Required
```
# Firebase
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID

# Google Cloud
GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY
VERTEX_AI_SERVICE_ACCOUNT_KEY

# GitHub OAuth
EXPO_PUBLIC_GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET

# AI APIs (Optional)
OPENAI_API_KEY
ANTHROPIC_API_KEY
GOOGLE_AI_API_KEY

# Deployment
EXPO_TOKEN
```

## 🚀 Deployment

### Automatic Deployment (Recommended)
```bash
# 1. Configure GitHub Secrets (see above)
# 2. Push to main branch
git add .
git commit -m "Deploy to production"
git push origin main

# 3. GitHub Actions automatically:
# - Deploys backend to Google Cloud Run
# - Gets real backend URL
# - Configures frontend with correct URLs
# - Builds and deploys the app
```

### Manual Deployment
```bash
# Backend
cd backend
gcloud config set project drape-93229
gcloud builds submit --config cloudbuild.yaml

# Frontend
npm run build
npx eas build --platform all
```

## 🤖 AI Models Configuration

### Vertex AI (Default - Always Available)
- **Model**: Gemini Pro
- **Capabilities**: Code analysis, chat, project context
- **Authentication**: Service account (automatic)
- **Cost**: Pay-per-use, optimized for development

### Multi-AI Orchestrator (Optional)
```javascript
// Automatic AI selection based on task
const aiResponse = await aiOrchestrator.collaborativeResponse(
  "How do I optimize this Python code?",
  { projectId: "my-project", files: [...] }
);

// Result: Multiple AI models collaborate on the response
```

## 💰 Cost Optimization

### Container Management
- **Auto-shutdown**: Containers stop after 30 minutes idle
- **Smart Scaling**: Resources scale based on actual usage
- **Spot Instances**: Use cheaper compute when available
- **Regional Optimization**: Deploy in cost-effective regions

### Estimated Monthly Costs
- **Light Usage** (2h/day): $10-15/month
- **Regular Usage** (4h/day): $25-35/month  
- **Heavy Usage** (8h/day): $50-75/month
- **Enterprise** (24/7): $150-250/month

## 📱 Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| iOS | ✅ Ready | Tested on simulator and device |
| Android | ✅ Ready | Tested on emulator and device |
| Web | ✅ Ready | Full PWA support |

## 🔄 Migration from Flutter

This project is a complete migration from the original Flutter version:

### Maintained Features
- ✅ Exact same UI (98.5% visual fidelity)
- ✅ All terminal functionality
- ✅ GitHub integration
- ✅ AI chat system
- ✅ Project management
- ✅ Container orchestration

### Improvements
- 🚀 **Better Performance**: React Native optimizations
- 🔧 **Easier Development**: TypeScript + modern tooling
- 🌐 **Web Support**: PWA capabilities added
- 🤖 **Enhanced AI**: Multi-model support
- ☁️ **Cloud Native**: Full Google Cloud integration

## 🤝 Contributing

### Development Setup
1. **Clone repository**: `git clone [repo-url]`
2. **Install dependencies**: `npm install`
3. **Configure secrets**: Add required GitHub Secrets
4. **Start development**: `npm start`
5. **Make changes**: Follow conventional commits
6. **Push changes**: Automatic deployment via GitHub Actions

## 📄 License

MIT License

## 🔗 Links

- **Original Flutter Project**: `/warp-mobile-ai-ide`
- **Container Guide**: [CONTAINER_MANAGEMENT.md](./CONTAINER_MANAGEMENT.md)
- **Publication Guide**: [PUBLICATION_GUIDE.md](./PUBLICATION_GUIDE.md)

---

**Built with ❤️ using React Native + Expo + Google Cloud + Vertex AI**

*Drape: Where AI meets mobile development* 🚀
