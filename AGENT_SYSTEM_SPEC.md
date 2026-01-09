# DRAPE AI AGENT SYSTEM - Specifica Tecnica Completa

## Filosofia Fondamentale

```
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
| **Operator Skill Matters** | Il successo dipende dalla qualità del prompt, non solo dal modello. |
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

### 1.2 Data Flow

```
User Request
     │
     ▼
┌─────────────────┐
│  Build Initial  │
│     Prompt      │
│  + System Msg   │
│  + Tools Schema │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ITERATION 1                                                    │
│  ├─ LLM: "I'll create a plan first..."                         │
│  ├─ Tool: create_plan({ title: "Vape Shop Website", ... })     │
│  └─ Result: "Plan created with 5 steps"                        │
│                                                                 │
│  ITERATION 2                                                    │
│  ├─ LLM: "Now creating package.json..."                        │
│  ├─ Tool: write_file({ path: "package.json", content: "..." }) │
│  └─ Result: "File written: package.json (523 bytes)"           │
│                                                                 │
│  ITERATION 3                                                    │
│  ├─ LLM: "Creating vite.config.js..."                          │
│  ├─ Tool: write_file({ path: "vite.config.js", ... })          │
│  └─ Result: "File written: vite.config.js (245 bytes)"         │
│                                                                 │
│  ... (more iterations) ...                                      │
│                                                                 │
│  ITERATION N                                                    │
│  ├─ LLM: "Running npm install..."                              │
│  ├─ Tool: run_command({ command: "npm install" })              │
│  └─ Result: "Exit code: 0, 156 packages installed"             │
│                                                                 │
│  ITERATION N+1                                                  │
│  ├─ LLM: "All tasks complete!"                                 │
│  ├─ Tool: signal_completion({ summary: "..." })                │
│  └─ Result: <completion>TASK_COMPLETE</completion>  ← EXIT!    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
   Final Result
   to Frontend
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
        "description": "Create or overwrite a file. Content must be complete, not a diff. Use for creating new files or completely replacing existing ones.",
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
        "description": "List files and folders in a directory. Use to explore project structure.",
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
        "description": "Execute shell command. Use for: npm install, npm run build, git operations, etc.",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string",
              "description": "Command to execute. Example: 'npm install axios'"
            },
            "timeout_ms": {
              "type": "number",
              "description": "Timeout in milliseconds. Default: 60000. Use 180000 for npm install."
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
        "description": "Replace specific text in a file. More efficient than write_file for small changes. Target must be unique in file.",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "File to edit."
            },
            "search": {
              "type": "string",
              "description": "Exact text to find (must be unique in file)."
            },
            "replace": {
              "type": "string",
              "description": "Text to replace with."
            }
          },
          "required": ["path", "search", "replace"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "signal_completion",
        "description": "Signal that the task is complete. MUST be called when all work is done. Include summary of what was accomplished.",
        "parameters": {
          "type": "object",
          "properties": {
            "summary": {
              "type": "string",
              "description": "Summary of completed work."
            },
            "files_created": {
              "type": "array",
              "items": { "type": "string" },
              "description": "List of files created."
            },
            "files_modified": {
              "type": "array",
              "items": { "type": "string" },
              "description": "List of files modified."
            },
            "commands_run": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Commands executed."
            },
            "verification": {
              "type": "string",
              "description": "How to verify the work (e.g., 'Run npm run dev')"
            }
          },
          "required": ["summary", "files_created"]
        }
      }
    }
  ]
}
```

---

## PARTE 3: SYSTEM PROMPT

### 3.1 Base System Prompt

```markdown
You are DRAPE AI, an autonomous software development agent. You operate inside a Linux VM with direct filesystem and terminal access.

## YOUR CAPABILITIES
- Write, read, and edit files
- Execute shell commands (npm, git, etc.)
- Create complete projects from scratch
- Debug and fix errors iteratively

## HOW TO OPERATE

### 1. ANALYZE FIRST
Before writing code:
- Understand what the user wants
- Identify the project type, target audience, required features
- If project exists, use list_directory and read_file to understand structure

### 2. WORK INCREMENTALLY
Don't try to do everything at once:
- Create files one at a time
- Run commands and check results
- Fix errors as they occur
- Each iteration should make progress

### 3. HANDLE ERRORS (CRITICAL)
When something fails:
1. Read the error message carefully
2. Understand what went wrong
3. Fix the issue
4. Try again
5. If stuck after 3 attempts on same error, try alternative approach

Example error handling:
```
Command failed: npm install
STDERR: npm ERR! Could not resolve dependency

→ Read package.json to check versions
→ Fix incompatible versions
→ Try npm install again
```

### 4. COMPLETION CRITERIA
You MUST call signal_completion when:
- All requested features are implemented
- Code compiles/builds without errors
- Project is ready to run

NEVER end without calling signal_completion.

## CONTENT GENERATION RULES

### CRITICAL: No Placeholders
❌ NEVER use:
- "Product 1", "Product 2"
- "Lorem ipsum"
- "Description here"
- "Your Company Name"
- "Feature 1", "Feature 2"

✅ ALWAYS use:
- Real product names appropriate to the industry
- Realistic descriptions
- Actual prices (€XX.XX format)
- Genuine-sounding testimonials

### Industry-Specific Content

**VAPE/SMOKE SHOP:**
- Products: "Elf Bar BC5000", "SMOK Nord 5", "Vaporesso XROS 3"
- Categories: "Dispositivi", "Liquidi", "Accessori", "Pod Mod"
- Prices: "€12.99", "€24.50", "€8.99"

**RESTAURANT:**
- Menu items with descriptions and prices
- Opening hours, location
- Chef's recommendations

**E-COMMERCE:**
- Product categories with real items
- Filters, sorting, cart functionality
- Shipping info, payment methods

**PORTFOLIO:**
- Realistic project names
- Technologies used
- Project descriptions and outcomes

### Design System by Industry

