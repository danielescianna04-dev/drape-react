/**
 * Metrics Service - Performance tracking and monitoring
 *
 * Tracks:
 * - Preview creation time (cold start vs warm start)
 * - Success/failure rates
 * - VM pool hit rate
 * - Error types and frequencies
 * - Resource usage
 */

const admin = require('firebase-admin');

class MetricsService {
    constructor() {
        this.db = null;
        this.metricsCache = []; // Buffer metrics before writing to DB
        this.FLUSH_INTERVAL = 30000; // Flush every 30 seconds
        this.initialized = false;
    }

    /**
     * Initialize the metrics service
     */
    async initialize() {
        if (this.initialized) return;

        try {
            this.db = admin.firestore();
            console.log('📊 [Metrics] Metrics service initialized');

            // Start periodic flush
            this.startFlushTimer();

            this.initialized = true;
        } catch (e) {
            console.warn(`⚠️ [Metrics] Could not initialize: ${e.message}`);
        }
    }

    /**
     * Track preview creation
     * @param {object} data - Preview creation data
     */
    async trackPreviewCreation(data) {
        const metric = {
            type: 'preview_creation',
            timestamp: Date.now(),
            projectId: data.projectId,
            duration: data.duration, // Total time in ms
            success: data.success,
            vmSource: data.vmSource, // 'pool' or 'new'
            skipInstall: data.skipInstall, // Whether npm install was skipped
            projectType: data.projectType,
            error: data.error || null,
            phases: data.phases || {} // { vm: 120ms, sync: 1500ms, install: 30000ms, start: 5000ms }
        };

        this.metricsCache.push(metric);
        console.log(`📈 [Metrics] Preview: ${data.success ? '✅' : '❌'} ${data.duration}ms (${data.vmSource})`);

        // Flush if cache is getting large
        if (this.metricsCache.length >= 50) {
            this.flushMetrics();
        }
    }

    /**
     * Track VM pool metrics
     * @param {object} stats - VM pool statistics (supports both legacy and new nested format)
     */
    async trackVMPool(stats) {
        // Support new nested structure from getStats()
        const workers = stats.workers || {};
        const cacheMasters = stats.cacheMasters || {};

        const metric = {
            type: 'vm_pool_stats',
            timestamp: Date.now(),
            total: stats.total || 0,
            // Workers
            workersTotal: workers.total || 0,
            available: workers.available || 0,
            allocated: workers.allocated || 0,
            targetSize: workers.targetSize || stats.targetSize || 0,
            // Cache Masters
            cacheMastersTotal: cacheMasters.total || 0,
            cacheMastersPrewarmed: cacheMasters.prewarmed || 0,
            // Users
            activeUsers: stats.activeUsers || 0
        };

        this.metricsCache.push(metric);
    }

    /**
     * Track error occurrence
     * @param {object} data - Error data
     */
    async trackError(data) {
        const metric = {
            type: 'error',
            timestamp: Date.now(),
            projectId: data.projectId,
            operation: data.operation, // 'preview_creation', 'file_sync', etc.
            errorType: data.errorType,
            errorMessage: data.errorMessage,
            stack: data.stack
        };

        this.metricsCache.push(metric);
        console.log(`🚨 [Metrics] Error: ${data.operation} - ${data.errorType}`);

        // Flush errors immediately
        this.flushMetrics();
    }

    /**
     * Start the flush timer
     */
    startFlushTimer() {
        setInterval(() => {
            this.flushMetrics();
        }, this.FLUSH_INTERVAL);
    }

