/**
 * Drape Backend - Main Server Entry Point v2.0
 * Holy Grail Architecture - Fly.io MicroVMs
 */

// FIRST: Initialize global log service to capture ALL logs
const globalLogService = require('./services/global-log-service');

require('dotenv').config();

const http = require('http');
const WebSocket = require('ws');

// Import configuration and utilities
const {
    PORT,
    GOOGLE_CLOUD_PROJECT,
    LOCATION
} = require('./utils/constants');
const { getLocalIP } = require('./utils/helpers');
const { setWebSocketServer, enableLogBroadcasting } = require('./middleware/logger');
const contextService = require('./services/context-service');

// Import Express app
const createApp = require('./app');

// Initialize Firebase Admin if not already initialized (optional)
const admin = require('firebase-admin');
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            projectId: 'drape-mobile-ide',
            storageBucket: 'drape-mobile-ide.appspot.com'
        });
        console.log('🔥 Firebase Admin initialized');
    } catch (error) {
        console.warn('⚠️ Firebase Admin not initialized (credentials missing). Some features may be unavailable.');
    }
}

// Get local IP for network access
const LOCAL_IP = getLocalIP();


/**
 * Initialize and start the server
 */
async function startServer() {
    console.log('\n🚀 Starting Drape Backend v2.0 (Holy Grail)...\n');

    // ===========================================
    // CREATE EXPRESS APP
    // ===========================================
    const app = createApp();

    // ===========================================
    // CREATE HTTP SERVER
    // ===========================================
    const vmRouter = require('./middleware/vm-router');

    // Gateway Logic: VM Router -> Express App
    const server = http.createServer((req, res) => {
        vmRouter(req, res, () => {
            app(req, res);
        });
    });

    // ===========================================
    // DRAPE WEBSOCKET SERVER
    // ===========================================
    const wss = new WebSocket.Server({ noServer: true });

    // Handle upgrade for our /ws path
    server.on('upgrade', (req, socket, head) => {
        if (req.url === '/ws') {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        } else {
            console.log(`🔌 Unknown WS upgrade: ${req.url}`);
            socket.destroy();
        }
    });

    // Enable log broadcasting to WebSocket clients
    setWebSocketServer(wss);
    enableLogBroadcasting();

    wss.on('connection', (ws) => {
        console.log('🔌 WebSocket client connected');

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'Drape WebSocket connected',
            version: '2.0.0',
            architecture: 'holy-grail'
        }));

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                console.log('📨 WS Message:', data.type);

                switch (data.type) {
                    case 'ping':
                        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                        break;

                    case 'subscribe':
                        // Subscribe to log updates for a workstation
                        ws.workstationId = data.workstationId;
                        ws.send(JSON.stringify({ type: 'subscribed', workstationId: data.workstationId }));
                        break;

                    case 'subscribe_logs':
                        // Subscribe to backend logs stream
                        globalLogService.addWsListener(ws);
                        ws.subscribedToLogs = true;
                        // Send recent logs immediately
                        const recentLogs = globalLogService.getRecentLogs(50);
                        for (const log of recentLogs) {
                            ws.send(JSON.stringify({ type: 'backend_log', log }));
                        }
                        ws.send(JSON.stringify({ type: 'subscribed_logs' }));
                        break;

                    case 'unsubscribe_logs':
                        // Unsubscribe from backend logs
                        globalLogService.removeWsListener(ws);
                        ws.subscribedToLogs = false;
                        ws.send(JSON.stringify({ type: 'unsubscribed_logs' }));
                        break;

                    case 'chat':
                        // Forward to AI chat handler
                        await handleWebSocketChat(ws, data.payload);
                        break;

                    default:
                        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
                }
            } catch (error) {
                console.error('WS message error:', error);
                ws.send(JSON.stringify({ type: 'error', error: error.message }));
            }
        });

        ws.on('close', () => {
            console.log('🔌 WebSocket client disconnected');
            // Cleanup log subscription
            if (ws.subscribedToLogs) {
                globalLogService.removeWsListener(ws);
            }
        });

        ws.on('error', (error) => {
            console.error('WS error:', error.message);
        });
    });

    // ===========================================
    // INITIALIZE SERVICES
    // ===========================================
    const orchestrator = require('./services/workspace-orchestrator');
    orchestrator.startReaper();

    const { initializeProviders, getAvailableProviders } = require('./services/ai-providers');

    console.log('🤖 Initializing AI providers...');
    try {
        await initializeProviders();
        const providers = getAvailableProviders();
        console.log(`   Available: ${providers.join(', ') || 'none'}`);

        // Initialize Vector Store (RAG)
        const vectorStore = require('./services/vector-store');
        await vectorStore.initialize();

    } catch (error) {
        console.warn('⚠️ AI/Vector provider init warning:', error.message);
    }

    // ===========================================
    // START SERVER
    // ===========================================
    server.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('╔' + '═'.repeat(55) + '╗');
        console.log('║  🚀 Drape Backend v2.0 - HOLY GRAIL                  ║');
        console.log('╠' + '═'.repeat(55) + '╣');
        console.log(`║  📍 Local IP:     ${LOCAL_IP.padEnd(35)}║`);
        console.log(`║  🔌 Port:         ${String(PORT).padEnd(35)}║`);
        console.log('╠' + '═'.repeat(55) + '╣');
        console.log(`║  🌐 API:          http://${LOCAL_IP}:${PORT}`.padEnd(58) + '║');
        console.log(`║  🔗 Health:       http://${LOCAL_IP}:${PORT}/health`.padEnd(58) + '║');
        console.log(`║  📡 WebSocket:    ws://${LOCAL_IP}:${PORT}/ws`.padEnd(58) + '║');
        console.log('╠' + '═'.repeat(55) + '╣');
        console.log(`║  ☁️  GCP Project:  ${GOOGLE_CLOUD_PROJECT.padEnd(35)}║`);
        console.log(`║  🌍 Region:       ${LOCATION.padEnd(35)}║`);
        console.log(`║  🚀 Compute:      Fly.io MicroVMs`.padEnd(58) + '║');
        console.log('╚' + '═'.repeat(55) + '╝');
        console.log('');
        console.log('📂 Modular Structure Active:');
        console.log('   ├── routes/     - API endpoints');
        console.log('   ├── services/   - Business logic');
        console.log('   ├── middleware/ - Request processing');
        console.log('   └── utils/      - Helpers & constants');
        console.log('');
    });

    // ===========================================
    // GRACEFUL SHUTDOWN
    // ===========================================
    const shutdown = (signal) => {
        console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

        // Close WebSocket connections
        wss.clients.forEach(client => {
            client.send(JSON.stringify({ type: 'shutdown' }));
            client.close();
        });

        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });

        // Force exit after 10 seconds
        setTimeout(() => {
            console.log('⚠️ Forced exit');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
}

/**
 * Handle WebSocket chat messages
 */
async function handleWebSocketChat(ws, payload) {
    const { getProviderForModel, standardTools } = require('./services/ai-providers');
    const { executeTool, createContext } = require('./services/tool-executor');
    const { DEFAULT_AI_MODEL } = require('./utils/constants');

    const {
        prompt,
        conversationHistory = [],
        workstationId,
        projectId,
        selectedModel = DEFAULT_AI_MODEL,
        username
    } = payload;

    if (!prompt) {
        ws.send(JSON.stringify({ type: 'error', message: 'prompt is required' }));
        return;
    }

    console.log(`🤖 WS Chat: ${prompt.substring(0, 50)}... [User: ${username || 'admin'}]`);

    try {
        const { provider, modelId, config } = getProviderForModel(selectedModel);

        if (!provider.client && provider.isAvailable()) {
            await provider.initialize();
        }

        const effectiveProjectId = projectId || workstationId;
        const execContext = effectiveProjectId ? createContext(effectiveProjectId, { owner: username }) : null;

        // RAG TRIGGER: Ensure project is indexed
        if (effectiveProjectId) {
            const { getRepoPath } = require('./utils/helpers');
            const vectorStore = require('./services/vector-store');
            const repoPath = getRepoPath(effectiveProjectId);
            if (vectorStore.isReady) {
                vectorStore.indexProject(repoPath, effectiveProjectId).catch(e => console.error('RAG Index trigger failed:', e.message));
            }
        }

        // Build messages
        const systemMessage = { role: 'system', content: 'You are an expert coding assistant. When generating code for web applications (React, HTML/CSS, etc.), you MUST prioritize mobile-first design and responsiveness. Ensure layouts are optimized for mobile devices by default, using appropriate CSS strategies (e.g., flexbox, grid, media queries). The user wants high-quality, modern, and mobile-optimized UI.' };

        // OPTIMIZE CONTEXT
        let historyMessages = [];
        try {
            historyMessages = await contextService.optimizeContext(conversationHistory, modelId, prompt);
            console.log(`🧠 Context optimized: ${conversationHistory.length} -> ${historyMessages.length} messages`);
        } catch (error) {
            console.error('⚠️ Context optimization failed, falling back to simple slice:', error);
            historyMessages = conversationHistory.slice(-10).map(msg => ({
                role: (msg.role === 'user' || msg.type === 'user') ? 'user' : 'assistant',
                content: msg.content
            }));
        }

        const messages = [systemMessage, ...historyMessages, { role: 'user', content: prompt }];
        const tools = execContext && config.supportsTools ? standardTools : [];

        // Stream response
        let currentMessages = [...messages];
        let continueLoop = true;
        let loopCount = 0;

        while (continueLoop && loopCount < 5) {
            loopCount++;

            let fullText = '';
            let toolCalls = [];

            try {
                for await (const chunk of provider.chatStream(currentMessages, {
                    model: modelId,
                    tools,
                    maxTokens: config.maxTokens || 4096
                })) {
                    if (chunk.type === 'text') {
                        fullText += chunk.text;
                        ws.send(JSON.stringify({ type: 'text', text: chunk.text }));
                    } else if (chunk.type === 'thinking_start') {
                        ws.send(JSON.stringify({ type: 'thinking_start' }));
                    } else if (chunk.type === 'thinking') {
                        ws.send(JSON.stringify({ type: 'thinking', text: chunk.text }));
                    } else if (chunk.type === 'thinking_end') {
                        ws.send(JSON.stringify({ type: 'thinking_end' }));
                    } else if (chunk.type === 'tool_start') {
                        ws.send(JSON.stringify({ type: 'tool_start', tool: chunk.name }));
                    } else if (chunk.type === 'tool_call') {
                        toolCalls.push(chunk.toolCall);
                        ws.send(JSON.stringify({
                            type: 'tool_input',
                            tool: chunk.toolCall.name,
                            input: chunk.toolCall.input
                        }));
                    } else if (chunk.type === 'done') {
                        if (chunk.toolCalls) toolCalls = chunk.toolCalls;
                    }
                }
            } catch (streamError) {
                if (streamError.message && streamError.message.includes('429')) {
                    console.warn('⚠️ Loop hit 429 Rate Limit. Stopping.');
                    ws.send(JSON.stringify({ type: 'text', text: '\n\n[SYSTEM: Rate Limit Reached. Creating partial checkpoint...]' }));
                    continueLoop = false;
                    break;
                }
                throw streamError;
            }

            if (toolCalls.length > 0 && execContext) {
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

                const toolResults = [];
                for (const tc of toolCalls) {
                    const result = await executeTool(tc.name, tc.input, execContext);
                    const isSuccess = result.startsWith('✅') || !result.startsWith('❌');

                    ws.send(JSON.stringify({ type: 'tool_result', tool: tc.name, success: isSuccess }));

                    let contentStr = String(result);
                    if (contentStr.length > 500) {
                        contentStr = contentStr.substring(0, 500) + '\n... [Output truncated to 500 chars] ...';
                    }

                    const cleanResult = {
                        type: 'tool_result',
                        tool_use_id: String(tc.id),
                        content: contentStr
                    };
                    delete cleanResult.tool;

                    toolResults.push(cleanResult);
                }

                currentMessages.push({ role: 'user', content: toolResults });
            } else {
                continueLoop = false;
            }
        }

        ws.send(JSON.stringify({ type: 'done' }));
    } catch (error) {
        console.error('WS Chat error:', error);
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
}

// Start the server
startServer().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
