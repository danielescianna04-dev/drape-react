/**
 * Redis Service for State Persistence
 * 
 * Stores active VM sessions so they survive backend restarts.
 * Falls back to in-memory Map if REDIS_URL is not set (Local Dev).
 */

const Redis = require('ioredis');

class RedisService {
    constructor() {
        this.client = null;
        this.memoryStore = new Map(); // Fallback
        this.useRedis = false;

        if (process.env.REDIS_URL) {
            console.log('📦 [Redis] Initializing connection...');
            this.client = new Redis(process.env.REDIS_URL, {
                retryStrategy: (times) => Math.min(times * 50, 2000),
                maxRetriesPerRequest: 3
            });

            this.client.on('connect', () => {
                console.log('✅ [Redis] Connected');
                this.useRedis = true;
            });

            this.client.on('error', (err) => {
                console.warn(`⚠️ [Redis] Connection error: ${err.message}. Using in-memory fallback.`);
                this.useRedis = false;
            });
        } else {
            console.log('⚠️ [Redis] REDIS_URL not set. Using in-memory storage (State will be lost on restart).');
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
