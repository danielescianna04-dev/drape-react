/**
 * Agent Loop Service - Ralph Loop Implementation
 *
 * Implements the autonomous agent loop with:
 * - Fast mode: Execute immediately, iterate on errors
 * - Planning mode: Create plan, wait for approval, then execute
 * - SSE streaming for real-time progress
 * - Context awareness via .drape/project.json
 * - Max iterations and completion detection
 *
 * "Iteration > Perfection" - Ralph Wiggum Principle
 */

const flyService = require('./fly-service');
const workspaceOrchestrator = require('./workspace-orchestrator');
const { getProviderForModel } = require('./ai-providers');
const { DEFAULT_AI_MODEL } = require('../utils/constants');
const TOOLS_CONFIG = require('./agent-tools.json');

// Configuration
const MAX_ITERATIONS = 50;
const MAX_SAME_ERROR = 3;
const TOOL_TIMEOUT = 60000; // 60 seconds

// Convert tools from OpenAI format to standard format
function convertToolsFormat(tools) {
    return tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
    }));
}

// Mode-specific tool configurations
const TOOLS_FAST = convertToolsFormat(TOOLS_CONFIG.tools);

const TOOLS_PLANNING = convertToolsFormat(
    TOOLS_CONFIG.tools.filter(t =>
        ['read_file', 'list_directory'].includes(t.function.name)
    )
).concat([{
    name: 'create_plan',
    description: 'Create a step-by-step execution plan for approval',
    input_schema: {
        type: 'object',
        properties: {
            title: { type: 'string', description: 'Plan title' },
            steps: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        step: { type: 'number' },
                        action: { type: 'string' },
                        files: { type: 'array', items: { type: 'string' } },
                        description: { type: 'string' }
                    }
                },
                description: 'List of steps to execute'
            },
            estimated_files: { type: 'number', description: 'Number of files to create/modify' },
            technologies: { type: 'array', items: { type: 'string' }, description: 'Technologies used' }
        },
        required: ['title', 'steps']
    }
}]);

/**
 * Agent Loop Class
 * Manages the execution of AI tasks with tools
 */
class AgentLoop {
    constructor(projectId, mode = 'fast') {
        this.projectId = projectId;
        this.mode = mode;
        this.iteration = 0;
        this.isComplete = false;
        this.errorCounts = new Map();
        this.filesCreated = [];
        this.filesModified = [];
        this.lastPlan = null;
        this.vmInfo = null;
        this.projectContext = null;
        this.iterationsWithoutTools = 0;
    }

    /**
     * Initialize the agent loop
     */
    async initialize() {
        // Get or create VM for this project
        this.vmInfo = await workspaceOrchestrator.getOrCreateVM(this.projectId);

        // Load project context
        this.projectContext = await this._loadProjectContext();

        return this;
    }

    /**
     * Load project context from .drape/project.json
     */
    async _loadProjectContext() {
        try {
            const result = await flyService.exec(
                this.vmInfo.agentUrl,
                'cat /home/coder/project/.drape/project.json',
                '/home/coder/project',
                this.vmInfo.machineId,
                5000
            );

            if (result.exitCode === 0 && result.stdout.trim()) {
                const context = JSON.parse(result.stdout);
                console.log(`📋 [AgentLoop] Loaded project context: ${context.name} (${context.industry})`);
                return context;
            }
        } catch (e) {
            console.log(`⚠️ [AgentLoop] No project context found: ${e.message}`);
        }
        return null;
    }