| Industry | Background | Accent | Style |
|----------|-----------|--------|-------|
| Vape/Smoke | #0d0d0d | #00ff88, #ff00ff | Neon, edgy |
| Restaurant | #1a1a1a | #ff6b35, #ffd93d | Warm, elegant |
| Tech/SaaS | #0f172a | #3b82f6, #8b5cf6 | Clean, professional |
| Fashion | #000000 | #ffffff | Minimalist, editorial |
| Portfolio | #0a0a0f | Custom | Creative, personal |

## PROJECT STRUCTURE (React + Vite)

Always create this structure:
```
/
├── index.html           # Root HTML (NOT in public/)
├── package.json         # Dependencies
├── vite.config.js       # Vite config
└── src/
    ├── main.jsx         # Entry point
    ├── App.jsx          # Main component + Router
    ├── App.css          # App styles
    ├── index.css        # Global styles + variables
    ├── components/      # Reusable components
    │   ├── Header.jsx
    │   ├── Footer.jsx
    │   └── ...
    └── pages/           # Route pages
        ├── Home.jsx
        └── ...
```

CRITICAL vite.config.js:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 3000 }
})
```

## ITERATION LIMITS
- Max iterations: 50
- If stuck on same error 3 times: try alternative approach
- If stuck on same error 5 times: report issue and suggest manual fix
```

---

## PARTE 4: PROMPT TEMPLATES

### 4.1 Project Creation Prompt

```markdown
Create a {TECHNOLOGY} project called "{PROJECT_NAME}".

## Description
{USER_DESCRIPTION}

## Requirements
1. Complete, working project structure
2. Modern UI design appropriate for the industry
3. Realistic content (NO placeholders)
4. Mobile-responsive design
5. Clean, organized code

## Success Criteria
- [ ] All files created
- [ ] npm install completes without errors
- [ ] npm run dev starts the server
- [ ] All pages render correctly
- [ ] Design matches industry expectations

## Process
1. Analyze the request to understand industry and requirements
2. Create package.json with all dependencies
3. Create vite.config.js
4. Create index.html
5. Create src/main.jsx and src/App.jsx
6. Create global styles (index.css)
7. Create components one by one
8. Create pages
9. Run npm install
10. Verify build works
11. Call signal_completion with summary

When all criteria met, call signal_completion.
```

### 4.2 Feature Implementation Prompt

```markdown
Implement {FEATURE_NAME} in the existing project.

## Feature Requirements
{REQUIREMENTS_LIST}

## Process
1. Use list_directory to understand current structure
2. Use read_file to examine relevant existing files
3. Plan the changes needed
4. Implement changes incrementally
5. Test each change
6. If errors occur, fix them before continuing

## Success Criteria
- [ ] Feature fully implemented
- [ ] No breaking changes to existing code
- [ ] Code follows existing patterns
- [ ] Build passes

When complete, call signal_completion with summary of changes.
```

### 4.3 Bug Fix Prompt

```markdown
Fix the following bug: {BUG_DESCRIPTION}

## Debug Process
1. Understand the expected vs actual behavior
2. Use read_file to examine relevant code
3. Identify the root cause
4. Implement the fix
5. Verify the fix works
6. Ensure no regression

## If Stuck
After 3 failed attempts:
- Document what you've tried
- Explain why it's not working
- Suggest alternative approaches

When fixed, call signal_completion with:
- What caused the bug
- How you fixed it
- How to prevent similar bugs
```

### 4.4 Self-Correction Pattern

```markdown
## ERROR RECOVERY PROTOCOL

When a command or operation fails:

1. READ THE ERROR
   - What exactly failed?
   - What's the error message?

2. DIAGNOSE
   - Is it a syntax error? → Fix the code
   - Is it a missing dependency? → Install it
   - Is it a wrong path? → Correct the path
   - Is it a permission issue? → Try alternative approach

3. FIX
   - Make the minimal change to fix the issue
   - Don't change unrelated code

4. RETRY
   - Run the same command again
   - Verify the fix worked

5. IF STILL FAILING
   Iteration 1-3: Try different fixes
   Iteration 4-5: Try alternative approach
   Iteration 6+: Report issue, suggest manual intervention

Example:
```
ERROR: npm ERR! Cannot find module 'react'

DIAGNOSIS: react not in dependencies

FIX: Edit package.json to add react

RETRY: npm install

RESULT: Success - continue to next step
```
```

---

## PARTE 5: BACKEND IMPLEMENTATION

### 5.1 Agent Loop Engine

