# Drape Backend v2.0 - Complete Modular Architecture

A fully refactored, production-ready backend for the Drape AI IDE.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Development mode with auto-reload
npm run dev

# Run module tests
npm test

# Use legacy server (if needed)
npm run start:legacy
```

## 📁 Project Structure

```
backend/
├── server.js               # Main entry point (v2 modular)
├── server.legacy.js        # Original monolithic server (backup)
├── app.js                  # Express app configuration
│
├── routes/                 # API Endpoints (by domain)
│   ├── index.js           # Route aggregator & API info
│   ├── ai.js              # AI chat with streaming & tools
│   ├── github.js          # GitHub OAuth & API
│   ├── git.js             # Git operations on workspaces
│   ├── workstation.js     # File operations
│   ├── preview.js         # Dev server management
│   ├── terminal.js        # Command execution
│   ├── api.js             # Coder workstation CRUD
│   └── expo.js            # Expo web preview
│
├── services/              # Business Logic
│   ├── ai-providers/      # AI provider abstraction
│   │   ├── base.js        # Abstract base class
│   │   ├── gemini.js      # Google Gemini
│   │   ├── claude.js      # Anthropic Claude
│   │   ├── groq.js        # Groq (Llama)
│   │   └── index.js       # Factory pattern
│   ├── ai-inspect.js      # AI element inspector
│   ├── coder-service.js   # Coder API client
│   └── tool-executor.js   # Unified tool execution
│
├── middleware/            # Request Processing
│   ├── errorHandler.js    # Error handling & custom errors
│   ├── validator.js       # Input validation
│   ├── logger.js          # Request logging & WebSocket
│   └── coderProxy.js      # Coder reverse proxy
│
├── utils/                 # Helpers & Constants
│   ├── constants.js       # Configuration & environment
│   └── helpers.js         # Utility functions
│
└── coder-templates/       # Terraform templates
```

## 🔌 API Endpoints

### Health & Info
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| GET | `/` | API info & endpoint list |

### AI Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ai/models` | List available AI models |
| POST | `/ai/chat` | AI chat with streaming (SSE) |
| POST | `/ai/analyze` | Quick code analysis |

### GitHub OAuth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/github/device-code` | Start device flow |
| POST | `/github/token` | Exchange code for token |
| GET | `/github/user` | Get authenticated user |
| GET | `/github/repos` | List user repositories |

### Git Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/git/status/:id` | Repository status |
| GET | `/git/branches/:id` | List branches |
| POST | `/git/pull/:id` | Pull from remote |
| POST | `/git/push/:id` | Push to remote |
| POST | `/git/commit/:id` | Create commit |
| POST | `/git/checkout/:id` | Switch branch |
| POST | `/git/stash/:id` | Stash operations |

### File Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workstation/:id/files` | List project files |
| POST | `/workstation/read-file` | Read file content |
| POST | `/workstation/write-file` | Write file content |
| POST | `/workstation/edit-file` | Edit file (search/replace) |
| POST | `/workstation/glob-files` | Find files by pattern |
| POST | `/workstation/search-files` | Search content (grep) |
| POST | `/workstation/execute-command` | Run shell command |

### Preview & Terminal
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/preview/start` | Start preview workspace |
| POST | `/preview/inspect` | AI element inspection (SSE) |
| GET | `/preview/logs/:id` | Stream server logs (SSE) |
| POST | `/preview/env` | Save environment variables |
| POST | `/terminal/execute` | Execute command |
| POST | `/terminal/kill` | Kill process |
| GET | `/expo-preview/:port` | Expo web wrapper |

### Workstation Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workstations` | List all workstations |
| POST | `/api/workstations` | Create workstation |
| GET | `/api/workstations/:id` | Get workstation details |
| POST | `/api/workstations/:id/start` | Start workstation |
| POST | `/api/workstations/:id/stop` | Stop workstation |
| DELETE | `/api/workstations/:id` | Delete workstation |
| GET | `/api/templates` | List Coder templates |
| GET | `/api/health` | Coder connection health |

## 🤖 AI Providers

The server supports multiple AI providers through a unified interface:

| Provider | Models | Tools | Streaming |
|----------|--------|-------|-----------|
| **Gemini** | gemini-2.5-flash, gemini-exp-1206 | ✅ | ✅ |
| **Claude** | claude-3.5-sonnet, claude-3.5-haiku | ✅ | ✅ |
| **Groq** | llama-3.3-70b, llama-3.1-8b | ✅ | ✅ |

### Adding a New Provider

1. Create `services/ai-providers/newprovider.js`:
```javascript
const BaseAIProvider = require('./base');

class NewProvider extends BaseAIProvider {
  constructor() {
    super();
    this.name = 'newprovider';
    this.supportsTools = true;
  }
  
  isAvailable() {
    return !!process.env.NEW_API_KEY;
  }
  
  async chat(messages, options) { /* ... */ }
  async *chatStream(messages, options) { /* ... */ }
}

module.exports = NewProvider;
```

2. Register in `services/ai-providers/index.js`

## 🔧 Configuration

Environment variables (`.env`):

```env
# Server
PORT=3000

# Coder (Cloud Workstations)
CODER_API_URL=http://your-coder-url
CODER_SESSION_TOKEN=your-session-token
CODER_WILDCARD_DOMAIN=your.domain

# AI Providers (at least one required)
GEMINI_API_KEY=your-gemini-key
CLAUDE_API_KEY=your-claude-key
GROQ_API_KEY=your-groq-key

# Google Cloud (optional)
GOOGLE_CLOUD_PROJECT=your-project

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

## 📊 Improvements Over Legacy

| Aspect | Legacy | v2 Modular |
|--------|--------|------------|
| Lines of code | 7,933 | ~150 (entry) + modular |
| Files | 1 monolith | 20+ focused modules |
| Error handling | Inconsistent | Centralized middleware |
| Input validation | Ad-hoc | Reusable middleware |
| AI providers | Inline logic | Abstract factory pattern |
| Tool execution | Duplicated | Unified service |
| Testing | Difficult | Easy (isolated modules) |
| Maintainability | Low | High |

## 🧪 Testing

```bash
# Quick module load test
npm test

# Manual health check
curl http://localhost:3000/health

# Test AI chat
curl -X POST http://localhost:3000/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello!", "selectedModel": "gemini-2.5-flash"}'
```

## 📝 Development

### Adding a Route

1. Create `routes/newroute.js`:
```javascript
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

router.get('/example', asyncHandler(async (req, res) => {
  res.json({ success: true });
}));

module.exports = router;
```

2. Register in `routes/index.js`:
```javascript
const newRoutes = require('./newroute');
router.use('/new', newRoutes);
```

### Custom Validation

```javascript
const { validateBody, schema } = require('../middleware/validator');

router.post('/example',
  validateBody({
    name: schema().required().string().minLength(1),
    count: schema().number()
  }),
  asyncHandler(async (req, res) => {
    // req.body is validated
  })
);
```

## 🚀 Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Cloud Run

```bash
gcloud run deploy drape-backend \
  --source . \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY"
```

## 📄 License

MIT
