# DRAPE AI - Specifica Tecnica Completa Unificata

> Documento unificato che copre: Agent Loop, Tool System, Fast/Planning Mode, Context Persistence, Chat UI

---

## INDICE

1. [Filosofia Fondamentale](#filosofia-fondamentale)
2. [Architettura Agent Loop](#parte-1-architettura)
3. [Tool Schema](#parte-2-tool-schema)
4. [System Prompts](#parte-3-system-prompt)
5. [Context Persistence](#parte-4-context-persistence)
6. [Fast vs Planning Mode](#parte-5-fast-vs-planning-mode)
7. [Backend Implementation](#parte-6-backend-implementation)
8. [Frontend Components](#parte-7-frontend-components)
9. [API Routes](#parte-8-api-routes)
10. [Safety & Limits](#parte-9-safety-limits)

---

## Filosofia Fondamentale

```javascript
while (iteration < maxIterations && !completionSignal) {
    result = await executeAgentStep(prompt, context, tools);
    context.append(result);
    if (result.contains(COMPLETION_PROMISE)) break;
    iteration++;
}
```

### Principi Chiave

| Principio | Descrizione |
|-----------|-------------|
| **Iteration > Perfection** | Non puntare alla perfezione al primo tentativo. Lascia che il loop raffini il lavoro. |
| **Failures Are Data** | Gli errori sono prevedibili e informativi. Ogni fallimento insegna cosa correggere. |
| **Context is King** | L'AI deve sempre conoscere il contesto del progetto (descrizione originale, industry, etc.) |
| **Persistence Wins** | Continua finché non hai successo. Il loop gestisce automaticamente i retry. |
| **Clear Completion Criteria** | Ogni task deve avere un segnale esplicito di completamento. |

---

## PARTE 1: ARCHITETTURA

### 1.1 Core Loop Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AGENT LOOP ENGINE                             │
│                                                                         │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐  │
│   │   PROMPT    │────▶│    LLM      │────▶│   RESPONSE PARSER       │  │
│   │  + CONTEXT  │     │  (Gemini/   │     │   - Text extraction     │  │
│   │  + TOOLS    │     │   Claude)   │     │   - Tool call detection │  │
│   └─────────────┘     └─────────────┘     │   - Completion check    │  │
│         ▲                                  └───────────┬─────────────┘  │
│         │                                              │                │
│         │         ┌────────────────────────────────────┘                │
│         │         │                                                     │
│         │         ▼                                                     │
│         │   ┌─────────────────┐     ┌─────────────────────────────┐    │
│         │   │  HAS TOOL CALL? │────▶│     TOOL EXECUTOR           │    │
│         │   └────────┬────────┘ YES │  - write_file               │    │
│         │            │              │  - read_file                │    │
│         │            │ NO           │  - run_command              │    │
│         │            ▼              │  - edit_file                │    │
│         │   ┌─────────────────┐     │  - list_directory           │    │
│         │   │ HAS COMPLETION  │     └───────────┬─────────────────┘    │
│         │   │    PROMISE?     │                 │                      │
│         │   └────────┬────────┘                 │                      │
│         │            │                          │                      │
│         │      YES   │   NO                     │                      │
│         │            ▼                          ▼                      │
│         │   ┌─────────────┐           ┌─────────────────┐             │
│         │   │    EXIT     │           │  APPEND RESULT  │             │
│         │   │   LOOP      │           │   TO CONTEXT    │             │
│         │   │  (SUCCESS)  │           └────────┬────────┘             │
│         │   └─────────────┘                    │                      │
│         │                                      │                      │
│         └──────────────────────────────────────┘                      │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ SAFETY: iteration++ → if (iteration >= MAX_ITERATIONS) EXIT     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow con Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE DATA FLOW                               │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 1. PROJECT CREATION                                                 │ │
│  │    User: "Crea un sito per negozio vape con prodotti e carrello"   │ │
│  │                              │                                      │ │
│  │                              ▼                                      │ │
│  │    ┌─────────────────────────────────────────────────────────────┐ │ │
│  │    │ SAVE CONTEXT → .drape/project.json                          │ │ │
│  │    │ {                                                            │ │ │
│  │    │   "description": "sito per negozio vape...",                │ │ │
│  │    │   "industry": "vape-shop",                                   │ │ │
│  │    │   "technology": "react"                                      │ │ │
│  │    │ }                                                            │ │ │
│  │    └─────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 2. AGENT GENERATES PROJECT                                          │ │
│  │                                                                     │ │
│  │    ITERATION 1: Create package.json                                │ │
│  │    ITERATION 2: Create vite.config.js                              │ │
│  │    ITERATION 3: Create components (with VAPE SHOP content!)        │ │
│  │    ...                                                              │ │
│  │    ITERATION N: signal_completion                                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 3. USER OPENS AI CHAT                                               │ │
│  │                                                                     │ │
│  │    System reads .drape/project.json                                │ │
│  │    → Injects context into system prompt                            │ │
│  │                                                                     │ │
│  │    User: "il sito che hai creato di cosa è?"                       │ │
│  │    AI: "È un sito per un negozio di vape con prodotti e carrello"  │ │
│  │         ✅ AI KNOWS THE CONTEXT!                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## PARTE 2: TOOL SCHEMA

### 2.1 Tool Definitions (JSON Schema)

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "write_file",
        "description": "Create or overwrite a file. Content must be complete, not a diff.",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Relative path from project root. Example: 'src/components/Header.jsx'"
            },
            "content": {
              "type": "string",
              "description": "Complete file content to write."
            }
          },
          "required": ["path", "content"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read file contents. Use before editing to understand current state.",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Relative path to read."
            }
          },
          "required": ["path"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "list_directory",
        "description": "List files and folders in a directory.",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Directory path. Use '.' for project root."
            }
          },
          "required": ["path"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "run_command",
        "description": "Execute shell command. Use for: npm install, npm run build, git, etc.",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string",
              "description": "Command to execute."
            },
            "timeout_ms": {
              "type": "number",
              "description": "Timeout in ms. Default: 60000. Use 180000 for npm install."
            }
          },
          "required": ["command"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "edit_file",
        "description": "Replace specific text in a file. Target must be unique.",
        "parameters": {
          "type": "object",
          "properties": {
            "path": { "type": "string" },
            "search": { "type": "string", "description": "Exact text to find (must be unique)." },
            "replace": { "type": "string", "description": "Text to replace with." }
          },
          "required": ["path", "search", "replace"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "signal_completion",
        "description": "Signal task is complete. MUST be called when done.",
        "parameters": {
          "type": "object",
          "properties": {
            "summary": { "type": "string" },
            "files_created": { "type": "array", "items": { "type": "string" } },
            "files_modified": { "type": "array", "items": { "type": "string" } },
            "commands_run": { "type": "array", "items": { "type": "string" } },
            "verification": { "type": "string", "description": "How to verify (e.g., 'npm run dev')" }
          },
          "required": ["summary", "files_created"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "create_plan",
        "description": "Create implementation plan. Only available in PLANNING mode.",
        "parameters": {
          "type": "object",
          "properties": {
            "plan_content": { "type": "string", "description": "Complete markdown for PLAN.md" },
            "estimated_iterations": { "type": "number" },
            "key_files": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["plan_content", "estimated_iterations", "key_files"]
        }
      }
    }
  ]
}
```

### 2.2 Tools by Mode

| Tool | FAST Mode | PLANNING Mode | EXECUTING Mode |
|------|-----------|---------------|----------------|
| `write_file` | ✅ | ❌ | ✅ |
| `read_file` | ✅ | ✅ | ✅ |
| `list_directory` | ✅ | ✅ | ✅ |
| `run_command` | ✅ | ❌ | ✅ |
| `edit_file` | ✅ | ❌ | ✅ |
| `signal_completion` | ✅ | ❌ | ✅ |
| `create_plan` | ❌ | ✅ | ❌ |

---

## PARTE 3: SYSTEM PROMPT

### 3.1 Dynamic System Prompt Builder

```javascript
/**
 * Build system prompt based on mode and project context
 * @param {string} mode - 'fast' | 'planning' | 'executing'
 * @param {object} projectContext - From .drape/project.json
 * @param {object} additionalContext - Plan content, etc.
 */
function buildSystemPrompt(mode = 'fast', projectContext = null, additionalContext = {}) {

    // === BASE PROMPT ===
    let prompt = `You are DRAPE AI, an autonomous software development agent.
You operate inside a Linux VM with direct filesystem and terminal access.

## YOUR CAPABILITIES
- Write, read, and edit files
- Execute shell commands (npm, git, etc.)
- Create complete projects from scratch
- Debug and fix errors iteratively
`;

    // === PROJECT CONTEXT (CRITICAL!) ===
    if (projectContext) {
        prompt += `
## PROJECT CONTEXT
This project was created with the following requirements:

**Name:** ${projectContext.name || 'Unnamed'}
**Original Description:** "${projectContext.description}"
**Technology:** ${projectContext.technology || 'react'}
**Industry:** ${projectContext.industry || 'general'}
**Created:** ${projectContext.createdAt || 'Unknown'}

IMPORTANT: When the user asks about "the site", "the project", or what you created,
refer to these original requirements. The user asked for: "${projectContext.description}"
`;
    }

    // === MODE-SPECIFIC PROMPTS ===
    if (mode === 'fast') {
        prompt += `
## MODE: FAST EXECUTION
Move fast and iterate. Execute immediately, fix errors as they occur.

## TOOLS AVAILABLE
- write_file: Create/overwrite files
- read_file: Read file contents
- list_directory: Explore structure
- run_command: Execute shell commands
- edit_file: Modify files
- signal_completion: Signal done (REQUIRED at end)

## APPROACH
1. Understand the request
2. Start creating files immediately
3. If errors occur, read them, fix, retry
4. Continue until complete
5. Call signal_completion

## CONTENT RULES
- NO placeholders ("Product 1", "Lorem ipsum")
- Use realistic, industry-specific content
- Professional UI design

Never end without signal_completion.`;
    }

    if (mode === 'planning') {
        prompt += `
## MODE: PLANNING (Phase A)
Create a detailed implementation plan WITHOUT executing anything.

## TOOLS AVAILABLE (READ-ONLY)
- read_file: Examine existing files
- list_directory: Explore project structure
- create_plan: Write the implementation plan (REQUIRED)

## TOOLS NOT AVAILABLE
❌ write_file - Not allowed in planning mode
❌ run_command - Not allowed in planning mode
❌ edit_file - Not allowed in planning mode

## YOUR TASK
1. Analyze the user's request thoroughly
2. Explore existing project structure if any
3. Design the implementation approach
4. Create a detailed PLAN.md using create_plan tool

## PLAN REQUIREMENTS
- Clear file structure
- Step-by-step implementation order
- All dependencies listed
- Estimated iterations
- Potential risks identified

Call create_plan when ready. User will review before execution.`;
    }

    if (mode === 'executing') {
        prompt += `
## MODE: EXECUTING (Phase B)
Follow the approved plan step by step.

## THE APPROVED PLAN
\`\`\`markdown
${additionalContext.planContent || 'No plan provided'}
\`\`\`

## TOOLS AVAILABLE (FULL ACCESS)
- write_file, read_file, edit_file, run_command, list_directory
- signal_completion (REQUIRED at end)

## YOUR TASK
1. Read the plan above
2. Execute each step in order
3. Handle any errors that occur
4. Call signal_completion when ALL steps are done

Follow the plan exactly unless blocked by errors.
Never end without signal_completion.`;
    }

    // === CONTENT GENERATION RULES ===
    prompt += `

## CONTENT GENERATION RULES

### CRITICAL: No Placeholders
❌ NEVER use:
- "Product 1", "Product 2", "Item 1"
- "Lorem ipsum"
- "Description here", "Your text"
- "Company Name", "Your Company"

✅ ALWAYS use:
- Real product names for the industry
- Realistic descriptions
- Actual prices (€XX.XX)
- Genuine content

### Industry-Specific Content

**VAPE/SMOKE SHOP:**
- Products: "Elf Bar BC5000", "SMOK Nord 5", "Vaporesso XROS 3"
- Categories: "Dispositivi", "Liquidi", "Accessori", "Pod Mod"
- Design: Dark (#0d0d0d), Neon accents (#00ff88, #ff00ff)

**RESTAURANT:**
- Menu items with real names, descriptions, prices
- Categories: "Antipasti", "Primi", "Secondi", "Dolci"
- Design: Warm (#1a1a1a), Gold/Orange accents

**E-COMMERCE:**
- Real product categories and items
- Filters, sorting, cart functionality
- Design: Clean, professional

**PORTFOLIO:**
- Realistic project names and descriptions
- Technologies, outcomes
- Design: Creative, personal

## PROJECT STRUCTURE (React + Vite)

\`\`\`
/
├── index.html           # Root HTML (NOT in public/)
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── index.css
    ├── components/
    └── pages/
\`\`\`

## ERROR HANDLING
When errors occur:
1. Read the error message
2. Diagnose the cause
3. Fix the issue
4. Retry
5. If same error 3 times → try different approach
`;

    return prompt;
}
```

---

## PARTE 4: CONTEXT PERSISTENCE

### 4.1 Project Context Schema

```javascript
// .drape/project.json - Created when project is generated
{
    "name": "vape-shop-website",
    "description": "Crea un sito per un negozio di vape con prodotti e carrello",
    "technology": "react",
    "industry": "vape-shop",
    "createdAt": "2025-01-09T10:00:00Z",
    "features": ["products", "cart", "responsive"],
    "originalPrompt": "Crea un sito per un negozio di vape con prodotti e carrello"
}
```

### 4.2 Industry Detection Helper

```javascript
// backend/utils/industry-detector.js

function detectIndustry(description) {
    const lower = description.toLowerCase();

    const patterns = {
        'vape-shop': ['vape', 'vaping', 'svapo', 'sigaretta elettronica', 'e-cig', 'smoke shop'],
        'restaurant': ['ristorante', 'restaurant', 'menu', 'pizzeria', 'trattoria', 'bar'],
        'e-commerce': ['e-commerce', 'shop', 'negozio', 'store', 'carrello', 'prodotti'],
        'portfolio': ['portfolio', 'cv', 'resume', 'personal', 'freelancer'],
        'blog': ['blog', 'articoli', 'posts', 'magazine'],
        'landing-page': ['landing', 'startup', 'saas', 'app', 'servizio'],
        'agency': ['agenzia', 'agency', 'studio', 'creative'],
        'fitness': ['gym', 'fitness', 'palestra', 'workout', 'training'],
        'real-estate': ['immobiliare', 'real estate', 'case', 'appartamenti', 'affitto']
    };

    for (const [industry, keywords] of Object.entries(patterns)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return industry;
        }
    }

    return 'general';
}

module.exports = { detectIndustry };
```

### 4.3 Save Context on Project Creation

```javascript
// In backend/routes/workstation.js - After project generation

async function saveProjectContext(vmInfo, projectData) {
    const { detectIndustry } = require('../utils/industry-detector');

    const context = {
        name: projectData.name,
        description: projectData.description,
        technology: projectData.technology || 'react',
        industry: detectIndustry(projectData.description),
        createdAt: new Date().toISOString(),
        originalPrompt: projectData.description,
        features: extractFeatures(projectData.description)
    };

    // Create .drape folder and save context
    const cmd = `mkdir -p /home/coder/project/.drape && cat > /home/coder/project/.drape/project.json << 'EOF'
${JSON.stringify(context, null, 2)}
EOF`;

    await flyService.exec(
        vmInfo.agentUrl,
        cmd,
        '/home/coder/project',
        vmInfo.machineId,
        10000
    );

    return context;
}

function extractFeatures(description) {
    const lower = description.toLowerCase();
    const features = [];

    if (lower.includes('carrello') || lower.includes('cart')) features.push('cart');
    if (lower.includes('prodott') || lower.includes('product')) features.push('products');
    if (lower.includes('login') || lower.includes('auth')) features.push('authentication');
    if (lower.includes('pagament') || lower.includes('payment')) features.push('payments');
    if (lower.includes('blog') || lower.includes('articol')) features.push('blog');
    if (lower.includes('contact') || lower.includes('contatt')) features.push('contact-form');

    return features;
}
```

### 4.4 Load Context for AI Chat

```javascript
// backend/routes/ai-chat.js

async function loadProjectContext(vmInfo) {
    try {
        const result = await flyService.exec(
            vmInfo.agentUrl,
            'cat /home/coder/project/.drape/project.json',
            '/home/coder/project',
            vmInfo.machineId,
            5000
        );

        if (result.exitCode === 0 && result.stdout) {
            return JSON.parse(result.stdout);
        }
    } catch (e) {
        console.log('No project context found');
    }
    return null;
}
```

---

## PARTE 5: FAST VS PLANNING MODE

### 5.1 Mode Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MODE SELECTION                                  │
│                                                                              │
│   ┌─────────────────────────────────┐   ┌──────────────────────────────────┐│
│   │          FAST MODE              │   │         PLANNING MODE            ││
│   │                                 │   │                                  ││
│   │  • Default for simple tasks     │   │  • Complex multi-step projects   ││
│   │  • Immediate execution          │   │  • Two-phase approach            ││
│   │  • Move fast, iterate           │   │  • User approval required        ││
│   │  • Good for quick prototypes    │   │  • Professional methodology      ││
│   │                                 │   │                                  ││
│   │  User → AI → Execute → Done     │   │  User → Plan → Approve → Execute ││
│   └─────────────────────────────────┘   └──────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 When to Use Each Mode

| Scenario | Mode | Reason |
|----------|------|--------|
| "Crea una landing page" | FAST | Simple, clear |
| "Crea e-commerce con 10 pagine" | PLANNING | Complex, needs architecture |
| "Aggiungi un bottone" | FAST | Single file change |
| "Refactor authentication" | PLANNING | Multi-file, breaking changes |
| "Fix CSS bug" | FAST | Quick fix |
| "Integra pagamenti Stripe" | PLANNING | Critical, needs review |

### 5.3 FAST MODE Flow

```
User Request → AI Analyzes → Executes Immediately → Iterates on Errors → Done
```

- All tools available
- No approval needed
- Self-corrects on errors
- Good for prototypes

### 5.4 PLANNING MODE Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         PLANNING MODE FLOW                                │
│                                                                          │
│  PHASE A: PLANNER                                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  User Request → AI Plans → Creates PLAN.md → PAUSE                 │ │
│  │                                                                     │ │
│  │  Tools: read_file, list_directory, create_plan (ONLY)              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    USER REVIEWS PLAN                                │ │
│  │                                                                     │ │
│  │   [✅ Approve]    [✏️ Edit]    [🔄 Re-plan]    [❌ Cancel]         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼ (if approved)                             │
│  PHASE B: EXECUTOR                                                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  AI Follows Plan → Step by Step → All Tools Available → Done       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.5 PLAN.md Template

```markdown
# Implementation Plan: {PROJECT_NAME}

## Overview
{Brief description}

## Architecture Decisions
- Framework: {choice}
- Styling: {approach}
- State Management: {if any}

## File Structure
```
/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── components/
    └── pages/
```

## Implementation Steps

### Step 1: Project Setup
- [ ] Create package.json
- [ ] Create vite.config.js
- [ ] Create index.html

### Step 2: Core Structure
- [ ] Create src/main.jsx
- [ ] Create src/App.jsx
- [ ] Create base styles

### Step 3: Components
- [ ] Header
- [ ] Footer
- [ ] Navigation

### Step 4: Pages
- [ ] Home
- [ ] Other pages

### Step 5: Testing
- [ ] npm install
- [ ] npm run dev
- [ ] Verify all routes

## Dependencies
```json
{
  "react": "^18.x",
  "react-dom": "^18.x",
  "react-router-dom": "^6.x"
}
```

## Estimated Iterations: ~{N}

## Risks
1. {Risk} → {Mitigation}

---
*Requires user approval before execution.*
```

---

## PARTE 6: BACKEND IMPLEMENTATION

### 6.1 Agent Loop Engine

```javascript
// backend/services/agent-loop.js

const EventEmitter = require('events');
const flyService = require('./fly-service');

const MAX_ITERATIONS = 50;
const MAX_SAME_ERROR_RETRIES = 3;
const COMPLETION_SIGNAL = '<completion>TASK_COMPLETE</completion>';

class AgentLoop extends EventEmitter {
    constructor() {
        super();
        this.mode = 'fast';
        this.planContent = null;
        this.projectContext = null;
    }

    /**
     * Run in FAST mode
     */
    async runFast(prompt, projectId, vmInfo, options = {}) {
        return this._run(prompt, projectId, vmInfo, { ...options, mode: 'fast' });
    }

    /**
     * Run in PLANNING mode - Phase A
     */
    async runPlanning(prompt, projectId, vmInfo, options = {}) {
        const result = await this._run(prompt, projectId, vmInfo, {
            ...options,
            mode: 'planning',
            maxIterations: 10
        });

        return {
            ...result,
            planContent: this.planContent,
            requiresApproval: true
        };
    }

    /**
     * Run in EXECUTING mode - Phase B
     */
    async runExecuting(planContent, projectId, vmInfo, options = {}) {
        this.planContent = planContent;
        return this._run(
            'Execute the approved plan.',
            projectId,
            vmInfo,
            {
                ...options,
                mode: 'executing',
                additionalContext: { planContent }
            }
        );
    }

    /**
     * Main loop implementation
     */
    async _run(prompt, projectId, vmInfo, options = {}) {
        const {
            mode = 'fast',
            model = 'gemini-2.5-flash',
            maxIterations = MAX_ITERATIONS,
            additionalContext = {},
            onProgress
        } = options;

        this.mode = mode;

        // Load project context
        this.projectContext = await this._loadProjectContext(vmInfo);

        // Get tools for mode
        const tools = this._getToolsForMode(mode);

        // Build system prompt
        const systemPrompt = this._buildSystemPrompt(mode, this.projectContext, additionalContext);

        // Initialize messages
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];

        // State
        const state = {
            iteration: 0,
            filesCreated: [],
            filesModified: [],
            commandsRun: [],
            lastError: null,
            sameErrorCount: 0,
            completed: false
        };

        this._emit(onProgress, 'start', { mode, message: `Starting in ${mode} mode...` });

        // === THE LOOP ===
        while (state.iteration < maxIterations && !state.completed) {
            state.iteration++;

            this._emit(onProgress, 'iteration_start', {
                iteration: state.iteration,
                maxIterations
            });

            try {
                // 1. Call LLM
                this._emit(onProgress, 'thinking', { iteration: state.iteration });
                const response = await this._callLLM(model, messages, tools);

                // 2. Process response
                if (response.toolCalls && response.toolCalls.length > 0) {
                    for (const toolCall of response.toolCalls) {
                        const result = await this._executeTool(toolCall, vmInfo, state, onProgress);

                        // Add to messages
                        messages.push({
                            role: 'assistant',
                            content: [{ type: 'tool_use', id: toolCall.id, name: toolCall.name, input: toolCall.input }]
                        });
                        messages.push({
                            role: 'user',
                            content: [{ type: 'tool_result', tool_use_id: toolCall.id, content: result }]
                        });

                        // Check completion
                        if (toolCall.name === 'signal_completion') {
                            state.completed = true;
                            this._emit(onProgress, 'complete', {
                                iteration: state.iteration,
                                summary: toolCall.input.summary,
                                filesCreated: state.filesCreated
                            });
                            break;
                        }

                        // Check plan created
                        if (toolCall.name === 'create_plan') {
                            this.planContent = toolCall.input.plan_content;
                            state.completed = true;
                            this._emit(onProgress, 'plan_created', {
                                planContent: this.planContent,
                                estimatedIterations: toolCall.input.estimated_iterations
                            });
                            break;
                        }

                        // Track errors
                        if (result.startsWith('ERROR:')) {
                            if (result === state.lastError) {
                                state.sameErrorCount++;
                                if (state.sameErrorCount >= MAX_SAME_ERROR_RETRIES) {
                                    messages.push({
                                        role: 'user',
                                        content: `[SYSTEM] Same error ${MAX_SAME_ERROR_RETRIES} times. Try different approach.`
                                    });
                                    state.sameErrorCount = 0;
                                }
                            } else {
                                state.lastError = result;
                                state.sameErrorCount = 1;
                            }
                        } else {
                            state.lastError = null;
                            state.sameErrorCount = 0;
                        }
                    }
                } else if (response.text) {
                    messages.push({ role: 'assistant', content: response.text });
                    if (response.text.includes(COMPLETION_SIGNAL)) {
                        state.completed = true;
                    }
                }

            } catch (error) {
                this._emit(onProgress, 'error', { iteration: state.iteration, error: error.message });
                messages.push({ role: 'user', content: `[SYSTEM ERROR] ${error.message}. Recover and continue.` });
            }
        }

        if (!state.completed) {
            this._emit(onProgress, 'max_iterations', { iteration: state.iteration });
        }

        return {
            completed: state.completed,
            iterations: state.iteration,
            filesCreated: state.filesCreated,
            filesModified: state.filesModified,
            commandsRun: state.commandsRun,
            planContent: this.planContent
        };
    }

    _getToolsForMode(mode) {
        const allTools = require('./agent-tools.json').tools;

        if (mode === 'planning') {
            return allTools.filter(t =>
                ['read_file', 'list_directory', 'create_plan'].includes(t.function.name)
            );
        }

        // fast and executing modes get all except create_plan
        return allTools.filter(t => t.function.name !== 'create_plan');
    }

    async _loadProjectContext(vmInfo) {
        try {
            const result = await flyService.exec(
                vmInfo.agentUrl,
                'cat /home/coder/project/.drape/project.json',
                '/home/coder/project',
                vmInfo.machineId,
                5000
            );
            if (result.exitCode === 0) {
                return JSON.parse(result.stdout);
            }
        } catch (e) {}
        return null;
    }

    _buildSystemPrompt(mode, projectContext, additionalContext) {
        // Use the buildSystemPrompt function from Part 3
        return buildSystemPrompt(mode, projectContext, additionalContext);
    }

    async _callLLM(model, messages, tools) {
        // Implementation using Gemini/Claude
        const { getProviderForModel } = require('./ai-providers');
        const { provider, modelId } = getProviderForModel(model);

        return await provider.chat(messages, {
            model: modelId,
            tools: tools.map(t => ({
                name: t.function.name,
                description: t.function.description,
                input_schema: t.function.parameters
            })),
            maxTokens: 8192,
            temperature: 0.7
        });
    }

    async _executeTool(toolCall, vmInfo, state, onProgress) {
        const { name, input } = toolCall;
        const { agentUrl, machineId } = vmInfo;

        this._emit(onProgress, 'tool_start', { tool: name, input: this._summarizeInput(name, input) });

        let result;
        try {
            switch (name) {
                case 'write_file':
                    result = await this._writeFile(agentUrl, machineId, input.path, input.content);
                    state.filesCreated.push(input.path);
                    break;
                case 'read_file':
                    result = await this._readFile(agentUrl, machineId, input.path);
                    break;
                case 'list_directory':
                    result = await this._listDir(agentUrl, machineId, input.path || '.');
                    break;
                case 'run_command':
                    result = await this._runCmd(agentUrl, machineId, input.command, input.timeout_ms);
                    state.commandsRun.push(input.command);
                    break;
                case 'edit_file':
                    result = await this._editFile(agentUrl, machineId, input.path, input.search, input.replace);
                    state.filesModified.push(input.path);
                    break;
                case 'signal_completion':
                    result = `${COMPLETION_SIGNAL}\n${JSON.stringify(input)}`;
                    break;
                case 'create_plan':
                    result = `Plan created with ${input.estimated_iterations} estimated iterations.`;
                    break;
                default:
                    result = `ERROR: Unknown tool '${name}'`;
            }
            this._emit(onProgress, 'tool_complete', { tool: name, success: !result.startsWith('ERROR') });
        } catch (error) {
            result = `ERROR: ${error.message}`;
            this._emit(onProgress, 'tool_error', { tool: name, error: error.message });
        }

        return result;
    }

    // Tool implementations...
    async _writeFile(agentUrl, machineId, path, content) {
        const cmd = `mkdir -p "$(dirname "/home/coder/project/${path}")" && cat > "/home/coder/project/${path}" << 'DRAPE_EOF'\n${content}\nDRAPE_EOF`;
        const result = await flyService.exec(agentUrl, cmd, '/home/coder/project', machineId, 30000);
        return result.exitCode === 0 ? `SUCCESS: Written ${path}` : `ERROR: ${result.stderr}`;
    }

    async _readFile(agentUrl, machineId, path) {
        const result = await flyService.exec(agentUrl, `cat "/home/coder/project/${path}"`, '/home/coder/project', machineId, 10000);
        return result.exitCode === 0 ? result.stdout : `ERROR: ${result.stderr}`;
    }

    async _listDir(agentUrl, machineId, path) {
        const fullPath = path === '.' ? '/home/coder/project' : `/home/coder/project/${path}`;
        const result = await flyService.exec(agentUrl, `ls -la "${fullPath}"`, '/home/coder/project', machineId, 10000);
        return result.exitCode === 0 ? result.stdout : `ERROR: ${result.stderr}`;
    }

    async _runCmd(agentUrl, machineId, command, timeout = 60000) {
        const result = await flyService.exec(agentUrl, command, '/home/coder/project', machineId, timeout);
        const output = `Exit: ${result.exitCode}\n${result.stdout}\n${result.stderr}`;
        return result.exitCode === 0 ? `SUCCESS:\n${output}` : `ERROR:\n${output}`;
    }

    async _editFile(agentUrl, machineId, path, search, replace) {
        const current = await this._readFile(agentUrl, machineId, path);
        if (current.startsWith('ERROR:')) return current;
        if (!current.includes(search)) return `ERROR: Search string not found in ${path}`;
        return await this._writeFile(agentUrl, machineId, path, current.replace(search, replace));
    }

    _summarizeInput(tool, input) {
        switch (tool) {
            case 'write_file': return { path: input.path, bytes: input.content?.length || 0 };
            case 'run_command': return { command: input.command };
            default: return { path: input.path };
        }
    }

    _emit(callback, type, data) {
        const event = { type, timestamp: Date.now(), ...data };
        this.emit('progress', event);
        if (callback) callback(event);
    }
}

module.exports = new AgentLoop();
```

---

## PARTE 7: FRONTEND COMPONENTS

### 7.1 Chat Input con Mode Toggle

```tsx
// src/features/ai-chat/components/ChatInput.tsx

import React, { useState } from 'react';
import './ChatInput.css';

interface Props {
    onSend: (message: string, mode: 'fast' | 'planning') => void;
    disabled?: boolean;
}

export const ChatInput: React.FC<Props> = ({ onSend, disabled }) => {
    const [message, setMessage] = useState('');
    const [mode, setMode] = useState<'fast' | 'planning'>('fast');

    const handleSend = () => {
        if (message.trim()) {
            onSend(message.trim(), mode);
            setMessage('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chat-input-container">
            {/* Mode Toggle */}
            <div className="mode-toggle">
                <button
                    className={`mode-btn ${mode === 'fast' ? 'active' : ''}`}
                    onClick={() => setMode('fast')}
                    disabled={disabled}
                    title="Esecuzione immediata"
                >
                    <span className="icon">⚡</span>
                    <span className="label">Fast</span>
                </button>
                <button
                    className={`mode-btn ${mode === 'planning' ? 'active' : ''}`}
                    onClick={() => setMode('planning')}
                    disabled={disabled}
                    title="Prima pianifica, poi esegue"
                >
                    <span className="icon">📋</span>
                    <span className="label">Planned</span>
                </button>
            </div>

            {/* Input */}
            <div className="input-row">
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        mode === 'fast'
                            ? "Chiedi qualcosa all'AI... (esecuzione immediata)"
                            : "Chiedi qualcosa all'AI... (creerà prima un piano)"
                    }
                    disabled={disabled}
                    rows={1}
                />
                <button
                    className="send-btn"
                    onClick={handleSend}
                    disabled={disabled || !message.trim()}
                >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                </button>
            </div>
        </div>
    );
};
```

### 7.2 Chat Input CSS

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
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.mode-btn:hover:not(:disabled) {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
}

.mode-btn.active {
    background: #00ff88;
    color: #000;
}

.mode-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.mode-btn .icon {
    font-size: 14px;
}

.input-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
}

.input-row textarea {
    flex: 1;
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #fff;
    font-size: 14px;
    font-family: inherit;
    resize: none;
    min-height: 44px;
    max-height: 120px;
    line-height: 1.4;
}

.input-row textarea:focus {
    outline: none;
    border-color: #00ff88;
    background: rgba(255, 255, 255, 0.08);
}

.input-row textarea::placeholder {
    color: #666;
}

.send-btn {
    width: 44px;
    height: 44px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #00ff88;
    border: none;
    border-radius: 10px;
    color: #000;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
    background: #00cc6a;
    transform: scale(1.05);
}

.send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
}

.send-btn svg {
    width: 20px;
    height: 20px;
}
```

### 7.3 Plan Review Component

```tsx
// src/features/ai-chat/components/PlanReview.tsx

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './PlanReview.css';

interface Props {
    planContent: string;
    onApprove: () => void;
    onReject: () => void;
    onEdit: (newPlan: string) => void;
}

export const PlanReview: React.FC<Props> = ({
    planContent,
    onApprove,
    onReject,
    onEdit
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedPlan, setEditedPlan] = useState(planContent);

    return (
        <div className="plan-review">
            <div className="plan-header">
                <h3>📋 Piano di Implementazione</h3>
                <p>Rivedi il piano. Approva per procedere o richiedi modifiche.</p>
            </div>

            <div className="plan-content">
                {isEditing ? (
                    <textarea
                        value={editedPlan}
                        onChange={(e) => setEditedPlan(e.target.value)}
                        className="plan-editor"
                    />
                ) : (
                    <div className="plan-markdown">
                        <ReactMarkdown>{planContent}</ReactMarkdown>
                    </div>
                )}
            </div>

            <div className="plan-actions">
                {isEditing ? (
                    <>
                        <button className="btn-save" onClick={() => { onEdit(editedPlan); setIsEditing(false); }}>
                            💾 Salva
                        </button>
                        <button className="btn-cancel" onClick={() => { setEditedPlan(planContent); setIsEditing(false); }}>
                            Annulla
                        </button>
                    </>
                ) : (
                    <>
                        <button className="btn-approve" onClick={onApprove}>
                            ✅ Approva ed Esegui
                        </button>
                        <button className="btn-edit" onClick={() => setIsEditing(true)}>
                            ✏️ Modifica
                        </button>
                        <button className="btn-reject" onClick={onReject}>
                            🔄 Ri-pianifica
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
```

---

## PARTE 8: API ROUTES

### 8.1 Agent Routes

```javascript
// backend/routes/agent.js

const express = require('express');
const router = express.Router();
const agentLoop = require('../services/agent-loop');
const workspaceOrchestrator = require('../services/workspace-orchestrator');

// SSE helpers
function setupSSE(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
}

function sendEvent(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /agent/run/fast
 * Fast mode - immediate execution
 */
router.post('/run/fast', async (req, res) => {
    const { prompt, projectId, model } = req.body;
    setupSSE(res);

    try {
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);
        const result = await agentLoop.runFast(prompt, projectId, vmInfo, {
            model,
            onProgress: (e) => sendEvent(res, e)
        });
        sendEvent(res, { type: 'done', result });
    } catch (error) {
        sendEvent(res, { type: 'fatal_error', error: error.message });
    }
    res.end();
});

/**
 * POST /agent/run/plan
 * Planning mode - creates plan for approval
 */
router.post('/run/plan', async (req, res) => {
    const { prompt, projectId, model } = req.body;
    setupSSE(res);

    try {
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);
        const result = await agentLoop.runPlanning(prompt, projectId, vmInfo, {
            model,
            onProgress: (e) => sendEvent(res, e)
        });
        sendEvent(res, {
            type: 'plan_ready',
            planContent: result.planContent,
            requiresApproval: true
        });
    } catch (error) {
        sendEvent(res, { type: 'fatal_error', error: error.message });
    }
    res.end();
});

/**
 * POST /agent/run/execute
 * Execute approved plan
 */
router.post('/run/execute', async (req, res) => {
    const { planContent, projectId, model } = req.body;
    setupSSE(res);

    try {
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);
        const result = await agentLoop.runExecuting(planContent, projectId, vmInfo, {
            model,
            onProgress: (e) => sendEvent(res, e)
        });
        sendEvent(res, { type: 'done', result });
    } catch (error) {
        sendEvent(res, { type: 'fatal_error', error: error.message });
    }
    res.end();
});

module.exports = router;
```

### 8.2 AI Chat Route (Updated)

```javascript
// backend/routes/ai-chat.js

const express = require('express');
const router = express.Router();
const agentLoop = require('../services/agent-loop');
const workspaceOrchestrator = require('../services/workspace-orchestrator');

/**
 * POST /ai/chat
 * AI chat with context awareness and mode selection
 */
router.post('/chat', async (req, res) => {
    const {
        projectId,
        message,
        mode = 'fast',
        conversationHistory = []
    } = req.body;

    // SSE setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // Get VM
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);

        // Run based on mode
        if (mode === 'planning') {
            const result = await agentLoop.runPlanning(message, projectId, vmInfo, {
                onProgress: sendEvent
            });
            sendEvent({
                type: 'plan_ready',
                planContent: result.planContent,
                requiresApproval: true
            });
        } else {
            const result = await agentLoop.runFast(message, projectId, vmInfo, {
                onProgress: sendEvent
            });
            sendEvent({ type: 'done', result });
        }

    } catch (error) {
        sendEvent({ type: 'error', error: error.message });
    }

    res.end();
});

/**
 * POST /ai/chat/execute-plan
 * Execute an approved plan
 */
router.post('/chat/execute-plan', async (req, res) => {
    const { projectId, planContent } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);
        const result = await agentLoop.runExecuting(planContent, projectId, vmInfo, {
            onProgress: sendEvent
        });
        sendEvent({ type: 'done', result });
    } catch (error) {
        sendEvent({ type: 'error', error: error.message });
    }

    res.end();
});

module.exports = router;
```

---

## PARTE 9: SAFETY & LIMITS

### 9.1 Configuration

```javascript
const LIMITS = {
    MAX_ITERATIONS: 50,
    MAX_SAME_ERROR_RETRIES: 3,
    MAX_TOOL_TIMEOUT: 180000,      // 3 min for npm install
    MAX_FILE_SIZE: 1024 * 1024,    // 1MB per file
    MAX_TOTAL_TIME: 600000,        // 10 min total
    PLANNING_MAX_ITERATIONS: 10    // Quick planning
};
```

### 9.2 Error Recovery

```javascript
// Force alternative approach after same error 3 times
if (state.sameErrorCount >= MAX_SAME_ERROR_RETRIES) {
    messages.push({
        role: 'user',
        content: `[SYSTEM] Same error ${MAX_SAME_ERROR_RETRIES} times.
        You MUST try a completely different approach.
        If impossible, call signal_completion with error details.`
    });
    state.sameErrorCount = 0;
}
```

### 9.3 Total Timeout

```javascript
const startTime = Date.now();

// In loop...
if (Date.now() - startTime > LIMITS.MAX_TOTAL_TIME) {
    this._emit(onProgress, 'timeout', {
        message: 'Maximum time exceeded',
        elapsed: Date.now() - startTime
    });
    break;
}
```

---

## DEPLOYMENT CHECKLIST

### Files to Create

```
backend/
├── services/
│   ├── agent-loop.js
│   ├── agent-tools.json
│   └── industry-detector.js
└── routes/
    ├── agent.js
    └── ai-chat.js (update)

src/
└── features/ai-chat/components/
    ├── ChatInput.tsx
    ├── ChatInput.css
    ├── PlanReview.tsx
    └── PlanReview.css
```

### Files to Modify

```
backend/
├── index.js           # Add routes
└── routes/
    └── workstation.js # Save .drape/project.json

src/
└── features/ai-chat/
    └── AiChat.tsx     # Integrate new components
```

---

## QUICK REFERENCE

| Feature | Description |
|---------|-------------|
| **Context Persistence** | `.drape/project.json` stores original description |
| **Industry Detection** | Auto-detects from description (vape, restaurant, etc.) |
| **Fast Mode** | Immediate execution, all tools, self-correction |
| **Planning Mode** | Read-only → Plan → Approve → Execute |
| **Mode Toggle** | UI buttons in chat input: ⚡ Fast / 📋 Planned |
| **Max Iterations** | 50 (fast/executing), 10 (planning) |
| **Error Recovery** | After 3 same errors, forces alternative approach |

---

> **Key Insight**: Context is King. The AI must always know what the user originally asked for, not just what's in the current files.
