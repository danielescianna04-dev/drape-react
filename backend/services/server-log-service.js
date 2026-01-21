/**
 * Server Log Service
 * Manages SSE log streams for project previews
 */

class ServerLogService {
    constructor() {
        this.serverLogsMap = new Map();
    }

    /**
     * Get or create a log entry for a workstation/project
     */
    _getEntry(workstationId) {
        if (!this.serverLogsMap.has(workstationId)) {
            this.serverLogsMap.set(workstationId, {
                logs: [],
                listeners: new Set()
            });
        }
        return this.serverLogsMap.get(workstationId);
    }

    /**
     * Add a log message and broadcast to listeners
     */
    addLog(workstationId, content, type = 'output') {
        const entry = this._getEntry(workstationId);
        const logItem = {
            id: `log-${Date.now()}-${Math.random()}`,
            content,
            type,
            timestamp: new Date()
        };

        entry.logs.push(logItem);

        // Limit log buffer size
        if (entry.logs.length > 1000) {
            entry.logs.shift();
        }

        // Broadcast to listeners
        entry.listeners.forEach(res => {
            try {
                res.write(`data: ${JSON.stringify(logItem)}\n\n`);
                // Flush if it's a response object with flush method
                if (res.flush) res.flush();
            } catch (e) {
                console.error(`❌ Error broadcasting log to listener for ${workstationId}:`, e.message);
            }
        });
    }

    /**
     * Add a listener (SSE response object)
     */
    addListener(workstationId, res) {
        const entry = this._getEntry(workstationId);

        // Send existing logs first
        entry.logs.forEach(log => {
            res.write(`data: ${JSON.stringify(log)}\n\n`);
        });

        entry.listeners.add(res);
    }

    /**
     * Remove a listener
     */
    removeListener(workstationId, res) {
        if (this.serverLogsMap.has(workstationId)) {
            this.serverLogsMap.get(workstationId).listeners.delete(res);
        }
    }

    /**
     * Clear logs for a workstation
     */
    clearLogs(workstationId) {
        if (this.serverLogsMap.has(workstationId)) {
            this.serverLogsMap.get(workstationId).logs = [];
        }
    }

    /**
     * Broadcast an event to all listeners for a workstation
     * Used for session lifecycle events (session_expired, etc.)
     */
    broadcastEvent(workstationId, eventType, data = {}) {
        if (!this.serverLogsMap.has(workstationId)) {
            console.log(`📢 [ServerLogService] No listeners for ${workstationId}, skipping ${eventType} event`);
            return;
        }

        const entry = this.serverLogsMap.get(workstationId);
        const event = {
            type: eventType,
            timestamp: new Date().toISOString(),
            ...data
        };

        console.log(`📢 [ServerLogService] Broadcasting ${eventType} to ${entry.listeners.size} listeners for ${workstationId}`);

        entry.listeners.forEach(res => {
            try {
                res.write(`data: ${JSON.stringify(event)}\n\n`);
                if (res.flush) res.flush();
            } catch (e) {
                console.error(`❌ Error broadcasting ${eventType} to listener for ${workstationId}:`, e.message);
            }
        });
    }
}

module.exports = new ServerLogService();
