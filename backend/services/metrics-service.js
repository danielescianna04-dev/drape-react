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
     * @param {object} stats - VM pool statistics
     */
    async trackVMPool(stats) {
        const metric = {
            type: 'vm_pool_stats',
            timestamp: Date.now(),
            total: stats.total,
            available: stats.available,
            allocated: stats.allocated,
            targetSize: stats.targetSize
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
     * Get aggregated metrics (for dashboard)
     * @param {number} timeRangeMs - Time range in milliseconds
     * @returns {Promise<object>} Aggregated metrics
     */
    async getAggregatedMetrics(timeRangeMs = 24 * 60 * 60 * 1000) {
        if (!this.initialized || !this.db) {
            return null;
        }

        try {
            const since = Date.now() - timeRangeMs;
            const snapshot = await this.db.collection('metrics')
                .where('timestamp', '>=', since)
                .get();

            const metrics = snapshot.docs.map(doc => doc.data());

            // Aggregate preview metrics
            const previewMetrics = metrics.filter(m => m.type === 'preview_creation');
            const successfulPreviews = previewMetrics.filter(m => m.success);
            const poolHits = previewMetrics.filter(m => m.vmSource === 'pool');
            const installSkips = previewMetrics.filter(m => m.skipInstall);

            const avgDuration = successfulPreviews.length > 0
                ? successfulPreviews.reduce((sum, m) => sum + m.duration, 0) / successfulPreviews.length
                : 0;

            return {
                timeRange: timeRangeMs,
                previews: {
                    total: previewMetrics.length,
                    successful: successfulPreviews.length,
                    failed: previewMetrics.length - successfulPreviews.length,
                    successRate: previewMetrics.length > 0
                        ? (successfulPreviews.length / previewMetrics.length * 100).toFixed(2) + '%'
                        : 'N/A',
                    avgDuration: Math.round(avgDuration),
                    poolHitRate: previewMetrics.length > 0
                        ? (poolHits.length / previewMetrics.length * 100).toFixed(2) + '%'
                        : 'N/A',
                    installSkipRate: previewMetrics.length > 0
                        ? (installSkips.length / previewMetrics.length * 100).toFixed(2) + '%'
                        : 'N/A'
                },
                errors: {
                    total: metrics.filter(m => m.type === 'error').length
                }
            };
        } catch (e) {
            console.error(`❌ [Metrics] Failed to get aggregated metrics: ${e.message}`);
            return null;
        }
    }
}

module.exports = new MetricsService();
