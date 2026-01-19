/**
 * AI Chat Routes
 * AI-powered chat with tool support
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, schema, commonSchemas } = require('../middleware/validator');
const { getProviderForModel, standardTools, getAvailableModels } = require('../services/ai-providers');
const { executeTool, createContext } = require('../services/tool-executor');
const { AI_MODELS, DEFAULT_AI_MODEL } = require('../utils/constants');
const contextService = require('../services/context-service'); // Import Singleton
const storageService = require('../services/storage-service'); // For reading project files
const { getSystemPrompt } = require('../services/system-prompt'); // Unified system prompt
const metricsService = require('../services/metrics-service');

/**
 * Helper: Read key project files to understand what the project actually does
 * This is critical for answering questions like "what is this project about?"
 * @param {string} projectId - The project ID
 * @returns {Object} - { projectContext, keyFilesContent }
 */
async function readProjectContextFiles(projectId) {
    const result = {
        projectContext: null,  // From .drape/project.json
        keyFilesContent: {},   // Content of key files like App.jsx, package.json
        summary: ''            // Brief summary of what the project does
    };

    if (!projectId) return result;

    try {
        // Key files to read (in priority order)
        const KEY_FILES = [
            '.drape/project.json',  // Project context/description
            'package.json',         // Dependencies and project name
            'src/App.jsx',          // Main app component
            'src/App.tsx',          // TypeScript version
            'src/main.jsx',         // Entry point
            'src/main.tsx',         // TypeScript entry
            'index.html',           // HTML structure
            'src/pages/Home.jsx',   // Home page
            'src/pages/Home.tsx',   // TypeScript Home
        ];

        // Read each key file
        for (const filePath of KEY_FILES) {
            try {
                const fileResult = await storageService.readFile(projectId, filePath);
                if (fileResult.success && fileResult.content) {
                    // Truncate large files to 2000 chars
                    const content = fileResult.content.length > 2000
                        ? fileResult.content.substring(0, 2000) + '\n... (truncated)'
                        : fileResult.content;

                    result.keyFilesContent[filePath] = content;

                    // Parse .drape/project.json if found
                    if (filePath === '.drape/project.json') {
                        try {
                            result.projectContext = JSON.parse(fileResult.content);
                        } catch (e) {
                            console.warn('Could not parse .drape/project.json:', e.message);
                        }
                    }
                }
            } catch (e) {
                // File not found, skip silently
            }
        }

        // Generate a brief summary based on what we found
        if (result.projectContext) {
            result.summary = `Progetto "${result.projectContext.name}" - ${result.projectContext.description || 'Nessuna descrizione'}`;
            if (result.projectContext.industry) {
                result.summary += ` (${result.projectContext.industry})`;
            }
        } else if (result.keyFilesContent['package.json']) {
            try {
                const pkg = JSON.parse(result.keyFilesContent['package.json']);
                result.summary = `Progetto Node.js: ${pkg.name || 'Unknown'} - ${pkg.description || 'Nessuna descrizione'}`;
            } catch (e) {
                // Ignore parse errors
            }
        }

        console.log(`📖 [AI] Read ${Object.keys(result.keyFilesContent).length} key project files for context`);

    } catch (error) {
        console.error('Error reading project context files:', error.message);
    }

    return result;
}

/**
 * Helper: Detect if user is asking about the project itself
 * @param {string} prompt - User's message
 * @returns {boolean}
 */
function isProjectContextQuestion(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const contextKeywords = [
        'cosa fa', 'cosa è', "cos'è", 'di cosa', 'che progetto',
        'what is this', 'what does', 'about this project', 'describe',
        'qual è lo scopo', 'a cosa serve', 'che tipo di',
        'what kind of', 'what type of', 'explain this project',
        'dimmi del progetto', 'parlami del', 'descrivimi'
    ];

    return contextKeywords.some(keyword => lowerPrompt.includes(keyword));
}

/**
 * GET /ai/models
 * List available AI models
 */
