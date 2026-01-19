// RELOAD_CHECK_1768252870
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
const { getSystemPrompt } = require('./system-prompt'); // Unified system prompt
const { globSearch } = require('./tools/glob');
const { grepSearch } = require('./tools/grep');
const { launchSubAgent } = require('./tools/task');
const { todoWrite } = require('./tools/todo-write');
const { askUserQuestion } = require('./tools/ask-user-question');
const { enterPlanMode } = require('./tools/enter-plan-mode');
const { exitPlanMode } = require('./tools/exit-plan-mode');
const { webSearch } = require('./tools/web-search');
const { executeSkill } = require('./tools/skill');
const { notebookEdit } = require('./tools/notebook-edit');
const { killShell } = require('./tools/kill-shell');
const { getTaskOutput } = require('./tools/task-output');
const { getIDEDiagnostics } = require('./tools/mcp-ide-diagnostics');
const { executeCode } = require('./tools/mcp-ide-execute-code');

// Configuration
const MAX_ITERATIONS = 50;
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
    constructor(projectId, mode = 'fast', model = DEFAULT_AI_MODEL, conversationHistory = []) {
        this.projectId = projectId;
        this.selectedModel = model;  // Model selected by user
        this.mode = mode;
        this.iteration = 0;
        this.isComplete = false;
        this.filesCreated = [];
        this.filesModified = [];
        this.lastPlan = null;
        this.vmInfo = null;
        this.projectContext = null;
        this.lastToolCall = null;  // Track last tool+params used (JSON string)
        this.sameToolCount = 0;    // Count consecutive same tool calls
        this.iterationsWithoutTools = 0;
        this.consecutiveFailedWebSearches = 0; // Track failed web searches
        this.consecutiveSuccessfulWebSearches = 0; // Track successful web searches
        this.conversationHistory = conversationHistory; // Previous conversation messages
    }

    /**
     * Estimate token count from text (rough approximation: 1 token ≈ 4 characters)
     */
    _estimateTokens(text) {
        if (!text) return 0;
        return Math.ceil(text.length / 4);
    }

    /**
     * Calculate total tokens in conversation history
     */
    _calculateHistoryTokens(messages) {
        return messages.reduce((total, msg) => {
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            return total + this._estimateTokens(content);
        }, 0);
    }

    /**
     * Summarize old messages to keep context within token limits
     * Claude Code style: automatic summarization when approaching context limit
     */
    async _summarizeHistory(messages, maxTokens = 100000) {
        const totalTokens = this._calculateHistoryTokens(messages);

        // If under 50% of limit, no need to summarize
        if (totalTokens < maxTokens * 0.5) {
            console.log(`[AgentLoop] History tokens: ${totalTokens}/${maxTokens} - no summarization needed`);
            return messages;
        }

        console.log(`[AgentLoop] History tokens: ${totalTokens}/${maxTokens} - applying summarization`);

        // Keep last 10 messages intact, summarize older ones
        const recentMessages = messages.slice(-10);
        const oldMessages = messages.slice(0, -10);

        if (oldMessages.length === 0) {
            return messages; // All messages are recent
        }

        // Build summary of old messages
        const summaryText = oldMessages
            .map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content.substring(0, 200) : JSON.stringify(msg.content).substring(0, 200)}`)
            .join('\n');

        const summarizedMessage = {
            role: 'assistant',
            content: `[Previous conversation summary - ${oldMessages.length} messages]:\n${summaryText}`
        };

        const summarizedHistory = [summarizedMessage, ...recentMessages];
        const newTotalTokens = this._calculateHistoryTokens(summarizedHistory);

        console.log(`[AgentLoop] Summarized ${oldMessages.length} messages. Tokens: ${totalTokens} → ${newTotalTokens}`);

        return summarizedHistory;
    }

    /**
     * Initialize the agent loop
     */
    async initialize() {
        // Get or create VM for this project
        this.vmInfo = await workspaceOrchestrator.getOrCreateVM(this.projectId);

        // Check if project directory has files (including in subdirectories)
        const fileCheckResult = await flyService.exec(
            this.vmInfo.agentUrl,
            '[ "$(ls -A /home/coder/project)" ] && echo "FOUND" || echo "EMPTY"',
            '/home/coder/project',
            this.vmInfo.machineId,
            5000,
            true // silent
        );

        const hasFiles = fileCheckResult.stdout.includes('FOUND');
        if (!hasFiles) {
            console.log(`⚠️ [AgentLoop] Project directory is empty on VM ${this.vmInfo.machineId}, forcing sync...`);
            await workspaceOrchestrator.forceSync(this.projectId, this.vmInfo);
        }

        // Load project context and files
        const [context, filesResult] = await Promise.all([
            this._loadProjectContext(),
            workspaceOrchestrator.listFiles(this.projectId)
        ]);

        this.projectContext = context;
        this.projectFiles = filesResult?.files || [];

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
     * Build unified system prompt using Claude Code official prompt
     */
    _buildSystemPrompt() {
        // Build project context string if available
        let projectContext = '';
        if (this.projectContext) {
            projectContext = `
