/**
 * Global Log Service
 * Intercepts ALL console output and streams via SSE/WebSocket
 * Allows frontend to see all backend activity in real-time
 */

class GlobalLogService {
    constructor() {
        this.logs = [];
        this.listeners = new Set();      // SSE listeners (res objects)
        this.wsListeners = new Set();    // WebSocket listeners
        this.maxLogs = 2000;
        this.sequence = 0;

        // Intercept console methods
        this._interceptConsole();
    }

    /**
     * Intercept console.log, console.warn, console.error
     */
    _interceptConsole() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        const self = this;

        console.log = function(...args) {
            originalLog.apply(console, args);
            self._addLog('info', args);
        };

        console.warn = function(...args) {
            originalWarn.apply(console, args);
            self._addLog('warn', args);
        };

        console.error = function(...args) {
            originalError.apply(console, args);
            self._addLog('error', args);
        };
    }

    /**
     * Format log arguments to string
     */
    _formatArgs(args) {
        return args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    /**
     * Add log entry and broadcast to listeners
     */
    _addLog(level, args) {
        const entry = {
            id: ++this.sequence,
            timestamp: Date.now(),
            level,
            message: this._formatArgs(args)
        };

        this.logs.push(entry);

        // Trim old logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Broadcast to SSE listeners
        const data = JSON.stringify(entry);
        for (const res of this.listeners) {
            try {
                res.write(`data: ${data}\n\n`);
            } catch (e) {
                this.listeners.delete(res);
            }
        }

        // Broadcast to WebSocket listeners
        const wsMessage = JSON.stringify({ type: 'backend_log', log: entry });
        for (const ws of this.wsListeners) {
            try {
                if (ws.readyState === 1) { // OPEN
                    ws.send(wsMessage);
                } else {
                    this.wsListeners.delete(ws);
                }
            } catch (e) {
                this.wsListeners.delete(ws);
            }
        }
    }

    /**
     * Add SSE listener
     */
    addListener(res) {
        this.listeners.add(res);
        return () => this.listeners.delete(res);
    }

    /**
     * Add WebSocket listener
     */
    addWsListener(ws) {
        this.wsListeners.add(ws);
        return () => this.wsListeners.delete(ws);
    }

    /**
     * Remove WebSocket listener
     */
    removeWsListener(ws) {
        this.wsListeners.delete(ws);
    }

    /**
     * Get recent logs
     */
    getRecentLogs(count = 100) {
        return this.logs.slice(-count);
    }

    /**
     * Get logs since a specific ID
     */
    getLogsSince(sinceId) {
        return this.logs.filter(log => log.id > sinceId);
    }
}

module.exports = new GlobalLogService();
