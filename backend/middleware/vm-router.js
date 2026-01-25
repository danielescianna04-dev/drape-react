/**
 * VM Router Middleware (The Gateway)
 * 
 * Routes incoming traffic to the correct Worker VM based on the `drape_vm_id` cookie.
 * This enables multi-tenancy on a single domain.
 */

const httpProxy = require('http-proxy');
const { URL } = require('url');
const orchestrator = require('../services/workspace-orchestrator');

// Create proxy instance
const proxy = httpProxy.createProxyServer({
    ignorePath: false, // We want to pass the full path to the VM
    changeOrigin: true
});

proxy.on('error', (err, req, res) => {
    console.error(`❌ [Gateway] Proxy error: ${err.message}`, req.url);
    if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway: Could not reach Worker VM');
    }
});

// Log proxy responses (only non-200 or non-polling)
proxy.on('proxyRes', (proxyRes, req, res) => {
    const isPolling = req.url.includes('?_=');
    if (!isPolling || proxyRes.statusCode !== 200) {
        console.log(`📥 [Gateway] Response: ${proxyRes.statusCode} ${req.url}`);
    }
});

const getRoutingMachineId = (req) => {
    // 1. Try header (Fastest for IDE-to-VM)
    let machineId = req.headers['fly-force-instance-id'] || req.headers['x-drape-vm-id'];
    if (machineId) return machineId;

    // 2. Try cookie (Standard for Browsers)
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
        } catch (e) {
            // URL parsing failed, continue
        }
    }

    return null;
};

const getTargetVM = async (machineId) => {
    if (!machineId) return null;
    const activeVMs = await orchestrator.getActiveVMs();
    return activeVMs.find(vm => vm.machineId === machineId || vm.vmId === machineId);
};

// Target is the shared App URL
const TARGET_GATEWAY = 'https://drape-workspaces.fly.dev';

/**
 * Main Middleware for HTTP requests
 */
const vmRouterMiddleware = async (req, res, next) => {
    // 1. Skip API routes / System routes (let Express handle them)
    // Note: using req.url because this is raw Node request
    const systemRoutes = [
        '/fly/', '/api/', '/ai/', '/github/', '/git/',
        '/workstation/', '/preview/', '/terminal/',
        '/expo-preview/', '/health', '/agent/', '/stats/'
    ];

    if (systemRoutes.some(route => req.url.startsWith(route))) {
        return next();
    }

    // 2. Extract Machine ID
    const machineId = getRoutingMachineId(req);

    if (!machineId) {
        // console.log(`⚠️ [Gateway] No route cookie for ${req.url} - 404`);
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

    // 3. Proxy Request directly to Fly.io with machine ID header
    // Skip VM lookup validation - Fly.io handles routing via Fly-Force-Instance-Id
    console.log(`🚀 [Gateway] Routing to ${machineId} for ${req.url}`);
    proxy.web(req, res, {
        target: TARGET_GATEWAY,
        headers: {
            'Fly-Force-Instance-Id': machineId
        }
    });
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

    console.log(`🔀 [Gateway-WS] Routing WS ${req.url} -> ${TARGET_GATEWAY} (Machine: ${machineId})`);

    proxy.ws(req, socket, head, {
        target: TARGET_GATEWAY,
        headers: {
            'Fly-Force-Instance-Id': machineId
        }
    });
};

module.exports = vmRouterMiddleware;
module.exports.getRoutingMachineId = getRoutingMachineId;
module.exports.proxyWS = proxyWS;
