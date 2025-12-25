/**
 * VM Router Middleware (The Gateway)
 * 
 * Routes incoming traffic to the correct Worker VM based on the `drape_vm_id` cookie.
 * This enables multi-tenancy on a single domain.
 */

const httpProxy = require('http-proxy');
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

module.exports = async (req, res, next) => {
    // 1. Skip API routes / System routes (let Express handle them)
    // Note: using req.url because this is raw Node request
    if (req.url.startsWith('/fly/') || req.url.startsWith('/api/') || req.url === '/health') {
        return next();
    }

    // 2. Cookie Logic
    // We expect a cookie: "drape_vm_id=<machine_id>"
    const cookieHeader = req.headers.cookie;
    let machineId = null;

    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split('=');
            acc[name] = value;
            return acc;
        }, {});
        machineId = cookies['drape_vm_id'];
    }

    if (!machineId) {
        // console.log(`⚠️ [Gateway] No route cookie for ${req.url} - 404`);
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
                <body style="background:#1a1b1e; color:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh;">
                    <div style="text-align:center">
                        <h1>Running 404 (Gateway)</h1>
                        <p>No active workspace session found.</p>
                        <p>Please open a project in Drape IDE.</p>
                    </div>
                </body>
            </html>
        `);
        return;
    }

    // 3. Lookup VM IP
    // Reads from Redis (async)
    const activeVMs = await orchestrator.getActiveVMs();
    const targetVM = activeVMs.find(vm => vm.machineId === machineId || vm.vmId === machineId);

    if (!targetVM) {
        console.log(`⚠️ [Gateway] VM ${machineId} not active/found`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Workspace not active');
        return;
    }

    // 4. Proxy Request
    // Hybrid Mode: Use Public URL + Fly-Force-Instance-Id header.
    // This allows Local Backend to route to Remote VMs correctly (Development Mode).
    // In Production (Fly-to-Fly), this also works by routing via the public/shared edge.

    // Target is the shared App URL
    const target = 'https://drape-workspaces.fly.dev';

    // console.log(`🔀 [Gateway] Routing ${req.url} -> ${target} (Machine: ${machineId})`);

    proxy.web(req, res, {
        target,
        headers: {
            'Fly-Force-Instance-Id': machineId
        }
    });
};
