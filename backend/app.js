/**
 * Drape Backend - Express App Configuration
 * Complete configuration with all middleware and routes
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');
const { coderProxyMiddleware } = require('./middleware/coderProxy');

// Import routes
const routes = require('./routes');

/**
 * Create and configure Express app
 */
function createApp() {
    const app = express();

    // ===========================================
    // GLOBAL MIDDLEWARE
    // ===========================================

    // CORS - allow all origins for development
    app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Coder-Session-Token'],
        exposedHeaders: ['Content-Type', 'Content-Length']
    }));

    // Parse JSON with increased limit for code content
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging (skip for static files and proxy)
    app.use((req, res, next) => {
        // Skip logging for proxy requests (too verbose)
        if (req.url.startsWith('/@') || req.url.startsWith('/static')) {
            return next();
        }
        requestLogger(req, res, next);
    });

    // ===========================================
    // STATIC FILES
    // ===========================================

    // Serve static files from public directory
    app.use('/static', express.static(path.join(__dirname, 'public')));

    // ===========================================
    // API ROUTES
    // ===========================================

    // Mount all API routes
    app.use('/', routes);

    // ===========================================
    // CODER PROXY (Catch-All for /@user/workspace paths)
    // ===========================================

    // This must come after API routes but before 404 handler
    app.use(coderProxyMiddleware);

    // ===========================================
    // ERROR HANDLING
    // ===========================================

    // 404 handler for unmatched routes
    app.use((req, res, next) => {
        // Don't 404 for Coder paths (they're handled by proxy)
        if (req.url.startsWith('/@')) {
            return next();
        }
        notFoundHandler(req, res, next);
    });

    // Global error handler
    app.use(errorHandler);

    return app;
}

module.exports = createApp;
