/**
 * File Watcher Service
 * Monitors VM file changes and broadcasts via WebSocket
 */

const chokidar = require('chokidar');
const flyService = require('./fly-service');

class FileWatcherService {
    constructor() {
        this.watchers = new Map(); // projectId -> watcher instance
        this.wsClients = new Map(); // projectId -> Set of WebSocket clients
    }

    /**
     * Start watching files for a project
     * @param {string} projectId - Project ID
     * @param {string} agentUrl - VM agent URL
     * @param {string} machineId - VM machine ID
     */
    async startWatching(projectId, agentUrl, machineId) {
        // Don't start if already watching
        if (this.watchers.has(projectId)) {
            console.log(`📂 [FileWatcher] Already watching ${projectId}`);
            return;
        }

        console.log(`📂 [FileWatcher] Starting watch for ${projectId}`);

        // We'll use exec to tail -f a log that tracks file changes
        // This is more reliable than trying to run chokidar directly on VM
        // Instead, we'll poll the VM periodically for file list changes

        const intervalId = setInterval(async () => {
            try {
                await this._checkForChanges(projectId, agentUrl, machineId);
            } catch (err) {
                console.error(`[FileWatcher] Error checking changes for ${projectId}:`, err.message);
            }
        }, 1000); // Check every 1 second

        this.watchers.set(projectId, { intervalId, lastFileList: null });
    }

    /**
     * Check for file changes by comparing file lists
     */
    async _checkForChanges(projectId, agentUrl, machineId) {
        const watcherData = this.watchers.get(projectId);
        if (!watcherData) return;

        // Get current file list from VM (exclude build/cache folders)
        const result = await flyService.exec(
            agentUrl,
            'find /home/coder/project -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" | sort',
            '/home/coder/project',
            machineId,
            10000 // Increased timeout for heavy operations
        );

        if (result.exitCode !== 0) {
            return; // VM might be down
        }

        const currentFiles = new Set(result.stdout.trim().split('\n').filter(f => f));
        const lastFiles = watcherData.lastFileList;

        if (!lastFiles) {
            // First run - just store the list
            watcherData.lastFileList = currentFiles;
            return;
        }

        // Detect changes
        const added = [...currentFiles].filter(f => !lastFiles.has(f));
        const removed = [...lastFiles].filter(f => !currentFiles.has(f));

        // Broadcast changes
        for (const filePath of added) {
            const relativePath = filePath.replace('/home/coder/project/', '');
            this._broadcast(projectId, {
                type: 'file_created',
                path: relativePath,
                projectId,
                timestamp: Date.now()
            });
            console.log(`📝 [FileWatcher] File created: ${relativePath}`);
        }

        for (const filePath of removed) {
            const relativePath = filePath.replace('/home/coder/project/', '');
            this._broadcast(projectId, {
                type: 'file_deleted',
                path: relativePath,
                projectId,
                timestamp: Date.now()
            });
            console.log(`🗑️ [FileWatcher] File deleted: ${relativePath}`);
        }

        // Update last known state
        watcherData.lastFileList = currentFiles;
    }

    /**
     * Stop watching files for a project
     * @param {string} projectId - Project ID
     */
    stopWatching(projectId) {
        const watcherData = this.watchers.get(projectId);
        if (watcherData) {
            clearInterval(watcherData.intervalId);
            this.watchers.delete(projectId);
            console.log(`📂 [FileWatcher] Stopped watching ${projectId}`);
        }
    }

    /**
     * Register a WebSocket client for file updates
     * @param {string} projectId - Project ID
     * @param {WebSocket} ws - WebSocket connection
     */
    registerClient(projectId, ws) {
        if (!this.wsClients.has(projectId)) {
            this.wsClients.set(projectId, new Set());
        }
        this.wsClients.get(projectId).add(ws);
        console.log(`🔌 [FileWatcher] Client registered for ${projectId}`);

        // Remove client on disconnect
        ws.on('close', () => {
            this.unregisterClient(projectId, ws);
        });
    }

    /**
     * Unregister a WebSocket client
     * @param {string} projectId - Project ID
     * @param {WebSocket} ws - WebSocket connection
     */
    unregisterClient(projectId, ws) {
        const clients = this.wsClients.get(projectId);
        if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
                this.wsClients.delete(projectId);
                // Optionally stop watching if no clients
                // this.stopWatching(projectId);
            }
        }
    }

    /**
     * Broadcast event to all clients watching a project
     * @param {string} projectId - Project ID
     * @param {Object} event - Event data
     */
    _broadcast(projectId, event) {
        const clients = this.wsClients.get(projectId);
        if (!clients || clients.size === 0) return;

        const message = JSON.stringify(event);
        let sentCount = 0;

        clients.forEach(ws => {
            if (ws.readyState === 1) { // OPEN
                ws.send(message);
                sentCount++;
            }
        });

        if (sentCount > 0) {
            console.log(`📡 [FileWatcher] Broadcast to ${sentCount} client(s): ${event.type} ${event.path}`);
        }
    }

    /**
     * Manually notify about a file change (called after write_file)
     * This avoids waiting for the next polling interval
     */
    notifyFileChange(projectId, filePath, changeType) {
        const event = {
            type: changeType === 'deleted' ? 'file_deleted' : 'file_created',
            path: filePath,
            projectId,
            timestamp: Date.now()
        };

        this._broadcast(projectId, event);

        const action = changeType === 'deleted' ? '🗑️' : '📝';
        console.log(`${action} [FileWatcher] File ${changeType}: ${filePath} (immediate notify)`);
    }

    /**
     * Get active watchers count
     */
    getStats() {
        return {
            activeWatchers: this.watchers.size,
            connectedClients: Array.from(this.wsClients.values()).reduce((sum, set) => sum + set.size, 0)
        };
    }
}

module.exports = new FileWatcherService();