```javascript
// backend/services/agent-loop.js

const EventEmitter = require('events');
const { getProviderForModel } = require('./ai-providers');
const flyService = require('./fly-service');
const TOOLS = require('./agent-tools.json').tools;

const COMPLETION_SIGNAL = '<completion>TASK_COMPLETE</completion>';
const MAX_ITERATIONS = 50;
const MAX_SAME_ERROR_RETRIES = 3;

class AgentLoop extends EventEmitter {
    constructor() {
        super();
    }

    /**
     * Run the agent loop until completion or max iterations
     */
    async run(prompt, projectId, vmInfo, options = {}) {
        const {
            model = 'gemini-2.5-flash',
            maxIterations = MAX_ITERATIONS,
            onProgress
        } = options;

        // Initialize AI provider
        const { provider, modelId } = getProviderForModel(model);
        if (!provider.client && provider.isAvailable()) {
            await provider.initialize();
        }

        // Build initial context
        const systemPrompt = this._buildSystemPrompt();
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];

        // Loop state
        const state = {
            iteration: 0,
            filesCreated: [],
            filesModified: [],
            commandsRun: [],
            lastError: null,
            sameErrorCount: 0,
            completed: false
        };

        this._emit(onProgress, 'start', { message: 'Starting agent loop...' });

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

                const response = await this._callLLM(provider, modelId, messages);

                // 2. Check for tool calls
                if (response.toolCalls && response.toolCalls.length > 0) {
                    for (const toolCall of response.toolCalls) {
                        // Execute tool
                        const result = await this._executeTool(
                            toolCall,
                            projectId,
                            vmInfo,
                            state,
                            onProgress
                        );

                        // Append to messages
                        messages.push({
                            role: 'assistant',
                            content: [{
                                type: 'tool_use',
                                id: toolCall.id,
                                name: toolCall.name,
                                input: toolCall.input
                            }]
                        });

                        messages.push({
                            role: 'user',
                            content: [{
                                type: 'tool_result',
                                tool_use_id: toolCall.id,
                                content: result
                            }]
                        });

                        // Check for completion signal
                        if (toolCall.name === 'signal_completion') {
                            state.completed = true;
                            this._emit(onProgress, 'complete', {
                                iteration: state.iteration,
                                summary: toolCall.input.summary,
                                filesCreated: state.filesCreated,
                                filesModified: state.filesModified
                            });
                            break;
                        }

                        // Check for errors and track
                        if (result.startsWith('ERROR:')) {
                            if (result === state.lastError) {
                                state.sameErrorCount++;
                                if (state.sameErrorCount >= MAX_SAME_ERROR_RETRIES) {
                                    // Force alternative approach
                                    messages.push({
                                        role: 'user',
                                        content: `[SYSTEM] Same error ${MAX_SAME_ERROR_RETRIES} times. Try a different approach.`
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
                    // LLM responded with text only
                    messages.push({ role: 'assistant', content: response.text });

                    // Check if text contains completion signal
                    if (response.text.includes(COMPLETION_SIGNAL)) {
                        state.completed = true;
                    }
                }

            } catch (error) {
                this._emit(onProgress, 'error', {
                    iteration: state.iteration,
                    error: error.message
                });

                // Add error to context for recovery
                messages.push({
                    role: 'user',
                    content: `[SYSTEM ERROR] ${error.message}. Please recover and continue.`
                });
            }
        }

        // Check if we hit max iterations without completing
        if (!state.completed) {
            this._emit(onProgress, 'max_iterations', {
                iteration: state.iteration,
                message: 'Max iterations reached without completion signal'
            });
        }

        return {
            completed: state.completed,
            iterations: state.iteration,
            filesCreated: state.filesCreated,
            filesModified: state.filesModified,
            commandsRun: state.commandsRun
        };
    }

    /**
     * Build system prompt with all instructions
     */
    _buildSystemPrompt() {
        return `You are DRAPE AI, an autonomous development agent.

## CORE RULES
1. Work incrementally - one file/command at a time
2. Handle errors by reading them, fixing, and retrying
3. Use realistic content, never placeholders
4. ALWAYS call signal_completion when done

## TOOLS AVAILABLE
- write_file: Create or overwrite files
- read_file: Read file contents
- list_directory: Explore project structure
- run_command: Execute shell commands
- edit_file: Modify specific parts of files
- signal_completion: Signal task is complete (REQUIRED at end)

## ERROR HANDLING
When errors occur:
1. Read the error message
2. Diagnose the cause
3. Fix the issue
4. Retry the operation
5. If same error 3 times, try different approach

## COMPLETION
You MUST call signal_completion when:
- All requirements are met
- Code builds without errors
- Project is ready to use

Never end without calling signal_completion.`;
    }

    /**
     * Call LLM with tool schema
     */
    async _callLLM(provider, modelId, messages) {
        const formattedTools = TOOLS.map(t => ({
            name: t.function.name,
            description: t.function.description,
            input_schema: t.function.parameters
        }));

        return await provider.chat(messages, {
            model: modelId,
            tools: formattedTools,
            maxTokens: 8192,
            temperature: 0.7
        });
    }

    /**
     * Execute a tool on the VM
     */
    async _executeTool(toolCall, projectId, vmInfo, state, onProgress) {
        const { name, input, id } = toolCall;
        const { agentUrl, machineId } = vmInfo;

        this._emit(onProgress, 'tool_start', {
            tool: name,
            input: this._summarizeInput(name, input)
        });

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
                    result = `<completion>TASK_COMPLETE</completion>\n${JSON.stringify(input)}`;
                    break;

                default:
                    result = `ERROR: Unknown tool '${name}'`;
            }

            this._emit(onProgress, 'tool_complete', {
                tool: name,
                success: !result.startsWith('ERROR'),
                preview: result.substring(0, 200)
            });

        } catch (error) {
            result = `ERROR: ${error.message}`;
            this._emit(onProgress, 'tool_error', {
                tool: name,
                error: error.message
            });
        }

        return result;
    }

    // === Tool Implementations ===

    async _writeFile(agentUrl, machineId, path, content) {
        // Escape content for heredoc
        const escapedContent = content.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
        const cmd = `mkdir -p "$(dirname "/home/coder/project/${path}")" && cat > "/home/coder/project/${path}" << 'DRAPE_FILE_EOF'\n${content}\nDRAPE_FILE_EOF`;

        const result = await flyService.exec(agentUrl, cmd, '/home/coder/project', machineId, 30000);

        if (result.exitCode !== 0) {
            return `ERROR: Failed to write ${path}: ${result.stderr}`;
        }
        return `SUCCESS: Written ${path} (${content.length} bytes)`;
    }

    async _readFile(agentUrl, machineId, path) {
        const result = await flyService.exec(
            agentUrl,
            `cat "/home/coder/project/${path}"`,
            '/home/coder/project',
            machineId,
            10000
        );

        if (result.exitCode !== 0) {
            return `ERROR: Cannot read ${path}: ${result.stderr}`;
        }
        return result.stdout;
    }

    async _listDir(agentUrl, machineId, path) {
        const fullPath = path === '.' ? '/home/coder/project' : `/home/coder/project/${path}`;
        const result = await flyService.exec(
            agentUrl,
            `ls -la "${fullPath}"`,
            '/home/coder/project',
            machineId,
            10000
        );

        if (result.exitCode !== 0) {
            return `ERROR: Cannot list ${path}: ${result.stderr}`;
        }
        return result.stdout;
    }

    async _runCmd(agentUrl, machineId, command, timeout = 60000) {
        const result = await flyService.exec(
            agentUrl,
            command,
            '/home/coder/project',
            machineId,
            timeout
        );

        let output = `Exit code: ${result.exitCode}\n`;
        if (result.stdout) output += `STDOUT:\n${result.stdout}\n`;
        if (result.stderr) output += `STDERR:\n${result.stderr}`;

        if (result.exitCode !== 0) {
            return `ERROR: Command failed\n${output}`;
        }
        return `SUCCESS:\n${output}`;
    }

    async _editFile(agentUrl, machineId, path, search, replace) {
        // Read current content
        const current = await this._readFile(agentUrl, machineId, path);
        if (current.startsWith('ERROR:')) {
            return current;
        }

        if (!current.includes(search)) {
            return `ERROR: Search string not found in ${path}`;
        }

        const newContent = current.replace(search, replace);
        return await this._writeFile(agentUrl, machineId, path, newContent);
    }

    // === Helpers ===

    _summarizeInput(tool, input) {
        switch (tool) {
            case 'write_file':
                return { path: input.path, bytes: input.content?.length || 0 };
            case 'run_command':
                return { command: input.command };
            case 'read_file':
            case 'list_directory':
                return { path: input.path };
            case 'edit_file':
                return { path: input.path };
            default:
                return input;
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

### 5.2 API Route

```javascript
// backend/routes/agent.js