router.get('/models', (req, res) => {
    const models = getAvailableModels();
    res.json({
        success: true,
        models,
        default: DEFAULT_AI_MODEL
    });
});

/**
 * POST /ai/chat
 * AI chat with streaming and tool support
 */
router.post('/chat', asyncHandler(async (req, res) => {
    const {
        prompt,
        conversationHistory = [],
        workstationId,
        projectId,
        repositoryUrl, selectedModel = DEFAULT_AI_MODEL,
        context: userContext,
        username
    } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
    }

    console.log(`\n🤖 AI Chat Request (REST)`);
    console.log(`   Model: ${selectedModel}`);
    console.log(`   Prompt: ${prompt.substring(0, 50)}...`);
    console.log(`   Project: ${projectId || workstationId}`);

    // Get provider for selected model
    const { provider, modelId, config } = getProviderForModel(selectedModel);

    // Initialize provider if needed
    if (!provider.client && provider.isAvailable()) {
        await provider.initialize();
    }

    // Create execution context
    const effectiveProjectId = projectId || workstationId;
    const execContext = effectiveProjectId ? createContext(effectiveProjectId, {
        owner: username,
        isHolyGrail: true
    }) : null;

    // RAG Trigger: Ensure indexing triggers if not ready (fire & forget)
    if (effectiveProjectId) {
        const vectorStore = require('../services/vector-store');
        if (vectorStore.isReady) {
            // We don't await this to avoid latency, just ensure it's running/fresh
            vectorStore.indexProject(require('../utils/helpers').getRepoPath(effectiveProjectId), effectiveProjectId)
                .catch(e => console.error('RAG Index trigger failed:', e.message));
        }
    }

    // Restore Lightweight File Context (Map of the project)
    // This allows AI to "see" the file structure without reading content
    let projectFiles = [];
    let projectFilesContent = {};  // Content of KEY files for context
    let projectContextData = null; // From .drape/project.json

    if (effectiveProjectId) {
        try {
            const { files } = await storageService.listFiles(effectiveProjectId);
            if (files) {
                projectFiles = files.map(f => ({ path: f.path, size: f.size }));
                console.log(`   📂 Loaded file tree map: ${projectFiles.length} files`);
            }
        } catch (e) {
            console.warn('Could not load project file tree:', e.message);
        }

        // 🔑 CRITICAL FIX: Always read key project files to understand what the project ACTUALLY does
        // This ensures AI can answer questions like "what is this project about?" correctly
        // by looking at the REAL code, not just the original description
        try {
            const contextData = await readProjectContextFiles(effectiveProjectId);
            projectFilesContent = contextData.keyFilesContent;
            projectContextData = contextData.projectContext;

            if (contextData.summary) {
                console.log(`   📋 Project context: ${contextData.summary}`);
            }
        } catch (e) {
            console.warn('Could not load project context files:', e.message);
        }
    }

    // Build base system message using unified Claude Code prompt
    const systemMessage = getSystemPrompt({
        projectFiles,
        keyFilesContent: projectFilesContent,
        projectContext: userContext ? {
            projectName: userContext.projectName,
            language: userContext.language,
            repositoryUrl: userContext.repositoryUrl
        } : null
    });

    // Context Engine Optimization
    let historyMessages = [];
    try {
        // This handles: Sanitization, Truncation, Summarization, and RAG Injection
        historyMessages = await contextService.optimizeContext(conversationHistory, modelId, prompt);
        console.log(`🧠 Context optimized: ${conversationHistory.length} -> ${historyMessages.length} messages`);
    } catch (error) {
        console.error('⚠️ Context optimization failed, falling back:', error);
        historyMessages = conversationHistory.slice(-10).map(msg => ({
            role: (msg.role === 'user' || msg.type === 'user') ? 'user' : 'assistant',
            content: msg.content
        }));
    }

    // Assemble final prompt
    const messages = [
        { role: 'system', content: systemMessage },
        ...historyMessages,
        { role: 'user', content: prompt }
    ];



    // Set up SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Prepare tools if project context exists
    const tools = execContext && config.supportsTools ? standardTools : [];

    // Streaming loop with tool execution
    let continueLoop = true;
    let loopCount = 0;
    const MAX_LOOPS = 10;
    let currentMessages = [...messages];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;

    while (continueLoop && loopCount < MAX_LOOPS) {
        loopCount++;

        try {
            let fullText = '';
            let toolCalls = [];

            // Stream response
            console.log(`🤖 Streaming from provider (Loop ${loopCount})...`);
            for await (const chunk of provider.chatStream(currentMessages, {
                model: modelId,
                tools,
                maxTokens: config.maxTokens || 8192
            })) {
                if (chunk.type === 'text') {
                    fullText += chunk.text;
                    res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
                } else if (chunk.type === 'thinking_start') {
                    res.write(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`);
                } else if (chunk.type === 'thinking') {
                    res.write(`data: ${JSON.stringify({ type: 'thinking', text: chunk.text })}\n\n`);
                } else if (chunk.type === 'thinking_end') {
                    res.write(`data: ${JSON.stringify({ type: 'thinking_end' })}\n\n`);
                } else if (chunk.type === 'tool_start') {
                    res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: chunk.name })}\n\n`);
                } else if (chunk.type === 'tool_input') { // Fixed from 'tool_call' in router logic to match provider yield
                    res.write(`data: ${JSON.stringify({
                        type: 'tool_input',
                        tool: chunk.tool,
                        input: chunk.input
                    })}\n\n`);
                } else if (chunk.type === 'tool_use') {
                    toolCalls.push({
                        id: chunk.id,
                        name: chunk.name,
                        input: chunk.input
                    });
                } else if (chunk.type === 'done') {
                    if (chunk.toolCalls) toolCalls = chunk.toolCalls;

                    // Accumulate tokens
                    if (chunk.usage) {
                        totalInputTokens += chunk.usage.inputTokens || 0;
                        totalOutputTokens += chunk.usage.outputTokens || 0;
                        totalCachedTokens += chunk.usage.cachedTokens || 0;
                    }
                }
            }

            // Handle tool calls
            if (toolCalls.length > 0 && execContext) {
                // Add assistant response to messages
                const assistantContent = [];
                if (fullText) assistantContent.push({ type: 'text', text: fullText });

                for (const tc of toolCalls) {
                    assistantContent.push({
                        type: 'tool_use',
                        id: tc.id,
                        name: tc.name,
                        input: tc.input
                    });
                }

                currentMessages.push({ role: 'assistant', content: assistantContent });

                // Execute tools and send results in the format frontend expects
                const toolResults = [];
                for (const tc of toolCalls) {
                    console.log(`🔧 Executing: ${tc.name}`);

                    // Send functionCall event (for "Executing..." indicator)
                    res.write(`data: ${JSON.stringify({
                        functionCall: {
                            name: tc.name,
                            args: tc.input
                        }
                    })}\n\n`);

                    const result = await executeTool(tc.name, tc.input, execContext);

                    const isSuccess = result?.startsWith('✅') ||
                        (result?.length > 0 && !result?.startsWith('❌'));

                    // Send toolResult event with full data (for formatted output)
                    res.write(`data: ${JSON.stringify({
                        toolResult: {
                            name: tc.name,
                            args: tc.input,
                            result: result,
                            success: isSuccess
                        }
                    })}\n\n`);

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: tc.id,
                        tool: tc.name,
                        content: result
                    });
                }

                currentMessages.push({ role: 'user', content: toolResults });
                // Continue loop for AI to respond to tool results
            } else {
                // No tool calls, we're done
                continueLoop = false;
            }
        } catch (error) {
            console.error('AI stream error:', error);
            res.write(`data: ${JSON.stringify({ text: `\n❌ Errore: ${error.message}` })}\n\n`);
            continueLoop = false;
        }
    }

    // TRACK USAGE
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
        console.log(`📈 [AI] Tracking total usage: ${totalInputTokens} in, ${totalOutputTokens} out`);
        metricsService.trackAIUsage({
            projectId: effectiveProjectId || 'global',
            model: selectedModel,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cachedTokens: totalCachedTokens
        }).catch(e => console.error('Failed to track AI usage:', e.message));
    }

    res.write('data: [DONE]\n\n');
    res.end();
}));


