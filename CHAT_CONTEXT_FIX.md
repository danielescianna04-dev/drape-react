# FIX: AI Chat Context & Mode Selection

## PROBLEMA IDENTIFICATO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CURRENT FLOW (BROKEN)                              │
│                                                                              │
│   1. User creates project:                                                   │
│      "Crea un sito per un negozio di vape con prodotti e carrello"          │
│                                                                              │
│   2. Project is generated with generic React app                            │
│                                                                              │
│   3. User opens AI chat and asks: "il sito che hai creato di cosa è?"       │
│                                                                              │
│   4. AI reads App.jsx → sees generic counter app                            │
│      AI has NO IDEA about original description!                              │
│                                                                              │
│   ❌ CONTEXT LOST between project creation and AI chat                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## SOLUZIONE

### 1. Store Project Context in `.drape/project.json`

Quando il progetto viene creato, salvare i metadati:

```json
// .drape/project.json (created automatically)
{
  "name": "provaa-8-",
  "description": "Crea un sito per un negozio di vape con prodotti e carrello",
  "technology": "react",
  "createdAt": "2025-01-09T10:00:00Z",
  "createdBy": "user",
  "mode": "fast",
  "features": [
    "prodotti",
    "carrello"
  ],
  "industry": "vape-shop"
}
```

### 2. AI Chat System Prompt (Updated)

```javascript
// backend/routes/ai-chat.js

async function buildChatSystemPrompt(projectId, vmInfo) {
    // 1. Read project context
    let projectContext = null;
    try {
        const result = await flyService.exec(
            vmInfo.agentUrl,
            'cat /home/coder/project/.drape/project.json',
            '/home/coder/project',
            vmInfo.machineId
        );
        if (result.exitCode === 0) {
            projectContext = JSON.parse(result.stdout);
        }
    } catch (e) {
        // No context file - continue without it
    }

    // 2. Build system prompt WITH context
    let systemPrompt = `You are DRAPE AI, an intelligent coding assistant inside the Drape IDE.
You have access to the user's project files and can help with coding tasks.

## YOUR CAPABILITIES
- Read and understand the current project structure
- Write, edit, and create files
- Run shell commands (npm, git, etc.)
- Debug and fix errors
- Explain code
`;

    // 3. Add project context if available
    if (projectContext) {
        systemPrompt += `
## PROJECT CONTEXT
This project was created with the following requirements:

**Name:** ${projectContext.name}
**Description:** ${projectContext.description}
**Technology:** ${projectContext.technology}
**Industry:** ${projectContext.industry || 'general'}
**Created:** ${projectContext.createdAt}

The user originally requested: "${projectContext.description}"

When the user asks about "the site" or "the project", refer to these original requirements.
If the current code doesn't match these requirements, acknowledge this and offer to implement them.
`;
    }

    // 4. Add mode-specific instructions
    systemPrompt += `
## CURRENT MODE
You are operating in {MODE} mode.

### FAST MODE
- Execute immediately without asking for approval
- Create files, run commands, iterate quickly
- Fix errors as they occur
- Good for quick changes and prototypes

### PLANNED MODE
- First create a plan of what you'll do
- Wait for user approval before executing
- More thorough, careful approach
- Good for complex changes
`;

    return systemPrompt;
}
```

### 3. Frontend: Mode Selector in Chat Input

```tsx
// src/features/ai-chat/components/ChatInput.tsx

import React, { useState } from 'react';

interface Props {
    onSend: (message: string, mode: 'fast' | 'planned') => void;
    disabled?: boolean;
}

export const ChatInput: React.FC<Props> = ({ onSend, disabled }) => {
    const [message, setMessage] = useState('');
    const [mode, setMode] = useState<'fast' | 'planned'>('fast');

    const handleSend = () => {
        if (message.trim()) {
            onSend(message, mode);
            setMessage('');
        }
    };

    return (
        <div className="chat-input-container">
            {/* Mode Toggle */}
            <div className="mode-toggle">
                <button
                    className={`mode-btn ${mode === 'fast' ? 'active' : ''}`}
                    onClick={() => setMode('fast')}
                    title="Execute immediately"
                >
                    <span className="icon">⚡</span>
                    <span className="label">Fast</span>
                </button>
                <button
                    className={`mode-btn ${mode === 'planned' ? 'active' : ''}`}
                    onClick={() => setMode('planned')}
                    title="Plan first, then execute"
                >
                    <span className="icon">📋</span>
                    <span className="label">Planned</span>
                </button>
            </div>

            {/* Input Area */}
            <div className="input-area">
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={mode === 'fast'
                        ? "Chiedi qualcosa all'AI... (esecuzione immediata)"
                        : "Chiedi qualcosa all'AI... (prima il piano)"
                    }
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    disabled={disabled}
                />
                <button
                    className="send-btn"
                    onClick={handleSend}
                    disabled={disabled || !message.trim()}
                >
                    <SendIcon />
                </button>
            </div>
        </div>
    );
};
```

### 4. CSS for Mode Toggle