    /**
     * Build unified system prompt
     */
    _buildSystemPrompt() {
        let prompt = `You are DRAPE AI, an autonomous development agent inside the Drape IDE.

## PRIMA DI TUTTO: CONTESTO

${this.projectContext ? `
## CONTESTO PROGETTO CARICATO
- Nome: ${this.projectContext.name}
- Descrizione: "${this.projectContext.description}"
- Industry: ${this.projectContext.industry || 'general'}
- Features: ${this.projectContext.features?.join(', ') || 'nessuna'}
- Tecnologia: ${this.projectContext.technology || 'React + Vite'}

USA QUESTO CONTESTO per tutte le risposte e il codice generato.
` : `
## NESSUN CONTESTO - CREALO!
Se stai creando un nuovo progetto, PRIMA crea .drape/project.json con:
{
  "name": "nome-progetto",
  "description": "descrizione utente",
  "technology": "react",
  "industry": "vape-shop|restaurant|e-commerce|portfolio|blog|general",
  "features": ["cart", "products", ...],
  "createdAt": "timestamp"
}
`}

## TOOLS DISPONIBILI
- write_file: Crea/sovrascrivi file
- read_file: Leggi file
- list_directory: Esplora progetto
- run_command: Comandi shell (npm, git)
- edit_file: Modifica file (search/replace)
- signal_completion: OBBLIGATORIO quando finisci!

## REGOLE CONTENUTO - CRITICHE!

❌ MAI USARE:
- "Product 1", "Lorem ipsum", "Description here"
- "Company Name", "Feature 1", "https://example.com"

✅ SEMPRE contenuto realistico per industry:

VAPE SHOP:
- Prodotti: "Elf Bar BC5000", "SMOK Nord 5", "Vaporesso XROS 3"
- Categorie: "Dispositivi", "Liquidi", "Accessori", "Pod Mod"
- Prezzi: €12.99, €24.50, €34.99
- Design: Sfondo scuro (#0d0d0d), neon (#00ff88, #ff00ff)

RISTORANTE:
- Piatti italiani reali con descrizioni
- Sezioni: Antipasti, Primi, Secondi, Dolci
- Design: Toni caldi, elegante

E-COMMERCE:
- Prodotti realistici per categoria
- Carrello, filtri, ordinamento

PORTFOLIO:
- Progetti reali, tecnologie, risultati

## STRUTTURA PROGETTO (React + Vite)

OBBLIGATORIO:
1. .drape/project.json - SEMPRE PRIMA!
2. index.html - alla ROOT (NON in public/)
3. package.json - react, react-dom, react-router-dom
4. vite.config.js - con host: '0.0.0.0', port: 3000
5. src/main.jsx, src/App.jsx, src/index.css

## FLUSSO

NUOVO PROGETTO:
1. Crea .drape/project.json
2. Crea package.json, vite.config.js, index.html
3. Crea src/main.jsx, App.jsx, index.css
4. Crea componenti con CONTENUTO REALISTICO
5. npm install
6. signal_completion

MODIFICHE:
1. Leggi .drape/project.json (se esiste)
2. Modifica mantenendo lo stile
3. signal_completion

## PRINCIPIO RALPH WIGGUM
"Iteration > Perfection" - Muoviti veloce, correggi errori, itera.
`;

        return prompt;
    }

