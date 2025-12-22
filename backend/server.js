/**
 * Drape Backend - Main Server Entry Point v2.0
 * Complete modular architecture with all features
 * 
 * This replaces the legacy server.js
 */

require('dotenv').config();

const http = require('http');
const WebSocket = require('ws');
const httpProxy = require('http-proxy');

// Import configuration and utilities
const {
    PORT,
    GOOGLE_CLOUD_PROJECT,
    LOCATION,
    CODER_API_URL,
    CODER_SESSION_TOKEN,
    CODER_WILDCARD_DOMAIN
} = require('./utils/constants');
const { getLocalIP } = require('./utils/helpers');
const { setWebSocketServer, enableLogBroadcasting } = require('./middleware/logger');
const { initializeProviders, getAvailableProviders } = require('./services/ai-providers');
const { handleWebSocketUpgrade, parseCoderAppPath } = require('./middleware/coderProxy');

// Import Express app
const createApp = require('./app');

// Initialize Firebase Admin if not already initialized
const admin = require('firebase-admin');
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'drape-mobile-ide'
    });
    console.log('🔥 Firebase Admin initialized');
}

// Get local IP for network access
const LOCAL_IP = getLocalIP();


/**
 * Initialize and start the server
 */
async function startServer() {
    console.log('\n🚀 Starting Drape Backend v2.0...\n');

    // ===========================================
    // CREATE EXPRESS APP
    // ===========================================
    const app = createApp();

    // ===========================================
    // CREATE HTTP SERVER
    // ===========================================
    const server = http.createServer(app);

    // ===========================================
    // WEBSOCKET PROXY FOR CODER
    // ===========================================
    const wsProxy = httpProxy.createProxyServer({
        changeOrigin: true,
        ws: true
    });

    wsProxy.on('error', (err, req, socket) => {
        console.error('❌ WS Proxy Error:', err.message);
        try { socket.end(); } catch (e) { }
    });

    // Handle WebSocket upgrade requests
    server.on('upgrade', (req, socket, head) => {
        // Check if this is a Coder WebSocket (VS Code, terminal, etc.)
        if (req.url.startsWith('/@') || req.url.includes('/coder/')) {
            console.log(`🔌 Coder WS: ${req.url.substring(0, 50)}`);

            const parsed = parseCoderAppPath(req.url);
            const coderBase = CODER_API_URL || 'http://drape.info';

            if (parsed) {
                // App WebSocket - use subdomain routing
                const wildcardDomain = CODER_WILDCARD_DOMAIN || 'drape.info';
                const subdomain = `${parsed.app}--${parsed.workspace}--${parsed.user}.${wildcardDomain}`;
                const target = `http://${subdomain}`;

                req.url = parsed.path || '/';
                req.headers['Host'] = subdomain;
                req.headers['Origin'] = `http://${subdomain}`;

                wsProxy.ws(req, socket, head, { target });
            } else {
                // Standard Coder WebSocket (dashboard, etc.)
                if (CODER_SESSION_TOKEN) {
                    req.headers['Coder-Session-Token'] = CODER_SESSION_TOKEN;
                }
                wsProxy.ws(req, socket, head, { target: coderBase });
            }
        } else if (req.url === '/ws') {
            // Let the WebSocket.Server handle our /ws path
            // This is handled below
        } else {
            console.log(`🔌 Unknown WS upgrade: ${req.url}`);
            socket.destroy();
        }
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
            version: '2.0.0'
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
        });

        ws.on('error', (error) => {
            console.error('WS error:', error.message);
        });
    });

    // ===========================================
    // INITIALIZE SERVICES
    // ===========================================

    console.log('🤖 Initializing AI providers...');
    try {
        await initializeProviders();
        const providers = getAvailableProviders();
        console.log(`   Available: ${providers.join(', ') || 'none'}`);
    } catch (error) {
        console.warn('⚠️ AI provider init warning:', error.message);
    }

    // ===========================================
    // START SERVER
    // ===========================================
    server.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('╔' + '═'.repeat(55) + '╗');
        console.log('║  🚀 Drape Backend v2.0 - COMPLETE                    ║');
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
        console.log(`║  🖥️  Coder:        ${(CODER_API_URL || 'not configured').substring(0, 35).padEnd(35)}║`);
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
        username // Extract username
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
        // Multi-user context support
        const execContext = effectiveProjectId ? createContext(effectiveProjectId, { owner: username }) : null;

        // Build messages
        const messages = [
            { role: 'system', content: 'You are an expert coding assistant.' }
        ];

        // Add history
        for (const msg of conversationHistory.slice(-10)) {
            if (msg.role === 'user' || msg.type === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'assistant' || msg.type === 'text') {
                messages.push({ role: 'assistant', content: msg.content });
            }
        }

        messages.push({ role: 'user', content: prompt });

        const tools = execContext && config.supportsTools ? standardTools : [];

        // Stream response
        let currentMessages = [...messages];
        let continueLoop = true;
        let loopCount = 0;

        while (continueLoop && loopCount < 10) {
            loopCount++;

            let fullText = '';
            let toolCalls = [];

            for await (const chunk of provider.chatStream(currentMessages, {
                model: modelId,
                tools,
                maxTokens: config.maxTokens || 8192
            })) {
                if (chunk.type === 'text') {
                    fullText += chunk.text;
                    ws.send(JSON.stringify({ type: 'text', text: chunk.text }));
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

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: tc.id,
                        tool: tc.name,
                        content: result
                    });
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