```css
/* src/features/ai-chat/components/ChatInput.css */

.chat-input-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: #1a1a1a;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.mode-toggle {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    width: fit-content;
}

.mode-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
}

.mode-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
}

.mode-btn.active {
    background: #00ff88;
    color: #000;
}

.mode-btn.active .icon {
    animation: none;
}

.mode-btn:not(.active):hover .icon {
    transform: scale(1.1);
}

.input-area {
    display: flex;
    gap: 8px;
    align-items: flex-end;
}

.input-area textarea {
    flex: 1;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #fff;
    font-size: 14px;
    resize: none;
    min-height: 44px;
    max-height: 120px;
}

.input-area textarea:focus {
    outline: none;
    border-color: #00ff88;
}

.send-btn {
    padding: 12px;
    background: #00ff88;
    border: none;
    border-radius: 8px;
    color: #000;
    cursor: pointer;
    transition: all 0.2s;
}

.send-btn:hover:not(:disabled) {
    background: #00cc6a;
    transform: scale(1.05);
}

.send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
```

### 5. Backend: Save Project Context on Creation

```javascript
// backend/routes/workstation.js (update generateProject)

async function generateProject(projectId, vmInfo, name, description, technology) {
    // ... existing code ...

    // AFTER project is generated, save context
    const projectContext = {
        name,
        description,
        technology,
        createdAt: new Date().toISOString(),
        industry: detectIndustry(description), // helper function
        originalPrompt: description
    };

    // Create .drape folder and save context
    await flyService.exec(
        vmInfo.agentUrl,
        `mkdir -p /home/coder/project/.drape && cat > /home/coder/project/.drape/project.json << 'EOF'
${JSON.stringify(projectContext, null, 2)}
EOF`,
        '/home/coder/project',
        vmInfo.machineId
    );

    // ... continue with existing code ...
}

// Helper to detect industry from description
function detectIndustry(description) {
    const lower = description.toLowerCase();

    if (lower.includes('vape') || lower.includes('smoke') || lower.includes('svapo')) {
        return 'vape-shop';
    }
    if (lower.includes('ristorante') || lower.includes('restaurant') || lower.includes('menu')) {
        return 'restaurant';
    }
    if (lower.includes('e-commerce') || lower.includes('shop') || lower.includes('negozio') || lower.includes('carrello')) {
        return 'e-commerce';
    }
    if (lower.includes('portfolio') || lower.includes('cv') || lower.includes('resume')) {
        return 'portfolio';
    }
    if (lower.includes('blog')) {
        return 'blog';
    }
    if (lower.includes('landing') || lower.includes('startup') || lower.includes('saas')) {
        return 'landing-page';
    }

    return 'general';
}
```

### 6. AI Chat Route Update

```javascript
// backend/routes/ai-chat.js

router.post('/chat', async (req, res) => {
    const { projectId, message, mode = 'fast', conversationHistory = [] } = req.body;

    try {
        // Get VM info
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);

        // Build system prompt with context
        const systemPrompt = await buildChatSystemPrompt(projectId, vmInfo, mode);

        // Build messages array
        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: message }
        ];

        // Get tools based on mode
        const tools = mode === 'planned'
            ? TOOLS_PLANNING  // read-only + create_plan
            : TOOLS_FAST;     // all tools

        // Call AI with tools
        const response = await aiProvider.chat(messages, {
            tools,
            model: 'gemini-2.5-flash'
        });

        // Handle response (tool calls, text, etc.)
        // ... existing logic ...

        res.json({
            response: response.text,
            toolCalls: response.toolCalls,
            mode
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

---

## FLOW CORRETTO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FIXED FLOW                                         │
│                                                                              │
│   1. User creates project:                                                   │
│      "Crea un sito per un negozio di vape con prodotti e carrello"          │
│                                                                              │
│   2. System saves to .drape/project.json:                                   │
│      {                                                                       │
│        "description": "Crea un sito per un negozio di vape...",             │
│        "industry": "vape-shop"                                              │
│      }                                                                       │
│                                                                              │
│   3. AI generates project with CONTEXT (vape shop, products, cart)          │
│                                                                              │
│   4. User opens AI chat                                                      │
│      → System reads .drape/project.json                                     │
│      → Injects context into system prompt                                    │
│                                                                              │
│   5. User asks: "il sito che hai creato di cosa è?"                         │
│      → AI KNOWS: "È un sito per un negozio di vape con prodotti e carrello" │
│                                                                              │
│   6. User can toggle ⚡ Fast / 📋 Planned mode in chat input                │
│                                                                              │
│   ✅ CONTEXT PRESERVED across entire workflow                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## FILES TO CREATE/MODIFY

### Create
- `.drape/project.json` (auto-generated per project)

### Modify
1. `backend/routes/workstation.js` - Save project context after generation
2. `backend/routes/ai-chat.js` - Read context, add mode parameter
3. `src/features/ai-chat/components/ChatInput.tsx` - Add mode toggle
4. `src/features/ai-chat/components/ChatInput.css` - Style mode toggle

---

## QUICK IMPLEMENTATION CHECKLIST

- [ ] Add `detectIndustry()` helper function
- [ ] Save `.drape/project.json` after project creation
- [ ] Update `buildChatSystemPrompt()` to read context
- [ ] Add mode parameter to chat API
- [ ] Create mode toggle UI in chat input
- [ ] Test: create project → chat → verify AI knows description
