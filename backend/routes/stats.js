/**
 * Stats & Usage Routes
 * Real-time system monitoring and allocation tracking
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const metricsService = require('../services/metrics-service');

/**
 * GET /stats/system-status
 * Get real-time system allocation and token usage
 */
router.get('/system-status', asyncHandler(async (req, res) => {
    const status = await metricsService.getSystemStatus();
    res.json(status);
}));

module.exports = router;
