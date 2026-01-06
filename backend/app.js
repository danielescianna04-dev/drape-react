/**
 * Drape Backend - Express App Configuration
 * Holy Grail Architecture - Fly.io MicroVMs
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');

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
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        exposedHeaders: ['Content-Type', 'Content-Length']
    }));

    // Parse JSON with increased limit for code content
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging (skip for static files)
    app.use((req, res, next) => {
        if (req.url.startsWith('/static')) {
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
    // ERROR HANDLING
    // ===========================================

    // 404 handler for unmatched routes
    app.use(notFoundHandler);

    // Global error handler
    app.use(errorHandler);

    return app;
}

module.exports = createApp;