const express = require('express');
const router = express.Router();
const agentLoop = require('../services/agent-loop');
const workspaceOrchestrator = require('../services/workspace-orchestrator');

/**
 * POST /agent/run
 * Execute agent loop with SSE streaming
 */
router.post('/run', async (req, res) => {
    const { prompt, projectId, model, maxIterations } = req.body;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // Get or create VM
        sendEvent({ type: 'status', message: 'Starting environment...' });
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);
        sendEvent({ type: 'status', message: 'Environment ready' });

        // Run agent loop
        const result = await agentLoop.run(prompt, projectId, vmInfo, {
            model: model || 'gemini-2.5-flash',
            maxIterations: maxIterations || 50,
            onProgress: sendEvent
        });

        sendEvent({ type: 'done', result });
        res.end();

    } catch (error) {
        sendEvent({ type: 'fatal_error', error: error.message });
        res.end();
    }
});

/**
 * POST /agent/create-project
 * Create a new project using agent loop
 */
router.post('/create-project', async (req, res) => {
    const { name, description, technology } = req.body;

    const prompt = `Create a ${technology} project called "${name}".

## Description
${description}

## Requirements
1. Complete project structure
2. Modern, professional UI design
3. Realistic content (NO placeholders like "Product 1")
4. Mobile-responsive
5. Clean code

## Success Criteria
- All files created
- npm install works
- npm run dev starts server
- All pages render

## Process
1. Analyze request
2. Create package.json with dependencies
3. Create vite.config.js
4. Create index.html at root
5. Create src/main.jsx, App.jsx
6. Create styles
7. Create components
8. Create pages
9. Run npm install
10. Call signal_completion

Start now.`;

    // Redirect to /run
    req.body.prompt = prompt;
    req.body.maxIterations = 50;

    return router.handle(req, res, () => {});
});

module.exports = router;
```

---

## PARTE 6: FRONTEND

### 6.1 Agent Progress Component

```tsx
// src/components/AgentProgress.tsx

import React, { useState, useEffect, useRef } from 'react';
import './AgentProgress.css';

interface AgentEvent {
    type: string;
    timestamp: number;
    iteration?: number;
    maxIterations?: number;
    message?: string;
    tool?: string;
    input?: any;
    success?: boolean;
    preview?: string;
    error?: string;
    summary?: string;
    filesCreated?: string[];
    result?: any;
}

interface Props {
    endpoint: string;
    body: any;
    onComplete?: (result: any) => void;
    onError?: (error: string) => void;
}

