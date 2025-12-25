/**
 * Routes Index
 * Register all API routes
 */

const express = require('express');
const router = express.Router();

// Import routes
const aiRoutes = require('./ai');
const githubRoutes = require('./github');
const gitRoutes = require('./git');
const workstationRoutes = require('./workstation');
const previewRoutes = require('./preview');
const terminalRoutes = require('./terminal');
const apiRoutes = require('./api');
const expoRoutes = require('./expo');
const flyRoutes = require('./fly'); // Holy Grail - Fly.io MicroVMs

// Health check - top level
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Mount API routes
router.use('/ai', aiRoutes);
router.use('/github', githubRoutes);
router.use('/git', gitRoutes);
router.use('/workstation', workstationRoutes);
router.use('/preview', previewRoutes);
router.use('/terminal', terminalRoutes);
router.use('/api', apiRoutes);
router.use('/expo-preview', expoRoutes);
router.use('/fly', flyRoutes); // Holy Grail - Instant MicroVMs

// API info
router.get('/', (req, res) => {
    res.json({
        name: 'Drape Backend API',
        version: '2.0.0',
        description: 'AI-powered Cloud IDE Backend',
        endpoints: {
            health: 'GET /health',
            ai: {
                chat: 'POST /ai/chat',
                models: 'GET /ai/models',
                analyze: 'POST /ai/analyze'
            },
            github: {
                deviceCode: 'POST /github/device-code',
                token: 'POST /github/token',
                user: 'GET /github/user',
                repos: 'GET /github/repos'
            },
            git: {
                status: 'GET /git/status/:projectId',
                pull: 'POST /git/pull/:projectId',
                push: 'POST /git/push/:projectId',
                commit: 'POST /git/commit/:projectId',
                branches: 'GET /git/branches/:projectId'
            },
            workstation: {
                files: 'GET /workstation/:projectId/files',
                readFile: 'POST /workstation/read-file',
                writeFile: 'POST /workstation/write-file',
                editFile: 'POST /workstation/edit-file',
                globFiles: 'POST /workstation/glob-files',
                searchFiles: 'POST /workstation/search-files',
                executeCommand: 'POST /workstation/execute-command'
            },
            preview: {
                start: 'POST /preview/start',
                logs: 'GET /preview/logs/:workstationId',
                clearCache: 'POST /preview/clear-cache',
                env: 'POST /preview/env'
            },
            terminal: {
                execute: 'POST /terminal/execute',
                kill: 'POST /terminal/kill',
                logs: 'GET /terminal/logs/:workstationId'
            },
            api: {
                workstations: 'GET /api/workstations',
                createWorkstation: 'POST /api/workstations',
                startWorkstation: 'POST /api/workstations/:id/start',
                stopWorkstation: 'POST /api/workstations/:id/stop',
                deleteWorkstation: 'DELETE /api/workstations/:id',
                templates: 'GET /api/templates',
                coderHealth: 'GET /api/health'
            }
        }
    });
});

module.exports = router;