    /**
     * Flush metrics cache to Firestore
     */
    async flushMetrics() {
        if (!this.initialized || !this.db || this.metricsCache.length === 0) {
            return;
        }

        const batch = this.db.batch();
        const metricsToFlush = [...this.metricsCache];
        this.metricsCache = [];

        try {
            // Write metrics to Firestore
            for (const metric of metricsToFlush) {
                const docRef = this.db.collection('metrics').doc();
                batch.set(docRef, metric);

                // Special handling for AI usage: aggregate in a separate collection for faster querying
                if (metric.type === 'ai_usage') {
                    const today = new Date().toISOString().split('T')[0];
                    const hour = new Date(metric.timestamp).getHours().toString().padStart(2, '0');
                    const dailyRef = this.db.collection('usage_daily').doc(today);

                    batch.set(dailyRef, {
                        totalInputTokens: admin.firestore.FieldValue.increment(metric.inputTokens),
                        totalOutputTokens: admin.firestore.FieldValue.increment(metric.outputTokens),
                        totalCachedTokens: admin.firestore.FieldValue.increment(metric.cachedTokens),
                        [`hourly_${hour}`]: admin.firestore.FieldValue.increment(metric.inputTokens + metric.outputTokens),
                        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }

                // Special handling for search: increment daily and monthly counter
                if (metric.type === 'web_search') {
                    const now = new Date();
                    const today = now.toISOString().split('T')[0];
                    const month = today.substring(0, 7); // YYYY-MM

                    const dailyRef = this.db.collection('usage_daily').doc(today);
                    batch.set(dailyRef, {
                        totalSearches: admin.firestore.FieldValue.increment(1),
                        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    const monthlyRef = this.db.collection('usage_monthly').doc(month);
                    batch.set(monthlyRef, {
                        totalSearches: admin.firestore.FieldValue.increment(1),
                        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
            }

            await batch.commit();
            console.log(`📊 [Metrics] Flushed ${metricsToFlush.length} metrics to Firestore`);
        } catch (e) {
            console.warn(`⚠️ [Metrics] Flush failed: ${e.message}`);
            // Re-add to cache for retry
            this.metricsCache.unshift(...metricsToFlush);
        }
    }

    /**
     * Track AI usage
     * @param {object} data - Usage data { inputTokens, outputTokens, cachedTokens, model, projectId }
     */
    async trackAIUsage(data) {
        const metric = {
            type: 'ai_usage',
            timestamp: Date.now(),
            projectId: data.projectId,
            model: data.model,
            inputTokens: data.inputTokens || 0,
            outputTokens: data.outputTokens || 0,
            cachedTokens: data.cachedTokens || 0
        };

        this.metricsCache.push(metric);
    }

    /**
     * Track Web Search usage
     */
    async trackSearch(projectId = 'global') {
        const metric = {
            type: 'web_search',
            timestamp: Date.now(),
            projectId: projectId
        };

        this.metricsCache.push(metric);
    }

    /**
     * Get aggregated metrics (for dashboard)
     * @param {number} timeRangeMs - Time range in milliseconds
     * @returns {Promise<object>} Aggregated metrics
     */
    /**
     * Get real usage stats for the dashboard
     */
    async getSystemStatus() {
        if (!this.initialized || !this.db) {
            return this._getFallbackStats();
        }

        try {
            const today = new Date().toISOString().split('T')[0];
            const dailyDoc = await this.db.collection('usage_daily').doc(today).get();
            const dailyData = dailyDoc.exists ? dailyDoc.data() : {
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalCachedTokens: 0
            };

            // Calculate hourly data (last 24h) - simplified: just today's hourly
            const hourlyData = [];
            for (let i = 0; i < 24; i++) {
                const h = i.toString().padStart(2, '0');
                hourlyData.push(dailyData[`hourly_${h}`] || 0);
            }

            // Get VM Pool stats
            const vmPoolManager = require('./vm-pool-manager');
            const poolStats = vmPoolManager.getStats();

            // Get total projects (real count from DB)
            const projectsSnapshot = await this.db.collection('projects').get();
            const totalProjects = projectsSnapshot.size;

            const totalTokens = (dailyData.totalInputTokens || 0) + (dailyData.totalOutputTokens || 0);
            const tokenLimit = 1000000; // 1M hardcoded for now (could be per-plan)

            // Get monthly search usage
            const currentMonth = today.substring(0, 7);
            const monthlyDoc = await this.db.collection('usage_monthly').doc(currentMonth).get();
            const monthlyData = monthlyDoc.exists ? monthlyDoc.data() : { totalSearches: 0 };

            const totalSearches = monthlyData.totalSearches || 0;
            const searchLimit = 20;

            const projectsLimit = 5;

            return {
                tokens: {
                    used: totalTokens,
                    limit: tokenLimit,
                    percent: Math.min(100, Math.round((totalTokens / tokenLimit) * 100)),
                    hourly: hourlyData
                },
                previews: {
                    active: poolStats.allocated,
                    limit: 10, // Max concurrent previews
                    percent: Math.min(100, Math.round((poolStats.allocated / 10) * 100))
                },
                projects: {
                    active: totalProjects,
                    limit: projectsLimit,
                    percent: Math.min(100, Math.round((totalProjects / projectsLimit) * 100))
                },
                search: {
                    used: totalSearches,
                    limit: searchLimit,
                    percent: Math.min(100, Math.round((totalSearches / searchLimit) * 100))
                }
            };
        } catch (e) {
            console.error(`❌ [Metrics] Failed to get system status: ${e.message}`);
            return this._getFallbackStats();
        }
    }

    _getFallbackStats() {
        return {
            tokens: { used: 0, limit: 1000000, percent: 0, hourly: new Array(24).fill(0) },
            previews: { active: 0, limit: 10, percent: 0 },
            projects: { active: 0, limit: 5, percent: 0 },
            search: { used: 0, limit: 20, percent: 0 }
        };
    }
}

module.exports = new MetricsService();