export const AgentProgress: React.FC<Props> = ({ endpoint, body, onComplete, onError }) => {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
    const [currentTool, setCurrentTool] = useState<string | null>(null);
    const [iteration, setIteration] = useState(0);
    const [maxIterations, setMaxIterations] = useState(50);
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!body) return;

        setStatus('running');
        setEvents([]);

        const fetchWithSSE = async () => {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                const reader = response.body?.getReader();
                const decoder = new TextDecoder();

                while (reader) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const text = decoder.decode(value);
                    const lines = text.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const event: AgentEvent = JSON.parse(line.slice(6));
                                handleEvent(event);
                            } catch (e) {
                                // Ignore parse errors
                            }
                        }
                    }
                }
            } catch (error: any) {
                setStatus('error');
                onError?.(error.message);
            }
        };

        fetchWithSSE();
    }, [endpoint, body]);

    const handleEvent = (event: AgentEvent) => {
        setEvents(prev => [...prev, event]);

        switch (event.type) {
            case 'iteration_start':
                setIteration(event.iteration || 0);
                if (event.maxIterations) setMaxIterations(event.maxIterations);
                break;
            case 'tool_start':
                setCurrentTool(event.tool || null);
                break;
            case 'tool_complete':
            case 'tool_error':
                setCurrentTool(null);
                break;
            case 'complete':
            case 'done':
                setStatus('complete');
                setCurrentTool(null);
                onComplete?.(event.result || event);
                break;
            case 'fatal_error':
                setStatus('error');
                onError?.(event.error || 'Unknown error');
                break;
        }

        // Auto-scroll
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    };

    const getToolIcon = (tool: string) => {
        const icons: Record<string, string> = {
            'write_file': '📝',
            'read_file': '📖',
            'list_directory': '📁',
            'run_command': '⚡',
            'edit_file': '✏️',
            'signal_completion': '✅'
        };
        return icons[tool] || '🔧';
    };

    return (
        <div className="agent-progress">
            {/* Header */}
            <div className="agent-header">
                <div className="status-indicator">
                    <span className={`status-dot ${status}`} />
                    <span className="status-text">
                        {status === 'running' ?
                            (currentTool ? `Executing: ${currentTool}` : 'Thinking...') :
                            status.charAt(0).toUpperCase() + status.slice(1)
                        }
                    </span>
                </div>
                <div className="iteration-badge">
                    {iteration} / {maxIterations}
                </div>
            </div>

            {/* Progress bar */}
            <div className="progress-bar">
                <div
                    className="progress-fill"
                    style={{ width: `${(iteration / maxIterations) * 100}%` }}
                />
            </div>

            {/* Event log */}
            <div className="event-log" ref={logRef}>
                {events.filter(e =>
                    ['tool_start', 'tool_complete', 'tool_error', 'complete', 'error'].includes(e.type)
                ).map((event, i) => (
                    <div key={i} className={`event-item ${event.type}`}>
                        <span className="event-icon">
                            {event.tool ? getToolIcon(event.tool) :
                             event.type === 'complete' ? '🎉' :
                             event.type === 'error' ? '❌' : '•'}
                        </span>
                        <div className="event-content">
                            <span className="event-title">
                                {event.tool || event.message || event.type}
                            </span>
                            {event.input && (
                                <span className="event-detail">
                                    {typeof event.input === 'object' ?
                                        JSON.stringify(event.input) :
                                        event.input
                                    }
                                </span>
                            )}
                            {event.error && (
                                <span className="event-error">{event.error}</span>
                            )}
                        </div>
                        {event.success !== undefined && (
                            <span className={`event-status ${event.success ? 'success' : 'fail'}`}>
                                {event.success ? '✓' : '✗'}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Completion summary */}
            {status === 'complete' && events.find(e => e.type === 'complete') && (
                <div className="completion-summary">
                    <h4>Task Complete</h4>
                    <p>{events.find(e => e.type === 'complete')?.summary}</p>
                    {events.find(e => e.type === 'complete')?.filesCreated && (
                        <div className="files-created">
                            <strong>Files created:</strong>
                            <div className="file-chips">
                                {events.find(e => e.type === 'complete')?.filesCreated?.map(f => (
                                    <span key={f} className="file-chip">{f}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
```

### 6.2 CSS Styles

```css
/* src/components/AgentProgress.css */

.agent-progress {
    background: #0d0d0d;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
    font-family: 'Inter', sans-serif;
}

.agent-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
}

.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #666;
}

.status-dot.running {
    background: #00ff88;
    animation: pulse 1.5s ease-in-out infinite;
}

.status-dot.complete {
    background: #00ff88;
}

.status-dot.error {
    background: #ff4444;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.status-text {
    color: #fff;
    font-weight: 500;
}

.iteration-badge {
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 13px;
    color: #888;
}

.progress-bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    margin-bottom: 20px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00ff88, #00ccff);
    border-radius: 2px;
    transition: width 0.3s ease;
}

.event-log {
    max-height: 400px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.event-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    border-left: 3px solid transparent;
}

.event-item.tool_complete {
    border-left-color: #00ff88;
}

.event-item.tool_error {
    border-left-color: #ff4444;
    background: rgba(255, 68, 68, 0.1);
}

.event-icon {
    font-size: 18px;
    flex-shrink: 0;
}

.event-content {
    flex: 1;
    min-width: 0;
}

.event-title {
    display: block;
    color: #fff;
    font-weight: 500;
    font-size: 14px;
}

.event-detail {
    display: block;
    color: #666;
    font-size: 12px;
    font-family: monospace;
    margin-top: 4px;
    word-break: break-all;
}

.event-error {
    display: block;
    color: #ff6666;
    font-size: 12px;
    margin-top: 4px;
}

.event-status {
    font-weight: bold;
}

.event-status.success {
    color: #00ff88;
}

.event-status.fail {
    color: #ff4444;
}

.completion-summary {
    margin-top: 20px;
    padding: 16px;
    background: rgba(0, 255, 136, 0.1);
    border: 1px solid rgba(0, 255, 136, 0.3);
    border-radius: 8px;
}

.completion-summary h4 {
    margin: 0 0 8px 0;
    color: #00ff88;
}

.completion-summary p {
    margin: 0 0 12px 0;
    color: #ccc;
}

.file-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}

.file-chip {
    font-size: 11px;
    padding: 4px 8px;
    background: rgba(0, 255, 136, 0.2);
    color: #00ff88;
    border-radius: 4px;
    font-family: monospace;
}
```

---

## PARTE 7: SAFETY & LIMITS

### 7.1 Iteration Limits

```javascript
// Configuration
const LIMITS = {
    MAX_ITERATIONS: 50,           // Total iterations allowed
    MAX_SAME_ERROR_RETRIES: 3,    // Same error before forcing alternative
    MAX_TOOL_TIMEOUT: 180000,     // 3 min for npm install
    MAX_FILE_SIZE: 1024 * 1024,   // 1MB per file
    MAX_TOTAL_TIME: 600000        // 10 min total
};
```

### 7.2 Stuck Detection

```javascript
// In agent loop
if (state.sameErrorCount >= LIMITS.MAX_SAME_ERROR_RETRIES) {
    messages.push({
        role: 'user',
        content: `[SYSTEM] Same error ${LIMITS.MAX_SAME_ERROR_RETRIES} times.
        You MUST try a completely different approach.
        If impossible, call signal_completion with error details.`
    });
    state.sameErrorCount = 0;
}
```

### 7.3 Total Timeout

```javascript
async run(prompt, projectId, vmInfo, options = {}) {
    const startTime = Date.now();

    // ... in the loop ...

    if (Date.now() - startTime > LIMITS.MAX_TOTAL_TIME) {
        this._emit(onProgress, 'timeout', {
            message: 'Maximum time exceeded',
            elapsed: Date.now() - startTime
        });
        break;
    }
}
```

---

## PARTE 8: TESTING

### 8.1 Test Cases

```javascript
// tests/agent-loop.test.js

describe('AgentLoop', () => {
    test('completes simple project', async () => {
        const result = await agentLoop.run(
            'Create a React hello world with one button',
            'test-1',
            mockVM
        );

        expect(result.completed).toBe(true);
        expect(result.filesCreated).toContain('package.json');
        expect(result.iterations).toBeLessThan(20);
    });

    test('recovers from npm error', async () => {
        // First npm install will fail, should retry
        mockExec
            .mockResolvedValueOnce({ exitCode: 1, stderr: 'npm ERR!' })
            .mockResolvedValueOnce({ exitCode: 0, stdout: 'installed' });

        const result = await agentLoop.run(
            'Install axios',
            'test-2',
            mockVM
        );

        expect(result.completed).toBe(true);
    });

    test('respects max iterations', async () => {
        const result = await agentLoop.run(
            'Impossible task that never completes',
            'test-3',
            mockVM,
            { maxIterations: 5 }
        );

        expect(result.completed).toBe(false);
        expect(result.iterations).toBe(5);
    });
});
```

---

## DEPLOYMENT CHECKLIST

### Files to Create

```
backend/
├── services/
│   ├── agent-loop.js          # NEW
│   └── agent-tools.json       # NEW
└── routes/
    └── agent.js               # NEW

src/
└── components/
    ├── AgentProgress.tsx      # NEW
    └── AgentProgress.css      # NEW
```

### Files to Modify

```
backend/
├── index.js                   # Add: app.use('/agent', require('./routes/agent'))
└── routes/
    └── workstation.js         # Optional: Replace one-shot with agent

src/
└── pages/
    └── CreateProject.tsx      # Use AgentProgress component
```

### No New Dependencies Required

Uses existing:
- AI providers (Gemini via existing provider)
- Fly.io service (existing flyService)
- WebSocket/SSE (native fetch + ReadableStream)

---

## PARTE 9: FAST MODE vs PLANNING MODE

### 9.1 Concept Overview

L'agent può operare in due modalità distinte, selezionabili dinamicamente:

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

### 9.2 When to Use Each Mode

| Scenario | Mode | Reason |
|----------|------|--------|
| "Create a landing page" | FAST | Simple, clear requirements |
| "Build an e-commerce with 10 pages" | PLANNING | Complex, needs architecture |
| "Add a button to the header" | FAST | Single file change |
| "Refactor authentication system" | PLANNING | Multi-file, breaking changes |
| "Fix this CSS bug" | FAST | Quick fix |
| "Implement payment integration" | PLANNING | Critical, needs review |

### 9.3 FAST MODE

```
┌─────────────────────────────────────────────────────────────┐
│                        FAST MODE                             │
│                                                              │
│   "Move fast and break things" - iterate to perfection       │
│                                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│   │  USER    │───▶│   AI     │───▶│ EXECUTE  │──┐           │
│   │  INPUT   │    │ ANALYZE  │    │  TOOLS   │  │           │
│   └──────────┘    └──────────┘    └──────────┘  │           │
│                                          │       │           │
│                                          ▼       │           │
│                                   ┌──────────┐   │           │
│                                   │  ERROR?  │───┤           │
│                                   └──────────┘   │           │
│                                          │ YES   │ NO        │
│                                          ▼       ▼           │
│                                   ┌──────────────────┐       │
│                                   │  LOOP: FIX/RETRY │       │
│                                   └──────────────────┘       │
│                                          │                   │
│                                          ▼                   │
│                                   ┌──────────┐               │
│                                   │   DONE   │               │
│                                   └──────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Caratteristiche:**
- Esecuzione immediata senza approvazione
- Tutti gli strumenti disponibili (write_file, run_command, etc.)
- Ideale per: prototipi, quick fixes, task semplici
- Loop iterativo con self-correction

### 9.4 PLANNING MODE - Two-Phase Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            PLANNING MODE                                     │
│                                                                              │
│   ══════════════════ PHASE A: PLANNER ══════════════════                    │
│                                                                              │
│   ┌──────────┐    ┌──────────────┐    ┌─────────────────┐                  │
│   │  USER    │───▶│   PLANNER    │───▶│  CREATE PLAN.md │                  │
│   │  INPUT   │    │   (AI)       │    │  (read-only)    │                  │
│   └──────────┘    └──────────────┘    └────────┬────────┘                  │
│                                                 │                           │
│   Tools allowed:                                │                           │
│   ✓ read_file                                   ▼                           │
│   ✓ list_directory                      ┌─────────────────┐                │
│   ✓ create_plan (special)               │  ⏸️ PAUSE FOR   │                │
│   ✗ write_file                          │  USER APPROVAL  │                │
│   ✗ run_command                         └────────┬────────┘                │
│   ✗ edit_file                                    │                          │
│                                                  ▼                          │
│                                        ┌─────────────────┐                  │
│                                        │  USER REVIEWS   │                  │
│                                        │    PLAN.md      │                  │
│                                        └────────┬────────┘                  │
│                                                 │                           │
│                              ┌──────────────────┼──────────────────┐        │
│                              │                  │                  │        │
│                              ▼                  ▼                  ▼        │
│                        ┌──────────┐      ┌──────────┐      ┌──────────┐    │
│                        │ APPROVE  │      │  MODIFY  │      │  CANCEL  │    │
│                        └────┬─────┘      └────┬─────┘      └──────────┘    │
│                             │                  │                            │
│                             │                  └──▶ Back to PHASE A         │
│                             ▼                                               │
│   ══════════════════ PHASE B: EXECUTOR ══════════════════                  │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                                                                      │ │
│   │   Executor reads PLAN.md and follows it step by step                 │ │
│   │                                                                      │ │
│   │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │ │
│   │   │   STEP 1     │───▶│   STEP 2     │───▶│   STEP N     │          │ │
│   │   │  (execute)   │    │  (execute)   │    │  (execute)   │          │ │
│   │   └──────────────┘    └──────────────┘    └──────────────┘          │ │
│   │                                                                      │ │
│   │   All tools available:                                               │ │
│   │   ✓ write_file, read_file, edit_file, run_command, list_directory   │ │
│   │                                                                      │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                                          │                                   │
│                                          ▼                                   │
│                                   ┌──────────────┐                          │
│                                   │  COMPLETED   │                          │
│                                   │  signal_done │                          │
│                                   └──────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.5 PLAN.md Structure

```markdown
# Implementation Plan: {PROJECT_NAME}

## Overview
{Brief description of what will be built}

## Architecture Decisions
- Framework: {choice and why}
- Styling: {approach}
- State Management: {if applicable}
- Key Patterns: {list}

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
    │   ├── Header.jsx
    │   └── ...
    └── pages/
        ├── Home.jsx
        └── ...
```

## Implementation Steps

### Step 1: Project Setup
- [ ] Create package.json with dependencies
- [ ] Create vite.config.js
- [ ] Create index.html

### Step 2: Core Structure
- [ ] Create src/main.jsx
- [ ] Create src/App.jsx with router
- [ ] Create base styles

### Step 3: Components
- [ ] Header component
- [ ] Footer component
- [ ] Navigation

### Step 4: Pages
- [ ] Home page
- [ ] Other pages as needed

### Step 5: Integration & Testing
- [ ] Run npm install
- [ ] Verify build
- [ ] Test all routes

## Dependencies
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^6.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x"
  }
}
```

## Estimated Iterations
- Setup: ~3 iterations
- Components: ~{N} iterations
- Pages: ~{N} iterations
- Testing: ~2 iterations
- **Total: ~{N} iterations**

## Risks & Mitigations
1. {Potential issue} → {Solution}
2. {Potential issue} → {Solution}

---
*This plan requires user approval before execution.*
```

### 9.6 Dynamic System Prompt

```javascript
/**
 * Build system prompt based on mode
 * @param {string} mode - 'fast' | 'planning' | 'executing'
 * @param {object} context - Additional context (plan content, etc.)
 */
_buildSystemPrompt(mode = 'fast', context = {}) {
    const basePrompt = `You are DRAPE AI, an autonomous development agent.`;

    if (mode === 'fast') {
        return `${basePrompt}

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
        return `${basePrompt}

## MODE: PLANNING (Phase A)
You are in PLANNING mode. Create a detailed implementation plan WITHOUT executing anything.

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

## OUTPUT
Call create_plan with your complete implementation plan.
The user will review and approve before execution begins.

DO NOT attempt to write code or execute commands.`;
    }

    if (mode === 'executing') {
        return `${basePrompt}

## MODE: EXECUTING (Phase B)
You are in EXECUTION mode. Follow the approved plan step by step.

## THE APPROVED PLAN
\`\`\`markdown
${context.planContent || 'No plan provided'}
\`\`\`

## TOOLS AVAILABLE (FULL ACCESS)
- write_file: Create/overwrite files
- read_file: Read file contents
- list_directory: Explore structure
- run_command: Execute shell commands
- edit_file: Modify files
- signal_completion: Signal done (REQUIRED at end)

## YOUR TASK
1. Read the plan above
2. Execute each step in order
3. Mark steps as complete as you go
4. Handle any errors that occur
5. Call signal_completion when ALL steps are done

## RULES
- Follow the plan exactly unless blocked
- If a step fails, try to fix it
- Update the user on progress
- Don't skip steps

## COMPLETION
Call signal_completion with:
- Summary of what was done
- List of files created
- Any deviations from plan
- How to verify (e.g., "npm run dev")

Never end without signal_completion.`;
    }

    return basePrompt;
}
```

### 9.7 Tool Definitions by Mode

```javascript
// backend/services/agent-tools.js

const TOOLS_FAST = [
    // All tools available
    { name: 'write_file', ... },
    { name: 'read_file', ... },
    { name: 'list_directory', ... },
    { name: 'run_command', ... },
    { name: 'edit_file', ... },
    { name: 'signal_completion', ... }
];

const TOOLS_PLANNING = [
    // Read-only tools
    { name: 'read_file', ... },
    { name: 'list_directory', ... },
    // Special planning tool
    {
        type: 'function',
        function: {
            name: 'create_plan',
            description: 'Create the implementation plan. MUST be called to complete planning phase.',
            parameters: {
                type: 'object',
                properties: {
                    plan_content: {
                        type: 'string',
                        description: 'Complete markdown content for PLAN.md'
                    },
                    estimated_iterations: {
                        type: 'number',
                        description: 'Estimated total iterations for execution'
                    },
                    key_files: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of main files that will be created'
                    }
                },
                required: ['plan_content', 'estimated_iterations', 'key_files']
            }
        }
    }
];

const TOOLS_EXECUTING = TOOLS_FAST; // Same as fast mode

function getToolsForMode(mode) {
    switch (mode) {
        case 'planning': return TOOLS_PLANNING;
        case 'executing': return TOOLS_EXECUTING;
        case 'fast':
        default: return TOOLS_FAST;
    }
}

module.exports = { getToolsForMode, TOOLS_FAST, TOOLS_PLANNING, TOOLS_EXECUTING };
```

### 9.8 Backend Implementation

```javascript
// backend/services/agent-loop.js (updated)

class AgentLoop extends EventEmitter {
    constructor() {
        super();
        this.mode = 'fast'; // Current mode
        this.planContent = null;
    }

    /**
     * Run in FAST mode (default)
     */
    async runFast(prompt, projectId, vmInfo, options = {}) {
        this.mode = 'fast';
        return this.run(prompt, projectId, vmInfo, {
            ...options,
            mode: 'fast'
        });
    }

    /**
     * Run in PLANNING mode - Phase A only
     * Returns the plan for user approval
     */
    async runPlanning(prompt, projectId, vmInfo, options = {}) {
        this.mode = 'planning';

        const result = await this.run(prompt, projectId, vmInfo, {
            ...options,
            mode: 'planning',
            maxIterations: 10 // Planning should be quick
        });

        // Return plan for approval
        return {
            ...result,
            planContent: this.planContent,
            requiresApproval: true,
            nextPhase: 'executing'
        };
    }

    /**
     * Run in EXECUTING mode - Phase B
     * Follows the approved plan
     */
    async runExecuting(planContent, projectId, vmInfo, options = {}) {
        this.mode = 'executing';
        this.planContent = planContent;

        return this.run(
            `Execute the approved plan. Plan content is in your system prompt.`,
            projectId,
            vmInfo,
            {
                ...options,
                mode: 'executing',
                context: { planContent }
            }
        );
    }

    /**
     * Main run method (updated)
     */
    async run(prompt, projectId, vmInfo, options = {}) {
        const {
            mode = 'fast',
            model = 'gemini-2.5-flash',
            maxIterations = MAX_ITERATIONS,
            context = {},
            onProgress
        } = options;

        // Get tools for this mode
        const tools = getToolsForMode(mode);

        // Build system prompt for this mode
        const systemPrompt = this._buildSystemPrompt(mode, context);

        // ... rest of the loop logic ...

        // Handle create_plan tool in planning mode
        if (toolCall.name === 'create_plan') {
            this.planContent = toolCall.input.plan_content;

            this._emit(onProgress, 'plan_created', {
                planContent: this.planContent,
                estimatedIterations: toolCall.input.estimated_iterations,
                keyFiles: toolCall.input.key_files
            });

            // End planning phase
            state.completed = true;
            break;
        }
    }
}
```

### 9.9 API Routes for Modes

```javascript
// backend/routes/agent.js (updated)

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
 * Planning mode - Phase A
 * Returns plan for approval
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
 * Executing mode - Phase B
 * Executes approved plan
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
```

### 9.10 Frontend Flow for Planning Mode

```tsx
// src/components/AgentPlanningFlow.tsx

import React, { useState } from 'react';
import { AgentProgress } from './AgentProgress';
import { PlanReview } from './PlanReview';

type Phase = 'idle' | 'planning' | 'review' | 'executing' | 'complete';

interface Props {
    prompt: string;
    projectId: string;
    mode: 'fast' | 'planning';
}

export const AgentPlanningFlow: React.FC<Props> = ({ prompt, projectId, mode }) => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [planContent, setPlanContent] = useState<string>('');

    const startAgent = async () => {
        if (mode === 'fast') {
            // Fast mode - go straight to execution
            setPhase('executing');
        } else {
            // Planning mode - start with planning phase
            setPhase('planning');
        }
    };

    const handlePlanCreated = (plan: string) => {
        setPlanContent(plan);
        setPhase('review');
    };

    const handleApprove = () => {
        setPhase('executing');
    };

    const handleReject = () => {
        // Go back to planning with modifications
        setPhase('planning');
    };

    return (
        <div className="agent-flow">
            {/* Phase indicator */}
            <div className="phase-indicator">
                <div className={`phase ${phase === 'planning' ? 'active' : ''}`}>
                    📋 Planning
                </div>
                <div className="phase-arrow">→</div>
                <div className={`phase ${phase === 'review' ? 'active' : ''}`}>
                    👀 Review
                </div>
                <div className="phase-arrow">→</div>
                <div className={`phase ${phase === 'executing' ? 'active' : ''}`}>
                    ⚡ Executing
                </div>
            </div>

            {/* Planning phase */}
            {phase === 'planning' && (
                <AgentProgress
                    endpoint="/agent/run/plan"
                    body={{ prompt, projectId }}
                    onComplete={(result) => handlePlanCreated(result.planContent)}
                />
            )}

            {/* Review phase */}
            {phase === 'review' && (
                <PlanReview
                    planContent={planContent}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={(newPlan) => setPlanContent(newPlan)}
                />
            )}

            {/* Executing phase */}
            {phase === 'executing' && (
                <AgentProgress
                    endpoint={mode === 'fast' ? '/agent/run/fast' : '/agent/run/execute'}
                    body={mode === 'fast'
                        ? { prompt, projectId }
                        : { planContent, projectId }
                    }
                    onComplete={() => setPhase('complete')}
                />
            )}

            {/* Complete */}
            {phase === 'complete' && (
                <div className="completion-message">
                    ✅ Project created successfully!
                </div>
            )}
        </div>
    );
};
```

### 9.11 Plan Review Component

```tsx
// src/components/PlanReview.tsx

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

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
                <h2>📋 Review Implementation Plan</h2>
                <p>Review the plan below. Approve to proceed or request changes.</p>
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
                        <button
                            onClick={() => {
                                onEdit(editedPlan);
                                setIsEditing(false);
                            }}
                            className="btn-save"
                        >
                            💾 Save Changes
                        </button>
                        <button
                            onClick={() => {
                                setEditedPlan(planContent);
                                setIsEditing(false);
                            }}
                            className="btn-cancel"
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <>
                        <button onClick={onApprove} className="btn-approve">
                            ✅ Approve & Execute
                        </button>
                        <button onClick={() => setIsEditing(true)} className="btn-edit">
                            ✏️ Edit Plan
                        </button>
                        <button onClick={onReject} className="btn-reject">
                            🔄 Re-plan
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
```

### 9.12 Mode Selection UI

```tsx
// src/components/ModeSelector.tsx

import React from 'react';

interface Props {
    mode: 'fast' | 'planning';
    onChange: (mode: 'fast' | 'planning') => void;
    disabled?: boolean;
}

export const ModeSelector: React.FC<Props> = ({ mode, onChange, disabled }) => {
    return (
        <div className="mode-selector">
            <button
                className={`mode-btn ${mode === 'fast' ? 'active' : ''}`}
                onClick={() => onChange('fast')}
                disabled={disabled}
            >
                <span className="mode-icon">⚡</span>
                <span className="mode-label">Fast Mode</span>
                <span className="mode-desc">Quick prototype, iterate rapidly</span>
            </button>

            <button
                className={`mode-btn ${mode === 'planning' ? 'active' : ''}`}
                onClick={() => onChange('planning')}
                disabled={disabled}
            >
                <span className="mode-icon">📋</span>
                <span className="mode-label">Planning Mode</span>
                <span className="mode-desc">Review plan before execution</span>
            </button>
        </div>
    );
};
```

---

## PARTE 10: SUMMARY

This specification implements an **iterative agent loop** with:

1. **Persistent Iteration**: Loop continues until completion signal or max iterations
2. **Clear Completion Criteria**: `signal_completion` tool MUST be called to end
3. **Self-Correction**: Errors trigger retry with different approach after 3 failures
4. **Real-time Progress**: SSE streaming shows every step to the user
5. **Safety Limits**: Max iterations, timeouts, stuck detection
6. **Dual Modes**:
   - **FAST MODE**: Immediate execution for simple tasks
   - **PLANNING MODE**: Two-phase approach with user approval for complex projects

### Mode Selection Quick Reference

| Mode | Use When | User Approval | Tools |
|------|----------|---------------|-------|
| **FAST** | Simple tasks, quick prototypes | No | All |
| **PLANNING** | Complex projects, critical changes | Yes (between phases) | Read-only → All |

### Key Insight

> **Iteration > Perfection**: Let the loop refine the work rather than trying to generate perfect output in one shot.

> **Planning Mode**: For complex projects, spending time planning upfront saves iterations during execution and ensures user alignment.