## Project Context (from .drape/project.json)
- Name: ${this.projectContext.name}
- Description: "${this.projectContext.description}"
- Industry: ${this.projectContext.industry || 'general'}
- Features: ${this.projectContext.features?.join(', ') || 'none'}
- Technology: ${this.projectContext.technology || 'React + Vite'}
`;
        }

        return getSystemPrompt({
            projectContext,
            projectFiles: this.projectFiles
        });
    }

    /**
     * Execute a tool on the VM
     */
    async _executeTool(toolName, input) {
        const { agentUrl, machineId } = this.vmInfo;

        // Clean tool name from potential model prefixes (e.g., 'default_api:')
        const cleanName = toolName.replace(/^.*:/, '');

        switch (cleanName) {
            case 'write_file': {
                const filePath = input.path.replace(/^\.\//, '');
                // Use orchestrator to save to Firebase AND sync to VM with file watcher notification
                const result = await workspaceOrchestrator.writeFile(this.projectId, filePath, input.content);
                if (!result.success) {
                    return { success: false, error: 'Write failed' };
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

                // Generate diff
                const oldContent = readResult.stdout;
                const newContent = oldContent.replace(input.search, input.replace);

                // Find the line numbers where the change occurred
                const oldLines = oldContent.split('\n');
                const newLines = newContent.split('\n');

                let diffLines = [];
                let lineNum = 1;
                for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
                    if (oldLines[i] !== newLines[i]) {
                        // Show context (2 lines before and after)
                        const startIdx = Math.max(0, i - 2);
                        const endIdx = Math.min(newLines.length, i + 3);

                        for (let j = startIdx; j < endIdx; j++) {
                            const lineNumber = j + 1;
                            if (j < oldLines.length && oldLines[j] !== newLines[j]) {
                                // Line was removed
                                diffLines.push(`- ${lineNumber}: ${oldLines[j]}`);
                            }
                            if (j < newLines.length && (j >= oldLines.length || oldLines[j] !== newLines[j])) {
                                // Line was added
                                diffLines.push(`+ ${lineNumber}: ${newLines[j]}`);
                            } else if (oldLines[j] === newLines[j]) {
                                // Context line (unchanged)
                                diffLines.push(`  ${lineNumber}: ${newLines[j]}`);
                            }
                        }
                        break;
                    }
                }

                // Use orchestrator to save to Firebase AND sync to VM with file watcher notification
                const result = await workspaceOrchestrator.writeFile(this.projectId, filePath, newContent);
                if (!result.success) {
                    return { success: false, error: 'Failed to write edited file' };
                }
                this.filesModified.push(filePath);
                return {
                    success: true,
                    content: diffLines.length > 0 ? diffLines.join('\n') : 'File edited successfully'
                };
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

            case 'glob_search': {
                try {
                    const result = await globSearch(
                        input.pattern,
                        input.path || '.',
                        input.limit || 100
                    );
                    return {
                        success: true,
                        files: result.files,
                        count: result.count,
                        total: result.total
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'grep_search': {
                try {
                    const result = await grepSearch(input.pattern, {
                        searchPath: input.search_path || '.',
                        glob: input.glob,
                        type: input.type,
                        outputMode: input.output_mode || 'files_with_matches',
                        caseInsensitive: input.case_insensitive,
                        contextBefore: input.context_before,
                        contextAfter: input.context_after,
                        contextAround: input.context_around,
                        showLineNumbers: input.show_line_numbers !== false,
                        headLimit: input.head_limit || 0,
                        offset: input.offset || 0,
                        multiline: input.multiline || false
                    });
                    return {
                        success: true,
                        results: result.results,
                        count: result.count
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'todo_write': {
                try {
                    const result = todoWrite(input.todos);
                    // Todos will be sent via SSE in the main loop
                    this.currentTodos = input.todos;
                    return { success: true, todos: input.todos };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'ask_user_question': {
                try {
                    const result = askUserQuestion(input.questions, input.userAnswers);
                    // Questions will be sent via SSE in the main loop
                    this.pendingQuestion = result;
                    return {
                        success: true,
                        answers: input.userAnswers || {}
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'launch_sub_agent': {
                try {
                    // Launch sub-agent with the provided parameters
                    const generator = launchSubAgent(
                        input.subagent_type,
                        input.prompt,
                        input.description,
                        input.model || this.selectedModel,
                        this.projectId,
                        input.run_in_background || false,
                        null
                    );

                    // Consume the generator and collect result
                    let finalResult = null;
                    for await (const event of generator) {
                        if (event.type === 'task_complete') {
                            finalResult = event.result;
                        }
                    }

                    return {
                        success: true,
                        result: finalResult || 'Sub-agent completed successfully',
                        summary: finalResult
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'enter_plan_mode': {
                try {
                    const result = enterPlanMode();
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'exit_plan_mode': {
                try {
                    const result = exitPlanMode(input);
                    if (result.planReady) {
                        this.lastPlan = result.plan;
                    }
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'web_search': {
                try {
                    const result = await webSearch(
                        input.query,
                        input.allowed_domains || [],
                        input.blocked_domains || [],
                        this.projectId
                    );
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'execute_skill': {
                try {
                    const result = await executeSkill(input.skill, input.args);
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'notebook_edit': {
                try {
                    const result = await notebookEdit(input);
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'kill_shell': {
                try {
                    const result = killShell(input.shell_id);
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'get_task_output': {
                try {
                    const result = await getTaskOutput(
                        input.task_id,
                        input.block !== false,
                        input.timeout || 30000
                    );
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'mcp__ide__getDiagnostics': {
                try {
                    const result = await getIDEDiagnostics(input.uri);
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            case 'mcp__ide__executeCode': {
                try {
                    const result = await executeCode(input.code, input.kernel_id);
                    return result;
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }

            default:
                return { success: false, error: `Unknown tool: ${toolName}` };
        }
    }

    /**
     * Run the agent loop with SSE streaming
     * @param {string|object} prompt - Text prompt or object with {text, images}
     */
    async *run(prompt, images = []) {
        console.log(`\n🤖 [AgentLoop] Starting ${this.mode} mode for project ${this.projectId}`);
        if (images && images.length > 0) {
            console.log(`📷 [AgentLoop] Multimodal mode: ${images.length} images attached`);
        }

        // Send start event
        yield {
            type: 'start',
            mode: this.mode,
            projectId: this.projectId,
            hasContext: !!this.projectContext,
            timestamp: new Date().toISOString()
        };

        // Get AI provider using selected model
        const { provider, modelId } = getProviderForModel(this.selectedModel);
        if (!provider.client && provider.isAvailable()) {
            await provider.initialize();
        }

        // Build messages - include conversation history if available
        const systemPrompt = this._buildSystemPrompt();

        // Summarize history if it's getting too long (Claude Code style)
        const historyToUse = await this._summarizeHistory(
            this.conversationHistory.filter(msg => msg.role !== 'system'),
            100000 // 100k tokens max before summarization
        );

        // Build current message (text + images if present)
        let currentMessage;
        if (images && images.length > 0) {
            console.log(`[AgentLoop] Building multimodal message with ${images.length} images`);
            console.log(`[AgentLoop] Image details:`, images.map(img => ({
                hasBase64: !!img.base64,
                base64Length: img.base64?.length || 0,
                type: img.type
            })));

            // Multimodal message with images
            const imageContent = images.map(img => ({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: img.type || 'image/jpeg',
                    data: img.base64
                }
            }));

            console.log(`[AgentLoop] Created ${imageContent.length} image content items`);

            currentMessage = {
                role: 'user',
                content: [
                    { type: 'text', text: prompt || 'Analizza queste immagini' },
                    ...imageContent
                ]
            };

            console.log(`[AgentLoop] Final message content parts: ${currentMessage.content.length}`);
        } else {
            // Text-only message
            currentMessage = { role: 'user', content: prompt };
        }

        const messages = [
            // Add (possibly summarized) conversation history first
            ...historyToUse,
            // Then add current message (with images if present)
            currentMessage
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
                    temperature: 0.1,  // Low temp for deterministic agent behavior
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

                        yield {
                            type: 'tool_input',
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

                            // Emit todo_update event if todos were updated
                            if (toolName === 'todo_write' && this.currentTodos) {
                                yield {
                                    type: 'todo_update',
                                    todos: this.currentTodos,
                                    timestamp: new Date().toISOString()
                                };
                            }

                            // Emit ask_user_question event if question was set
                            if (toolName === 'ask_user_question' && this.pendingQuestion) {
                                yield {
                                    type: 'ask_user_question',
                                    questions: this.pendingQuestion.questions,
                                    timestamp: new Date().toISOString()
                                };
                            }

                            toolResults.push({
                                tool_use_id: toolCall.id,
                                content: JSON.stringify(result)
                            });

                            // Track web searches
                            if (toolName === 'web_search') {
                                if (result.count === 0) {
                                    // Failed search
                                    this.consecutiveFailedWebSearches++;
                                    this.consecutiveSuccessfulWebSearches = 0;
                                    console.log(`[AgentLoop] Failed web search ${this.consecutiveFailedWebSearches}/5: "${toolInput.query}"`);

                                    // After 5 consecutive failed searches, force completion
                                    if (this.consecutiveFailedWebSearches >= 5) {
                                        console.log('[AgentLoop] Stopping agent: 5 consecutive failed web searches');
                                        this.isComplete = true;
                                        yield {
                                            type: 'complete',
                                            summary: 'Unable to find the requested information online after multiple search attempts. Please try rephrasing your search query or providing more specific details.',
                                            filesCreated: this.filesCreated,
                                            filesModified: this.filesModified,
                                            iterations: this.iteration,
                                            timestamp: new Date().toISOString()
                                        };
                                        return;
                                    }
                                } else {
                                    // Successful search
                                    this.consecutiveFailedWebSearches = 0;
                                    this.consecutiveSuccessfulWebSearches++;
                                    console.log(`[AgentLoop] Successful web search ${this.consecutiveSuccessfulWebSearches}/3: "${toolInput.query}" (${result.count} results)`);

                                    // After 3 consecutive successful searches, force completion
                                    if (this.consecutiveSuccessfulWebSearches >= 3) {
                                        console.log('[AgentLoop] Stopping agent: 3 consecutive successful web searches - should have enough information');
                                        this.isComplete = true;
                                        yield {
                                            type: 'complete',
                                            summary: 'Please provide your answer based on the search results found.',
                                            filesCreated: this.filesCreated,
                                            filesModified: this.filesModified,
                                            iterations: this.iteration,
                                            timestamp: new Date().toISOString()
                                        };
                                        return;
                                    }
                                }
                            } else {
                                // Reset counters if using a different tool
                                this.consecutiveFailedWebSearches = 0;
                                this.consecutiveSuccessfulWebSearches = 0;
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

                    // Track consecutive same tool calls to prevent infinite loops
                    // Compare both tool name AND parameters to detect true loops
                    const firstToolCall = toolCalls[0];
                    const currentToolSignature = JSON.stringify({
                        name: firstToolCall?.name,
                        input: firstToolCall?.input
                    });

                    if (currentToolSignature === this.lastToolCall) {
                        this.sameToolCount++;
                    } else {
                        this.sameToolCount = 1; // Reset if different tool or different params
                        this.lastToolCall = currentToolSignature;
                    }

                    // Add assistant message with tool calls
                    const assistantContent = [];
                    if (responseText) assistantContent.push({ type: 'text', text: responseText });

                    toolCalls.forEach(tc => {
                        assistantContent.push({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.name,
                            input: tc.input,
                            thoughtSignature: tc.thoughtSignature
                        });
                    });

                    messages.push({ role: 'assistant', content: assistantContent });

                    // Add tool results message
                    const toolResultContent = toolResults.map(tr => ({
                        type: 'tool_result',
                        tool_use_id: tr.tool_use_id,
                        content: tr.content
                    }));

                    messages.push({ role: 'user', content: toolResultContent });

                    // Force AI to respond if it's calling the EXACT same tool with EXACT same params too many times
                    if (this.sameToolCount >= 3) {
                        const toolName = firstToolCall?.name;
                        messages.push({
                            role: 'user',
                            content: `SYSTEM: You have called the "${toolName}" tool with the same parameters ${this.sameToolCount} times in a row, which appears to be a loop. You MUST now respond to the user explaining what you found. Do NOT call "${toolName}" with the same parameters again. Either use different parameters or respond with your findings.`
                        });
                    }

                } else if (responseText.trim()) {
                    // AI responded with text only (no tools)
                    // Reset same tool counter since we got a text response
                    this.sameToolCount = 0;
                    this.lastToolCall = null;

                    messages.push({ role: 'assistant', content: responseText });

                    yield {
                        type: 'message',
                        content: responseText,
                        timestamp: new Date().toISOString()
                    };

                    // Increment counter for iterations without tools
                    this.iterationsWithoutTools++;

                    // If agent responded without tools, auto-complete (avoid multiple responses)
                    if (this.iterationsWithoutTools >= 1) {
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
                } else {
                    // No tool calls AND no text response - this is an error
                    // The AI must respond when it stops using tools
                    yield {
                        type: 'error',
                        error: 'AI did not provide a response. An AI must always respond to the user when it stops using tools.',
                        timestamp: new Date().toISOString()
                    };

                    // Force completion to avoid infinite loop
                    this.isComplete = true;
                    yield {
                        type: 'complete',
                        summary: 'Task completed without AI response',
                        filesCreated: this.filesCreated,
                        filesModified: this.filesModified,
                        iterations: this.iteration,
                        timestamp: new Date().toISOString()
                    };
                    break;
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
// Force reload: 1768252494
// FINAL_LOAD_1768253553
