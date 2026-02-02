/**
 * Container Router Middleware (The Gateway)
 *
 * Routes incoming traffic to the correct Docker container based on the `drape_vm_id` cookie.
 * In Docker mode, each container has a unique host port. We look up the container's
 * agentUrl from active sessions and proxy directly to it.
 */

const httpProxy = require('http-proxy');
const { URL } = require('url');
const orchestrator = require('../services/workspace-orchestrator');
const redisService = require('../services/redis-service');

// Create proxy instance
const proxy = httpProxy.createProxyServer({
    ignorePath: false,
    changeOrigin: true,
    ws: true
});

proxy.on('error', (err, req, res) => {
    console.error(`❌ [Gateway] Proxy error: ${err.message}`, req.url);
    if (res && !res.headersSent && typeof res.writeHead === 'function') {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway: Could not reach container');
    }
});

proxy.on('proxyRes', (proxyRes, req) => {
    const isPolling = req.url.includes('?_=');
    if (!isPolling || proxyRes.statusCode !== 200) {
        console.log(`📥 [Gateway] Response: ${proxyRes.statusCode} ${req.url}`);
    }
});

const getRoutingMachineId = (req) => {
    // 1. Try header
    let machineId = req.headers['x-drape-vm-id'];
    if (machineId) return machineId;

    // 2. Try cookie
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split('=');
            acc[name] = value;
            return acc;
        }, {});
        if (cookies['drape_vm_id']) return cookies['drape_vm_id'];
    }

    // 3. Try query param (Express parsed)
    if (req.query && req.query.drape_vm_id) {
        return req.query.drape_vm_id;
    }

    // 4. Try parsing URL query params directly (for WebSocket upgrades without Express)
    if (req.url && req.url.includes('?')) {
        try {
            const fullUrl = `http://localhost${req.url}`;
            const urlParams = new URL(fullUrl).searchParams;
            if (urlParams.get('drape_vm_id')) {
                return urlParams.get('drape_vm_id');
            }
        } catch (e) {}
    }

    return null;
};

// Cache of machineId -> agentUrl to avoid Redis lookup on every request
const urlCache = new Map();
const URL_CACHE_TTL = 30000; // 30 seconds

const getContainerUrl = async (machineId) => {
    if (!machineId) return null;

    // Check local cache
    const cached = urlCache.get(machineId);
    if (cached && Date.now() - cached.ts < URL_CACHE_TTL) {
        return cached.url;
    }

    // Look up from active VMs
    const activeVMs = await orchestrator.getActiveVMs();
    const vm = activeVMs.find(v => v.machineId === machineId || v.vmId === machineId);

    if (vm && vm.agentUrl) {
        urlCache.set(machineId, { url: vm.agentUrl, ts: Date.now() });
        return vm.agentUrl;
    }

    // Fallback: check Redis session
    try {
        // Search all sessions for this machineId
        const vmPoolManager = require('../services/vm-pool-manager');
        const poolEntry = vmPoolManager.getVMState(machineId);
        if (poolEntry && poolEntry.agentUrl) {
            urlCache.set(machineId, { url: poolEntry.agentUrl, ts: Date.now() });
            return poolEntry.agentUrl;
        }
    } catch (e) {}

    return null;
};

/**
 * Main Middleware for HTTP requests
 */
const vmRouterMiddleware = async (req, res, next) => {
    // Skip API routes / System routes (let Express handle them)
    const systemRoutes = [
        '/fly/', '/api/', '/ai/', '/github/', '/git/',
        '/workstation/', '/preview/', '/terminal/',
        '/expo-preview/', '/health', '/agent/', '/stats/'
    ];

    if (systemRoutes.some(route => req.url.startsWith(route))) {
        return next();
    }

    const machineId = getRoutingMachineId(req);

    if (!machineId) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
                <body style="background:#0b111a; color:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
                    <div style="text-align:center; max-width: 400px; padding: 40px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 20px;">
                        <h1 style="font-size: 24px;">Workspace non trovato</h1>
                        <p style="color: #94a3b8;">Nessuna sessione attiva trovata per questo browser.</p>
                        <p style="color: #64748b; font-size: 14px;">Assicurati di avere il progetto aperto in Drape e clicca su "Start Preview".</p>
                    </div>
                </body>
            </html>
        `);
        return;
    }

    // Look up container URL
    const targetUrl = await getContainerUrl(machineId);

    if (!targetUrl) {
        console.warn(`⚠️ [Gateway] No container URL for machineId: ${machineId}`);
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Container not found or not ready');
        return;
    }

    console.log(`🚀 [Gateway] Routing to ${targetUrl} for ${req.url}`);
    proxy.web(req, res, { target: targetUrl });
};

/**
 * WebSocket Proxying (Vite HMR support)
 */
const proxyWS = async (req, socket, head) => {
    const machineId = getRoutingMachineId(req);

    if (!machineId) {
        console.warn(`⚠️ [Gateway-WS] No machineId for WS upgrade: ${req.url}`);
        socket.destroy();
        return;
    }

    const targetUrl = await getContainerUrl(machineId);

    if (!targetUrl) {
        console.warn(`⚠️ [Gateway-WS] No container URL for: ${machineId}`);
        socket.destroy();
        return;
    }

    console.log(`🔀 [Gateway-WS] Routing WS ${req.url} -> ${targetUrl} (Container: ${machineId.substring(0, 12)})`);
    proxy.ws(req, socket, head, { target: targetUrl });
};

module.exports = vmRouterMiddleware;
module.exports.getRoutingMachineId = getRoutingMachineId;
module.exports.proxyWS = proxyWS;
