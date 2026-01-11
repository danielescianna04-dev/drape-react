/**
 * Redis Service for State Persistence
 * 
 * Stores active VM sessions so they survive backend restarts.
 * Falls back to in-memory Map if REDIS_URL is not set (Local Dev).
 */

const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

class RedisService {
    constructor() {
        this.client = null;
        this.memoryStore = new Map(); // Primary store
        this.useRedis = false;
        this.persistencePath = path.join(__dirname, '../vm-sessions.json');

        // Load persisted memory store if exists
        this._loadFromDisk();

        // Optional: Redis connection (disabled by default unless requested)
        if (process.env.USE_REDIS === 'true' && process.env.REDIS_URL) {
            console.log('📦 [Redis] Initializing connection (Explicitly Enabled)...');
            this.client = new Redis(process.env.REDIS_URL, {
                retryStrategy: (times) => Math.min(times * 50, 2000),
                maxRetriesPerRequest: 3
            });

            this.client.on('connect', () => {
                console.log('✅ [Redis] Connected');
                this.useRedis = true;
            });

            this.client.on('error', (err) => {
                console.warn(`⚠️ [Redis] Connection error: ${err.message}. Using file-based fallback.`);
                this.useRedis = false;
            });
        } else {
            console.log('📦 [Persistence] Using file-based storage (vm-sessions.json).');
        }
    }

    /**
     * Load memory store from disk
     */
    _loadFromDisk() {
        try {
            if (fs.existsSync(this.persistencePath)) {
                const data = fs.readFileSync(this.persistencePath, 'utf8');
                const parsed = JSON.parse(data);
                Object.entries(parsed).forEach(([key, val]) => {
                    this.memoryStore.set(key, val);
                });
                console.log(`💾 [Redis] Loaded ${this.memoryStore.size} sessions from disk`);
            }
        } catch (e) {
            console.warn('⚠️ [Redis] Failed to load from disk:', e.message);
        }
    }

    /**
     * Save memory store to disk
     */
    _saveToDisk() {
        try {
            const data = JSON.stringify(Object.fromEntries(this.memoryStore), null, 2);
            fs.writeFileSync(this.persistencePath, data);
        } catch (e) {
            console.warn('⚠️ [Redis] Failed to save to disk:', e.message);
        }
    }

    /**
     * Save VM Session
     * key: vm:<projectId>
     */
    async saveVMSession(projectId, data) {
        if (this.useRedis && this.client) {
            try {
                // Expire after 24 hours (just in case)
                await this.client.set(`vm:${projectId}`, JSON.stringify(data), 'EX', 86400);
                return true;
            } catch (e) {
                console.error('Redis save failed:', e);
            }
        }
        this.memoryStore.set(projectId, data);
        this._saveToDisk();
        return true;
    }

    /**
     * Get VM Session
     */
    async getVMSession(projectId) {
        if (this.useRedis && this.client) {
            try {
                const data = await this.client.get(`vm:${projectId}`);
                return data ? JSON.parse(data) : null;
            } catch (e) {
                console.error('Redis get failed:', e);
            }
        }
        return this.memoryStore.get(projectId) || null;
    }

    /**
     * Remove VM Session
     */
    async removeVMSession(projectId) {
        if (this.useRedis && this.client) {
            try {
                await this.client.del(`vm:${projectId}`);
            } catch (e) {
                console.error('Redis delete failed:', e);
            }
        }
        this.memoryStore.delete(projectId);
        this._saveToDisk();
        return true;
    }

    /**
     * Get All Active Sessions
     * Used by Gateway to route requests
     */
    async getAllSessions() {
        if (this.useRedis && this.client) {
            try {
                const keys = await this.client.keys('vm:*');
                if (keys.length === 0) return [];

                const pipeline = this.client.pipeline();
                keys.forEach(key => pipeline.get(key));
                const results = await pipeline.exec(); // [[err, result], ...]

                return results
                    .map(([err, res]) => res ? JSON.parse(res) : null)
                    .filter(item => item !== null);
            } catch (e) {
                console.error('Redis scan failed:', e);
                return Array.from(this.memoryStore.values()); // Fallback if redis fails mid-op
            }
        }
        return Array.from(this.memoryStore.values());
    }
}

module.exports = new RedisService();
