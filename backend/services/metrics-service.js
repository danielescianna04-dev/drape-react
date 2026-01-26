/**
 * Metrics Service - Performance tracking and monitoring
 *
 * Tracks:
 * - Preview creation time (cold start vs warm start)
 * - Success/failure rates
 * - VM pool hit rate
 * - Error types and frequencies
 * - Resource usage
 * - AI usage and costs per user (EUR)
 */

const admin = require('firebase-admin');
const { calculateCostEur, getPlan, checkBudget } = require('../utils/plans');

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
                        totalCostEur: admin.firestore.FieldValue.increment(metric.costEur || 0),
                        [`hourly_${hour}`]: admin.firestore.FieldValue.increment(metric.inputTokens + metric.outputTokens),
                        lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    // Also aggregate monthly
                    const currentMonth = today.substring(0, 7);
                    const monthlyRef = this.db.collection('usage_monthly').doc(currentMonth);
                    batch.set(monthlyRef, {
                        totalInputTokens: admin.firestore.FieldValue.increment(metric.inputTokens),
                        totalOutputTokens: admin.firestore.FieldValue.increment(metric.outputTokens),
                        totalCostEur: admin.firestore.FieldValue.increment(metric.costEur || 0),
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
     * Track AI usage with cost calculation
     * @param {object} data - Usage data { inputTokens, outputTokens, cachedTokens, model, projectId, userId }
     */
    async trackAIUsage(data) {
        const inputTokens = data.inputTokens || 0;
        const outputTokens = data.outputTokens || 0;
        const cachedTokens = data.cachedTokens || 0;

        // Calculate cost in EUR
        const costEur = calculateCostEur(data.model, inputTokens, outputTokens, cachedTokens);

        console.log(`📈 [Metrics] Tracking AI: ${inputTokens} in, ${outputTokens} out, cached: ${cachedTokens}, model: ${data.model}, cost: €${costEur.toFixed(6)}`);

        const metric = {
            type: 'ai_usage',
            timestamp: Date.now(),
            projectId: data.projectId,
            userId: data.userId || null,
            model: data.model,
            inputTokens,
            outputTokens,
            cachedTokens,
            costEur // Track cost in EUR
        };

        this.metricsCache.push(metric);

        // Flush immediately for AI usage (important for real-time dashboard)
        if (this.metricsCache.length >= 1) {
            this.flushMetrics().catch(e => console.warn(`⚠️ [Metrics] Flush failed: ${e.message}`));
        }

        // Update user's monthly spending if userId provided
        if (data.userId && this.db) {
            this._updateUserSpending(data.userId, costEur).catch(e =>
                console.warn(`⚠️ [Metrics] Failed to update user spending: ${e.message}`)
            );
        }

        return { costEur };
    }

    /**
     * Update user's monthly AI spending
     * @param {string} userId - User ID
     * @param {number} costEur - Cost to add in EUR
     */
    async _updateUserSpending(userId, costEur) {
        if (!this.db || !userId) return;

        const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
        const spendingRef = this.db.collection('user_spending').doc(`${userId}_${currentMonth}`);

        await spendingRef.set({
            userId,
            month: currentMonth,
            totalSpentEur: admin.firestore.FieldValue.increment(costEur),
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    /**
     * Get user's current monthly AI spending
     * @param {string} userId - User ID
     * @returns {Promise<number>} Total spent in EUR this month
     */
    async getUserMonthlySpending(userId) {
        if (!this.db || !userId) return 0;

        try {
            const currentMonth = new Date().toISOString().substring(0, 7);
            const spendingDoc = await this.db.collection('user_spending').doc(`${userId}_${currentMonth}`).get();

            if (spendingDoc.exists) {
                return spendingDoc.data().totalSpentEur || 0;
            }
            return 0;
        } catch (e) {
            console.warn(`⚠️ [Metrics] Failed to get user spending: ${e.message}`);
            return 0;
        }
    }

    /**
     * Check if user can make an AI call based on their plan budget
     * @param {string} userId - User ID
     * @param {string} planId - User's plan ID (free, go, pro, enterprise)
     * @param {string} model - AI model to use
     * @param {number} estimatedInputTokens - Estimated input tokens (optional)
     * @returns {Promise<object>} { allowed, reason, remaining, budgetEur, spentEur }
     */
    async checkUserBudget(userId, planId, model, estimatedInputTokens = 3000) {
        const currentSpent = await this.getUserMonthlySpending(userId);

        // Estimate cost for this call
        const estimatedCost = calculateCostEur(model, estimatedInputTokens, 500, 0);

        const result = checkBudget(currentSpent, estimatedCost, planId);
        result.estimatedCostEur = estimatedCost;

        if (!result.allowed) {
            console.log(`🚫 [Metrics] Budget exceeded for user ${userId}: spent €${currentSpent.toFixed(4)} / €${result.budgetEur}`);
        }

        return result;
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
        console.log(`📊 [Metrics] getSystemStatus called - initialized: ${this.initialized}, hasDb: ${!!this.db}`);

        // Always try to get VM pool stats (works without Firebase)
        let poolStats = { workers: { allocated: 0 } };
        try {
            const vmPoolManager = require('./vm-pool-manager');
            poolStats = vmPoolManager.getStats();
            console.log(`📊 [Metrics] VM Pool: ${poolStats.workers?.allocated || 0} allocated, ${poolStats.workers?.available || 0} available`);
        } catch (e) {
            console.warn(`⚠️ [Metrics] Could not get VM pool stats: ${e.message}`);
        }

        if (!this.initialized || !this.db) {
            console.log(`📊 [Metrics] Using fallback stats (Firebase not ready)`);
            // Return partial stats with VM pool data
            const stats = this._getFallbackStats();
            stats.previews.active = poolStats.workers?.allocated || 0;
            stats.previews.percent = Math.min(100, Math.round((stats.previews.active / 10) * 100));
            return stats;
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

            // Extract workers allocated (active previews) from poolStats fetched at top
            const activePreviewsCount = poolStats.workers?.allocated || 0;

            // Get total projects (real count from DB) - use user_projects collection
            let totalProjects = 0;
            try {
                const projectsSnapshot = await this.db.collection('user_projects').get();
                totalProjects = projectsSnapshot.size;
            } catch (e) {
                console.warn(`⚠️ [Metrics] Could not count projects: ${e.message}`);
            }

            const totalTokens = (dailyData.totalInputTokens || 0) + (dailyData.totalOutputTokens || 0);
            const tokenLimit = 1000000; // 1M hardcoded for now (could be per-plan)

            // Get monthly search usage
            const currentMonth = today.substring(0, 7);
            let totalSearches = 0;
            try {
                const monthlyDoc = await this.db.collection('usage_monthly').doc(currentMonth).get();
                const monthlyData = monthlyDoc.exists ? monthlyDoc.data() : { totalSearches: 0 };
                totalSearches = monthlyData.totalSearches || 0;
            } catch (e) {
                console.warn(`⚠️ [Metrics] Could not get search stats: ${e.message}`);
            }

            const searchLimit = 20;
            const projectsLimit = 5;
            const previewsLimit = 10;

            console.log(`📊 [Metrics] Stats: tokens=${totalTokens}, previews=${activePreviewsCount}, projects=${totalProjects}, searches=${totalSearches}`);

            return {
                tokens: {
                    used: totalTokens,
                    limit: tokenLimit,
                    percent: Math.min(100, Math.round((totalTokens / tokenLimit) * 100)),
                    hourly: hourlyData
                },
                previews: {
                    active: activePreviewsCount,
                    limit: previewsLimit,
                    percent: Math.min(100, Math.round((activePreviewsCount / previewsLimit) * 100))
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
