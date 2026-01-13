/**
 * Error Tracking Service - Centralized error handling and alerting
 *
 * Features:
 * - Centralized error logging with context
 * - Error categorization (critical, warning, info)
 * - Alert system for critical errors
 * - Error rate tracking
 * - Integration with metrics service
 */

const metricsService = require('./metrics-service');

class ErrorTrackingService {
    constructor() {
        this.errorCounts = new Map(); // errorType -> count
        this.lastAlertTime = new Map(); // errorType -> timestamp
        this.ALERT_COOLDOWN = 5 * 60 * 1000; // 5 minutes between alerts for same error
        this.CRITICAL_ERROR_THRESHOLD = 5; // Alert after 5 occurrences in 5 minutes
    }

    /**
     * Track an error
     * @param {object} options - Error details
     */
    async trackError(options) {
        const {
            operation,      // e.g., 'preview_creation', 'file_sync'
            error,          // Error object or string
            projectId,
            severity = 'error', // 'critical', 'error', 'warning', 'info'
            context = {}    // Additional context (userId, machineId, etc.)
        } = options;

        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        const errorStack = error?.stack || '';
        const errorType = this._categorizeError(error);

        // Log to console with appropriate level
        const emoji = this._getEmojiForSeverity(severity);
        console.log(`${emoji} [Error Tracker] ${operation}: ${errorMessage}`);

        if (severity === 'critical') {
            console.error(`   Stack: ${errorStack}`);
            console.error(`   Context: ${JSON.stringify(context)}`);
        }

        // Track in metrics
        await metricsService.trackError({
            projectId,
            operation,
            errorType,
            errorMessage,
            stack: errorStack
        }).catch(() => {}); // Silent fail

        // Update error counts for alerting
        this._updateErrorCounts(errorType);

        // Check if we should alert
        if (severity === 'critical') {
            this._checkAndAlert(errorType, errorMessage, operation, context);
        }

        return {
            logged: true,
            errorType,
            shouldRetry: this._shouldRetry(errorType)
        };
    }

    /**
     * Categorize error by type
     * @param {Error|string} error - The error
     * @returns {string} Error category
     */
    _categorizeError(error) {
        const message = error?.message || error?.toString() || '';
        const code = error?.code || '';

        // Network errors
        if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || message.includes('timeout')) {
            return 'network_timeout';
        }
        if (code === 'ENOTFOUND' || message.includes('getaddrinfo')) {
            return 'network_dns';
        }

        // Fly.io errors
        if (message.includes('Fly.io') || message.includes('Machine')) {
            return 'fly_api';
        }

        // Firebase/Storage errors
        if (message.includes('Firebase') || message.includes('Storage')) {
            return 'storage';
        }

        // Out of resources
        if (message.includes('out of memory') || message.includes('OOM')) {
            return 'out_of_memory';
        }
        if (message.includes('disk') || message.includes('ENOSPC')) {
            return 'disk_full';
        }

        // Auth errors
        if (message.includes('unauthorized') || message.includes('authentication')) {
            return 'auth';
        }

        // Parsing errors
        if (message.includes('JSON') || message.includes('parse')) {
            return 'parse';
        }

        return 'unknown';
    }

    /**
     * Get emoji for severity level
     */
    _getEmojiForSeverity(severity) {
        const map = {
            critical: '🚨',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return map[severity] || '❓';
    }

    /**
     * Check if error should trigger retry
     */
    _shouldRetry(errorType) {
        const retryableErrors = [
            'network_timeout',
            'network_dns',
            'fly_api'
        ];
        return retryableErrors.includes(errorType);
    }

    /**
     * Update error counts for alerting
     */
    _updateErrorCounts(errorType) {
        const count = (this.errorCounts.get(errorType) || 0) + 1;
        this.errorCounts.set(errorType, count);

        // Reset counts every 5 minutes
        setTimeout(() => {
            const current = this.errorCounts.get(errorType) || 0;
            this.errorCounts.set(errorType, Math.max(0, current - 1));
        }, 5 * 60 * 1000);
    }

    /**
     * Check if we should send an alert
     */
    _checkAndAlert(errorType, message, operation, context) {
        const count = this.errorCounts.get(errorType) || 0;
        const lastAlert = this.lastAlertTime.get(errorType) || 0;
        const now = Date.now();

        // Alert if:
        // 1. Error count exceeds threshold
        // 2. Cooldown period has passed since last alert
        if (count >= this.CRITICAL_ERROR_THRESHOLD && (now - lastAlert) > this.ALERT_COOLDOWN) {
            this._sendAlert({
                errorType,
                message,
                operation,
                count,
                context
            });

            this.lastAlertTime.set(errorType, now);
        }
    }

    /**
     * Send alert (console for now, can integrate with PagerDuty, Slack, etc.)
     */
    _sendAlert(alert) {
        console.error(`\n🚨🚨🚨 CRITICAL ALERT 🚨🚨🚨`);
        console.error(`Error Type: ${alert.errorType}`);
        console.error(`Operation: ${alert.operation}`);
        console.error(`Message: ${alert.message}`);
        console.error(`Count: ${alert.count} occurrences in 5 minutes`);
        console.error(`Context: ${JSON.stringify(alert.context, null, 2)}`);
        console.error(`Time: ${new Date().toISOString()}`);
        console.error(`🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n`);

        // TODO: In production, integrate with:
        // - Slack webhook
        // - PagerDuty
        // - Email alerts
        // - SMS alerts for critical issues
    }

    /**
     * Get error statistics
     */
    getStats() {
        const stats = {};
        for (const [errorType, count] of this.errorCounts.entries()) {
            if (count > 0) {
                stats[errorType] = count;
            }
        }
        return stats;
    }

    /**
     * Wrap an async function with error tracking
     * @param {string} operation - Operation name
     * @param {function} fn - Async function to wrap
     * @param {object} context - Additional context
     * @returns {function} Wrapped function
     */
    wrap(operation, fn, context = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                await this.trackError({
                    operation,
                    error,
                    severity: 'error',
                    context
                });
                throw error; // Re-throw to maintain original behavior
            }
        };
    }
}

module.exports = new ErrorTrackingService();
