/**
 * Routes Index
 * Holy Grail Architecture - Fly.io MicroVMs
 */

const express = require('express');
const router = express.Router();

// Import routes
const aiRoutes = require('./ai');
const githubRoutes = require('./github');
const gitRoutes = require('./git');
const workstationRoutes = require('./workstation');
const terminalRoutes = require('./terminal');
const flyRoutes = require('./fly'); // Holy Grail - Fly.io MicroVMs

// Health check - top level
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '2.0.0',
        architecture: 'holy-grail',
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
router.use('/terminal', terminalRoutes);
router.use('/fly', flyRoutes); // Holy Grail - Instant MicroVMs

// Backwards compatibility: redirect old /preview/* to /fly/*
router.use('/preview', (req, res) => {
    res.redirect(307, `/fly${req.url}`);
});

// API info
router.get('/', (req, res) => {
    res.json({
        name: 'Drape Backend API',
        version: '2.0.0',
        architecture: 'holy-grail',
        description: 'AI-powered Cloud IDE Backend with Fly.io MicroVMs',
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
            fly: {
                createProject: 'POST /fly/project/create',
                listFiles: 'GET /fly/project/:id/files',
                readFile: 'GET /fly/project/:id/file',
                writeFile: 'POST /fly/project/:id/file',
                exec: 'POST /fly/project/:id/exec',
                startPreview: 'POST /fly/preview/start',
                stopPreview: 'POST /fly/preview/stop',
                status: 'GET /fly/status'
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
            terminal: {
                execute: 'POST /terminal/execute',
                kill: 'POST /terminal/kill',
                logs: 'GET /terminal/logs/:workstationId'
            }
        }
    });
});

module.exports = router;
