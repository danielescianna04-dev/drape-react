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
        repositoryUrl,
        selectedModel = DEFAULT_AI_MODEL,
        context: userContext
    } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
    }

    console.log(`\n🤖 AI Chat Request`);
    console.log(`   Model: ${selectedModel}`);
    console.log(`   Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`   Project: ${projectId || workstationId || 'none'}`);

    // Get provider for selected model
    const { provider, modelId, config } = getProviderForModel(selectedModel);

    // Initialize provider if needed
    if (!provider.client && provider.isAvailable()) {
        await provider.initialize();
    }

    // Create execution context
    const effectiveProjectId = projectId || workstationId;
    const execContext = effectiveProjectId ? createContext(effectiveProjectId) : null;

    // Build system message
    const systemMessage = buildSystemMessage(execContext, userContext);

    // Build messages array
    const messages = [
        { role: 'system', content: systemMessage }
    ];

    // Add conversation history
    if (conversationHistory.length > 0) {
        for (const msg of conversationHistory.slice(-10)) { // Keep last 10 messages
            if (msg.role === 'user' || msg.type === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'assistant' || msg.type === 'text') {
                messages.push({ role: 'assistant', content: msg.content });
            }
        }
    }

    // Add current prompt
    messages.push({ role: 'user', content: prompt });

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

    while (continueLoop && loopCount < MAX_LOOPS) {
        loopCount++;

        try {
            let fullText = '';
            let toolCalls = [];

            // Stream response
            for await (const chunk of provider.chatStream(currentMessages, {
                model: modelId,
                tools,
                maxTokens: config.maxTokens || 8192
            })) {
                if (chunk.type === 'text') {
                    fullText += chunk.text;
                    res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
                } else if (chunk.type === 'tool_start') {
                    res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: chunk.name })}\n\n`);
                } else if (chunk.type === 'tool_call') {
                    toolCalls.push(chunk.toolCall);
                    res.write(`data: ${JSON.stringify({
                        type: 'tool_input',
                        tool: chunk.toolCall.name,
                        input: chunk.toolCall.input
                    })}\n\n`);
                } else if (chunk.type === 'done') {
                    if (chunk.toolCalls) toolCalls = chunk.toolCalls;
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

                // Execute tools
                const toolResults = [];
                for (const tc of toolCalls) {
                    console.log(`🔧 Executing: ${tc.name}`);
                    const result = await executeTool(tc.name, tc.input, execContext);

                    const isSuccess = result.startsWith('✅') ||
                        (result.length > 0 && !result.startsWith('❌'));

                    res.write(`data: ${JSON.stringify({
                        type: 'tool_result',
                        tool: tc.name,
                        success: isSuccess
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
            res.write(`data: ${JSON.stringify({ text: `\n❌ Error: ${error.message}` })}\n\n`);
            continueLoop = false;
        }
    }

    res.write('data: [DONE]\n\n');
    res.end();
}));

/**
 * Build system message for AI
 */
function buildSystemMessage(execContext, userContext) {
    let systemMessage = `You are an expert coding assistant. You help users write, debug, and understand code.

IMPORTANT RULES:
1. Be concise and direct in your responses
2. When showing code, use proper syntax highlighting
3. If you need to modify files, use the available tools
4. Always explain what you're doing and why
5. For mobile display, keep responses well-formatted
`;

    if (execContext) {
        systemMessage += `
PROJECT CONTEXT:
- Project ID: ${execContext.projectId}
- Environment: ${execContext.isCloud ? 'Cloud Workspace' : 'Local'}
- Project Path: ${execContext.projectPath}

You have access to tools for file operations:
- read_file: Read file contents
- write_file: Create or overwrite files
- edit_file: Edit files with search/replace
- glob_files: Find files by pattern
- search_in_files: Search content in files
- execute_command: Run shell commands

When the user asks about the project:
1. First use glob_files or search_in_files to explore
2. Read relevant files to understand the code
3. Make changes using edit_file or write_file
4. Verify changes if needed with read_file
`;
    }

    if (userContext) {
        systemMessage += `\nADDITIONAL CONTEXT:\n${userContext}\n`;
    }

    return systemMessage;
}

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

module.exports = router;
