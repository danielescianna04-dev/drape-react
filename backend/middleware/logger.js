/**
 * Drape Backend - Logger Middleware
 * Request logging and WebSocket broadcasting
 */

const WebSocket = require('ws');

// Store for WebSocket server instance
let wssInstance = null;

/**
 * Set the WebSocket server instance for log broadcasting
 */
function setWebSocketServer(wss) {
    wssInstance = wss;
}

/**
 * Broadcast log to all connected WebSocket clients
 */
function broadcastLog(level, message, data = {}) {
    if (!wssInstance) return;

    const logEntry = {
        type: 'log',
        level,
        message,
        data,
        timestamp: new Date().toISOString()
    };

    wssInstance.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(logEntry));
        }
    });
}

/**
 * Override console methods to broadcast logs
 */
function enableLogBroadcasting() {
    const originalConsole = {
        log: console.log.bind(console),
        error: console.error.bind(console),
        warn: console.warn.bind(console),
        info: console.info.bind(console)
    };

    console.log = (...args) => {
        originalConsole.log(...args);
        broadcastLog('info', args.map(a =>
            typeof a === 'string' ? a : JSON.stringify(a)
        ).join(' '));
    };

    console.error = (...args) => {
        originalConsole.error(...args);
        broadcastLog('error', args.map(a =>
            typeof a === 'string' ? a : JSON.stringify(a)
        ).join(' '));
    };

    console.warn = (...args) => {
        originalConsole.warn(...args);
        broadcastLog('warn', args.map(a =>
            typeof a === 'string' ? a : JSON.stringify(a)
        ).join(' '));
    };

    console.info = (...args) => {
        originalConsole.info(...args);
        broadcastLog('info', args.map(a =>
            typeof a === 'string' ? a : JSON.stringify(a)
        ).join(' '));
    };

    return originalConsole;
}

/**
 * Request logger middleware
 */
function requestLogger(req, res, next) {
    const start = Date.now();

    // Log request start
    const logPrefix = getMethodEmoji(req.method);
    console.log(`${logPrefix} ${req.method} ${req.path}`);

    // Log request completion
    res.on('finish', () => {
        const duration = Date.now() - start;
        const statusEmoji = res.statusCode < 400 ? '✅' : '❌';
        console.log(`${statusEmoji} ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });

    next();
}

/**
 * Get emoji for HTTP method
 */
function getMethodEmoji(method) {
    const emojis = {
        GET: '📖',
        POST: '📝',
        PUT: '✏️',
        DELETE: '🗑️',
        PATCH: '🔧',
        OPTIONS: '🔍'
    };
    return emojis[method] || '📨';
}

/**
 * Create a namespaced logger
 */
function createLogger(namespace) {
    const prefix = `[${namespace}]`;

    return {
        log: (...args) => console.log(prefix, ...args),
        error: (...args) => console.error(prefix, ...args),
        warn: (...args) => console.warn(prefix, ...args),
        info: (...args) => console.info(prefix, ...args),
        debug: (...args) => {
            if (process.env.NODE_ENV === 'development') {
                console.log(`${prefix} [DEBUG]`, ...args);
            }
        }
    };
}

module.exports = {
    setWebSocketServer,
    broadcastLog,
    enableLogBroadcasting,
    requestLogger,
    createLogger
};