/**
 * POST /ai/analyze
 * Quick code analysis without tools
 */
router.post('/analyze', asyncHandler(async (req, res) => {
    const { code, language, question } = req.body;

    if (!code || !question) {
        return res.status(400).json({ error: 'code and question are required' });
    }

    const { provider, modelId } = getProviderForModel('gemini-2.5-flash');

    if (!provider.client) {
        await provider.initialize();
    }

    const prompt = `Analyze this ${language || 'code'}:

\`\`\`${language || ''}
${code}
\`\`\`

Question: ${question}

Provide a clear, concise analysis.`;

    const messages = [{ role: 'user', content: prompt }];

    let response = '';
    for await (const chunk of provider.chatStream(messages, { model: modelId })) {
        if (chunk.type === 'text') response += chunk.text;
    }

    res.json({ success: true, analysis: response });
}));

/**
 * POST /ai/recommend
 * AI-powered technology recommendation based on project description
 */
router.post('/recommend', asyncHandler(async (req, res) => {
    const { description } = req.body;

    if (!description) {
        return res.status(400).json({ error: 'description is required' });
    }

    console.log('🤖 AI Recommendation Request for:', description.substring(0, 50) + '...');

    const { provider, modelId } = getProviderForModel('gemini-2.5-flash');

    if (!provider.client) {
        await provider.initialize();
    }

    const prompt = `Based on this project description, recommend the BEST technology stack from this list:
- javascript: Pure JavaScript for simple interactive sites
- typescript: TypeScript for type-safe applications
- python: Python for data science, ML, automation, backend
- react: React for modern single-page applications
- node: Node.js for backend APIs and servers
- cpp: C++ for high-performance systems
- java: Java for enterprise applications
- swift: Swift for iOS applications
- kotlin: Kotlin for Android applications
- go: Go for scalable backend services
- rust: Rust for systems programming
- html: HTML/CSS for simple static websites

Project description: "${description}"

Respond with ONLY the technology ID (e.g., "react", "python", "html") - nothing else. Choose the most appropriate one based on:
1. Project complexity (simple static sites = html, complex apps = react/python)
2. Type of application (web app, mobile, backend, data science)
3. Scalability needs
4. Modern best practices`;

    const messages = [{ role: 'user', content: prompt }];

    let response = '';
    for await (const chunk of provider.chatStream(messages, { model: modelId })) {
        if (chunk.type === 'text') response += chunk.text;
    }

    // Clean up response - extract just the tech ID
    const recommendation = response.trim().toLowerCase();

    // Valid tech IDs from the list
    const validTechs = ['javascript', 'typescript', 'python', 'react', 'node', 'cpp', 'java', 'swift', 'kotlin', 'go', 'rust', 'html'];

    // Find the first valid tech in the response
    let finalRecommendation = validTechs.find(tech => recommendation.includes(tech));

    if (!finalRecommendation) {
        // Default fallback based on keywords
        if (description.toLowerCase().includes('landing') || description.toLowerCase().includes('semplice') || description.toLowerCase().includes('static')) {
            finalRecommendation = 'html';
        } else if (description.toLowerCase().includes('app') || description.toLowerCase().includes('web')) {
            finalRecommendation = 'react';
        } else {
            finalRecommendation = 'javascript';
        }
    }

    console.log('✅ AI Recommended:', finalRecommendation);

    res.json({
        success: true,
        recommendation: finalRecommendation,
        rawResponse: response
    });
}));

module.exports = router;