    /**
     * Execute a tool on the VM
     */
    async _executeTool(toolName, input) {
        const { agentUrl, machineId } = this.vmInfo;

        switch (toolName) {
            case 'write_file': {
                const filePath = input.path.replace(/^\.\//, '');
                const cmd = `mkdir -p "$(dirname "/home/coder/project/${filePath}")" && cat > "/home/coder/project/${filePath}" << 'DRAPE_EOF'
${input.content}
DRAPE_EOF`;
                const result = await flyService.exec(agentUrl, cmd, '/home/coder/project', machineId, TOOL_TIMEOUT);
                if (result.exitCode !== 0) {
                    return { success: false, error: result.stderr || 'Write failed' };
                }
                this.filesCreated.push(filePath);
                return { success: true, message: `Written ${filePath} (${input.content.length} bytes)` };
            }

            case 'read_file': {
                const filePath = input.path.replace(/^\.\//, '');
                const result = await flyService.exec(agentUrl, `cat "/home/coder/project/${filePath}"`, '/home/coder/project', machineId, 10000);
                if (result.exitCode !== 0) {
                    return { success: false, error: `File not found: ${filePath}` };
                }
                return { success: true, content: result.stdout };
            }

            case 'list_directory': {
                const dirPath = input.path === '.' ? '/home/coder/project' : `/home/coder/project/${input.path}`;
                const result = await flyService.exec(agentUrl, `ls -la "${dirPath}"`, '/home/coder/project', machineId, 10000);
                if (result.exitCode !== 0) {
                    return { success: false, error: result.stderr };
                }
                return { success: true, content: result.stdout };
            }

            case 'run_command': {
                const timeout = input.timeout_ms || TOOL_TIMEOUT;
                const result = await flyService.exec(agentUrl, input.command, '/home/coder/project', machineId, timeout);
                return {
                    success: result.exitCode === 0,
                    exitCode: result.exitCode,
                    stdout: result.stdout,
                    stderr: result.stderr
                };
            }

            case 'edit_file': {
                const filePath = input.path.replace(/^\.\//, '');
                // Read the file
                const readResult = await flyService.exec(agentUrl, `cat "/home/coder/project/${filePath}"`, '/home/coder/project', machineId, 10000);
                if (readResult.exitCode !== 0) {
                    return { success: false, error: `Cannot read file: ${readResult.stderr}` };
                }

                // Check if search text exists
                if (!readResult.stdout.includes(input.search)) {
                    return { success: false, error: 'Search text not found in file' };
                }

                // Replace and write
                const newContent = readResult.stdout.replace(input.search, input.replace);
                const writeCmd = `cat > "/home/coder/project/${filePath}" << 'DRAPE_EOF'
${newContent}
DRAPE_EOF`;
                const writeResult = await flyService.exec(agentUrl, writeCmd, '/home/coder/project', machineId, TOOL_TIMEOUT);
                if (writeResult.exitCode !== 0) {
                    return { success: false, error: writeResult.stderr };
                }
                this.filesModified.push(filePath);
                return { success: true, message: `Edited ${filePath}` };
            }

            case 'signal_completion': {
                this.isComplete = true;
                return {
                    success: true,
                    completed: true,
                    summary: input.summary,
                    files_created: input.files_created || this.filesCreated,
                    files_modified: input.files_modified || this.filesModified
                };
            }

            case 'create_plan': {
                this.lastPlan = input;
                return { success: true, plan: input };
            }

            default:
                return { success: false, error: `Unknown tool: ${toolName}` };
        }
    }

    /**
     * Run the agent loop with SSE streaming
     */
    async *run(prompt) {
        console.log(`\n🤖 [AgentLoop] Starting ${this.mode} mode for project ${this.projectId}`);

        // Send start event
        yield {
            type: 'start',
            mode: this.mode,
            projectId: this.projectId,
            hasContext: !!this.projectContext,
            timestamp: new Date().toISOString()
        };

        // Get AI provider
        const { provider, modelId } = getProviderForModel(DEFAULT_AI_MODEL);
        if (!provider.client && provider.isAvailable()) {
            await provider.initialize();
        }

        // Build messages
        const systemPrompt = this._buildSystemPrompt();
        const messages = [
            { role: 'user', content: prompt }
        ];

        // Get tools based on mode
        const tools = this.mode === 'planning' ? TOOLS_PLANNING : TOOLS_FAST;

        // Main loop
        while (!this.isComplete && this.iteration < MAX_ITERATIONS) {
            this.iteration++;

            yield {
                type: 'iteration_start',
                iteration: this.iteration,
                maxIterations: MAX_ITERATIONS,
                timestamp: new Date().toISOString()
            };

            yield { type: 'thinking', timestamp: new Date().toISOString() };

            try {
                // Call AI
                let responseText = '';
                let toolCalls = [];

                const stream = provider.chatStream(messages, {
                    model: modelId,
                    maxTokens: 8000,
                    temperature: 0.7,
                    systemPrompt,
                    tools
                });

                for await (const chunk of stream) {
                    if (chunk.type === 'text') {
                        responseText += chunk.text;
                    } else if (chunk.type === 'tool_use') {
                        toolCalls.push(chunk);
                    } else if (chunk.type === 'done') {
                        responseText = chunk.fullText || responseText;
                        toolCalls = chunk.toolCalls || toolCalls;
                    }
                }

                // Process tool calls
                if (toolCalls.length > 0) {
                    // Reset counter since agent is using tools
                    this.iterationsWithoutTools = 0;
                    const toolResults = [];

                    for (const toolCall of toolCalls) {
                        const toolName = toolCall.name;
                        const toolInput = toolCall.input;

                        yield {
                            type: 'tool_start',
                            tool: toolName,
                            input: toolInput,
                            timestamp: new Date().toISOString()
                        };

                        try {
                            const result = await this._executeTool(toolName, toolInput);

                            yield {
                                type: 'tool_complete',
                                tool: toolName,
                                success: result.success,
                                result: result,
                                timestamp: new Date().toISOString()
                            };

                            toolResults.push({
                                tool_use_id: toolCall.id,
                                content: JSON.stringify(result)
                            });

                            // Track errors for same-error detection
                            if (!result.success) {
                                const errorKey = `${toolName}:${result.error}`;
                                const count = (this.errorCounts.get(errorKey) || 0) + 1;
                                this.errorCounts.set(errorKey, count);

                                if (count >= MAX_SAME_ERROR) {
                                    yield {
                                        type: 'error',
                                        error: `Same error repeated ${count} times. Trying different approach.`,
                                        timestamp: new Date().toISOString()
                                    };
                                }
                            }

                            // Check for completion
                            if (result.completed) {
                                yield {
                                    type: 'complete',
                                    summary: result.summary,
                                    filesCreated: result.files_created || this.filesCreated,
                                    filesModified: result.files_modified || this.filesModified,
                                    iterations: this.iteration,
                                    timestamp: new Date().toISOString()
                                };
                                return;
                            }

                            // Check for plan created (planning mode)
                            if (result.plan) {
                                yield {
                                    type: 'plan_ready',
                                    plan: result.plan,
                                    planContent: this._formatPlan(result.plan),
                                    timestamp: new Date().toISOString()
                                };
                                return;
                            }

                        } catch (toolError) {
                            yield {
                                type: 'tool_error',
                                tool: toolName,
                                error: toolError.message,
                                timestamp: new Date().toISOString()
                            };

                            toolResults.push({
                                tool_use_id: toolCall.id,
                                content: JSON.stringify({ success: false, error: toolError.message })
                            });
                        }
                    }

                    // Add assistant message with tool calls and results to history
                    messages.push({ role: 'assistant', content: responseText, tool_calls: toolCalls });
                    messages.push({ role: 'tool', content: JSON.stringify(toolResults) });

                } else if (responseText.trim()) {
                    // AI responded with text only (no tools)
                    messages.push({ role: 'assistant', content: responseText });

                    yield {
                        type: 'message',
                        content: responseText,
                        timestamp: new Date().toISOString()
                    };

                    // Increment counter for iterations without tools
                    this.iterationsWithoutTools++;

                    // If agent responded without tools for 2 iterations, auto-complete
                    if (this.iterationsWithoutTools >= 2) {
                        this.isComplete = true;
                        yield {
                            type: 'complete',
                            summary: responseText || 'Conversation completed',
                            filesCreated: this.filesCreated,
                            filesModified: this.filesModified,
                            iterations: this.iteration,
                            timestamp: new Date().toISOString()
                        };
                        break;
                    }

                    // Check for completion markers in text
                    if (responseText.includes('<completion>') || responseText.includes('TASK_COMPLETE')) {
                        this.isComplete = true;
                        yield {
                            type: 'complete',
                            summary: responseText,
                            filesCreated: this.filesCreated,
                            filesModified: this.filesModified,
                            iterations: this.iteration,
                            timestamp: new Date().toISOString()
                        };
                        return;
                    }
                }

            } catch (aiError) {
                yield {
                    type: 'error',
                    error: aiError.message,
                    timestamp: new Date().toISOString()
                };

                // Add error to messages so AI knows about it
                messages.push({
                    role: 'user',
                    content: `Error occurred: ${aiError.message}. Please continue or handle this error.`
                });
            }
        }

        // Max iterations reached
        if (!this.isComplete) {
            yield {
                type: 'fatal_error',
                error: `Max iterations (${MAX_ITERATIONS}) reached without completion`,
                iterations: this.iteration,
                timestamp: new Date().toISOString()
            };
        }

        yield { type: 'done', timestamp: new Date().toISOString() };
    }

    /**
     * Format plan for display
     */
    _formatPlan(plan) {
        let content = `# ${plan.title}\n\n`;
        content += `**Estimated Files:** ${plan.estimated_files || plan.steps.length}\n`;
        content += `**Technologies:** ${plan.technologies?.join(', ') || 'N/A'}\n\n`;
        content += `## Steps\n\n`;

        for (const step of plan.steps) {
            content += `### Step ${step.step}: ${step.action}\n`;
            content += `${step.description}\n`;
            if (step.files?.length) {
                content += `**Files:** ${step.files.join(', ')}\n`;
            }
            content += '\n';
        }

        return content;
    }
}

/**
 * Save project context to .drape/project.json
 */
async function saveProjectContext(projectId, contextData) {
    try {
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);

        const context = {
            name: contextData.name,
            description: contextData.description,
            technology: contextData.technology || 'react',
            industry: detectIndustry(contextData.description),
            createdAt: new Date().toISOString(),
            features: extractFeatures(contextData.description)
        };

        const cmd = `mkdir -p /home/coder/project/.drape && cat > /home/coder/project/.drape/project.json << 'DRAPE_EOF'
${JSON.stringify(context, null, 2)}
DRAPE_EOF`;

        await flyService.exec(
            vmInfo.agentUrl,
            cmd,
            '/home/coder/project',
            vmInfo.machineId,
            10000
        );

        console.log(`✅ [AgentLoop] Saved project context for ${projectId}`);
        return context;
    } catch (e) {
        console.error(`❌ [AgentLoop] Failed to save project context: ${e.message}`);
        return null;
    }
}

/**
 * Detect industry from description
 */
function detectIndustry(description) {
    if (!description) return 'general';
    const lower = description.toLowerCase();

    if (lower.includes('vape') || lower.includes('smoke') || lower.includes('svapo') || lower.includes('sigaretta')) {
        return 'vape-shop';
    }
    if (lower.includes('ristorante') || lower.includes('restaurant') || lower.includes('menu') || lower.includes('pizzeria')) {
        return 'restaurant';
    }
    if (lower.includes('e-commerce') || lower.includes('shop') || lower.includes('negozio') || lower.includes('carrello') || lower.includes('prodotti')) {
        return 'e-commerce';
    }
    if (lower.includes('portfolio') || lower.includes('cv') || lower.includes('resume') || lower.includes('freelancer')) {
        return 'portfolio';
    }
    if (lower.includes('blog') || lower.includes('articoli')) {
        return 'blog';
    }
    if (lower.includes('landing') || lower.includes('startup') || lower.includes('saas')) {
        return 'landing-page';
    }

    return 'general';
}

/**
 * Extract features from description
 */
function extractFeatures(description) {
    if (!description) return [];
    const lower = description.toLowerCase();
    const features = [];

    if (lower.includes('carrello') || lower.includes('cart')) features.push('cart');
    if (lower.includes('prodotti') || lower.includes('products')) features.push('products');
    if (lower.includes('login') || lower.includes('auth')) features.push('authentication');
    if (lower.includes('pagamenti') || lower.includes('payment')) features.push('payments');
    if (lower.includes('contatti') || lower.includes('contact')) features.push('contact-form');
    if (lower.includes('gallery') || lower.includes('galleria')) features.push('gallery');
    if (lower.includes('search') || lower.includes('cerca')) features.push('search');
    if (lower.includes('filtri') || lower.includes('filter')) features.push('filters');

    return features;
}

module.exports = {
    AgentLoop,
    saveProjectContext,
    detectIndustry,
    extractFeatures,
    MAX_ITERATIONS,
    TOOLS_FAST,
    TOOLS_PLANNING
};
