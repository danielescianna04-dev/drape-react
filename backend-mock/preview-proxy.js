const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');

class PreviewManager {
    constructor() {
        this.activeServers = new Map(); // sessionId -> { port, target, type, status }
        this.proxyInstances = new Map(); // sessionId -> proxyMiddleware
    }

    /**
     * Registra un nuovo server per preview
     */
    registerServer(sessionId, containerPort, hostPort, serverType = 'unknown') {
        const target = `http://localhost:${hostPort}`;
        
        const serverInfo = {
            containerPort,
            hostPort,
            target,
            type: serverType,
            status: 'active',
            registeredAt: Date.now(),
            lastAccessed: Date.now()
        };

        this.activeServers.set(sessionId, serverInfo);
        
        // Crea proxy middleware specifico per questa sessione
        const proxy = createProxyMiddleware({
            target,
            changeOrigin: true,
            ws: true, // Support WebSocket
            timeout: 30000,
            proxyTimeout: 30000,
            
            // Headers per CORS e preview
            onProxyReq: (proxyReq, req, res) => {
                proxyReq.setHeader('X-Warp-Session', sessionId);
                proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
                proxyReq.setHeader('X-Forwarded-Host', req.get('host'));
            },
            
            onProxyRes: (proxyRes, req, res) => {
                // CORS headers per cross-origin requests
                proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
                
                // Headers per development
                proxyRes.headers['X-Warp-Preview'] = 'true';
                proxyRes.headers['X-Warp-Session'] = sessionId;
                
                // Aggiorna timestamp accesso
                const server = this.activeServers.get(sessionId);
                if (server) {
                    server.lastAccessed = Date.now();
                }
            },
            
            onError: (err, req, res) => {
                console.error(`Proxy error for session ${sessionId}:`, err.message);
                
                // Segna server come non disponibile
                const server = this.activeServers.get(sessionId);
                if (server) {
                    server.status = 'error';
                    server.lastError = err.message;
                }
                
                // Risposta di errore user-friendly
                if (!res.headersSent) {
                    res.status(503).json({
                        error: 'Service Unavailable',
                        message: 'The development server is not responding',
                        sessionId,
                        details: err.message
                    });
                }
            }
        });

        this.proxyInstances.set(sessionId, proxy);
        
        console.log(`📡 Preview server registered for session ${sessionId}: ${target}`);
        return serverInfo;
    }

    /**
     * Ottiene info su server attivo
     */
    getServerInfo(sessionId) {
        return this.activeServers.get(sessionId);
    }

    /**
     * Ottiene tutti i server attivi
     */
    getAllServers() {
        return Object.fromEntries(this.activeServers);
    }

    /**
     * Middleware per gestire preview requests
     */
    getPreviewMiddleware() {
        return (req, res, next) => {
            // Estrae sessionId dall'URL: /preview/:sessionId/*
            const match = req.path.match(/^\/preview\/([^\/]+)(\/.*)?$/);
            
            if (!match) {
                return res.status(400).json({
                    error: 'Invalid preview URL',
                    format: '/preview/:sessionId/path'
                });
            }

            const sessionId = match[1];
            const targetPath = match[2] || '/';

            const server = this.activeServers.get(sessionId);
            if (!server) {
                return res.status(404).json({
                    error: 'Session not found',
                    sessionId,
                    message: 'No active server found for this session'
                });
            }

            if (server.status !== 'active') {
                return res.status(503).json({
                    error: 'Server not available',
                    sessionId,
                    status: server.status,
                    lastError: server.lastError
                });
            }

            // Ottieni proxy middleware per questa sessione
            const proxy = this.proxyInstances.get(sessionId);
            if (!proxy) {
                return res.status(500).json({
                    error: 'Proxy not configured',
                    sessionId
                });
            }

            // Modifica req.url per il proxy
            req.url = targetPath;
            
            // Applica proxy
            proxy(req, res, next);
        };
    }

    /**
     * Cleanup server inattivi
     */
    cleanupInactiveServers(timeoutMs = 30 * 60 * 1000) { // 30 minuti default
        const now = Date.now();
        const toRemove = [];

        for (const [sessionId, server] of this.activeServers.entries()) {
            if (now - server.lastAccessed > timeoutMs) {
                toRemove.push(sessionId);
            }
        }

        toRemove.forEach(sessionId => {
            this.removeServer(sessionId);
            console.log(`🧹 Cleaned up inactive preview server: ${sessionId}`);
        });

        return toRemove.length;
    }

    /**
     * Rimuove server
     */
    removeServer(sessionId) {
        this.activeServers.delete(sessionId);
        this.proxyInstances.delete(sessionId);
        console.log(`🗑️ Preview server removed for session: ${sessionId}`);
    }

    /**
     * Aggiorna status server
     */
    updateServerStatus(sessionId, status, error = null) {
        const server = this.activeServers.get(sessionId);
        if (server) {
            server.status = status;
            server.lastUpdated = Date.now();
            if (error) {
                server.lastError = error;
            }
        }
    }

    /**
     * Health check per server
     */
    async healthCheck(sessionId) {
        const server = this.activeServers.get(sessionId);
        if (!server) {
            return { healthy: false, error: 'Server not found' };
        }

        try {
            const response = await fetch(server.target, {
                method: 'HEAD',
                timeout: 5000
            });
            
            const healthy = response.ok;
            this.updateServerStatus(sessionId, healthy ? 'active' : 'error');
            
            return {
                healthy,
                status: response.status,
                target: server.target
            };
        } catch (error) {
            this.updateServerStatus(sessionId, 'error', error.message);
            return {
                healthy: false,
                error: error.message,
                target: server.target
            };
        }
    }

    /**
     * Genera URL preview pubblico
     */
    getPreviewUrl(sessionId, baseUrl, path = '') {
        const server = this.activeServers.get(sessionId);
        if (!server) return null;

        return `${baseUrl}/preview/${sessionId}${path}`;
    }

    /**
     * Statistiche preview
     */
    getStats() {
        const servers = Array.from(this.activeServers.values());
        
        return {
            totalServers: servers.length,
            activeServers: servers.filter(s => s.status === 'active').length,
            errorServers: servers.filter(s => s.status === 'error').length,
            serverTypes: servers.reduce((acc, server) => {
                acc[server.type] = (acc[server.type] || 0) + 1;
                return acc;
            }, {}),
            oldestServer: servers.reduce((oldest, server) => 
                !oldest || server.registeredAt < oldest.registeredAt ? server : oldest, null
            )?.registeredAt,
            totalRequests: servers.reduce((total, server) => 
                total + (server.requestCount || 0), 0
            )
        };
    }
}

module.exports = PreviewManager;