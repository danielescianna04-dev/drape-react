/**
 * Coder Proxy Middleware
 * Proxies requests to Coder for VS Code Web and app previews
 * 
 * IMPROVEMENTS over legacy:
 * - Separated from main server
 * - Better error handling
 * - Cleaner URL parsing
 * - WebSocket support included
 */

const axios = require('axios');
const httpProxy = require('http-proxy');

const { CODER_API_URL, CODER_SESSION_TOKEN, CODER_WILDCARD_DOMAIN } = require('../utils/constants');

/**
 * Create HTTP proxy for Coder
 */
function createCoderProxy() {
    const proxy = httpProxy.createProxyServer({
        changeOrigin: true,
        ws: true
    });

    proxy.on('error', (err, req, res) => {
        console.error('❌ Coder proxy error:', err.message);
        if (res.writeHead) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
        }
    });

    return proxy;
}

/**
 * Parse Coder app path
 * Format: /@user/workspace/apps/appname/...
 */
function parseCoderAppPath(url) {
    if (!url.startsWith('/@')) return null;

    // Robust parsing: /@user/workspace/apps/app/path...
    // Parts: ['', '@user', 'workspace', 'apps', 'app', ...path]
    const parts = url.split('/');

    if (parts.length < 5) return null;

    // Extract basic info
    const user = parts[1].substring(1); // Remove @
    const workspace = parts[2];

    // Check structure
    const appsIndex = parts.indexOf('apps');
    if (appsIndex !== 3) return null; // Must be at index 3: /@u/w/apps/...

    const app = parts[4];

    // Reconstruct remaining path
    const pathParts = parts.slice(5);
    const pathStr = '/' + pathParts.join('/');

    return {
        user,
        workspace,
        app,
        path: pathStr
    };
}

/**
 * Middleware to proxy Coder requests
 */
function coderProxyMiddleware(req, res, next) {
    // Only handle Coder paths
    if (!req.url.startsWith('/@')) {
        return next();
    }

    const parsed = parseCoderAppPath(req.url);

    if (!parsed) {
        // Standard Coder path (dashboard, etc.)
        proxyToCoder(req, res);
        return;
    }

    // App path - proxy to Coder
    proxyToCoder(req, res, parsed);
}

/**
 * Proxy request to Coder
 */
async function proxyToCoder(req, res, appInfo = null) {
    const coderBase = CODER_API_URL || 'http://drape.info';
    const targetUrl = `${coderBase}${req.url}`;

    console.log(`🔀 Proxy: ${req.method} ${req.url.substring(0, 50)}`);

    try {
        const headers = {
            'Accept': req.headers.accept || '*/*',
            'User-Agent': req.headers['user-agent'] || 'Drape-Backend',
            'Cookie': req.headers.cookie || ''
        };

        // Add session token for authentication
        if (CODER_SESSION_TOKEN) {
            headers['Coder-Session-Token'] = CODER_SESSION_TOKEN;
        }

        // Set host header if using subdomain
        if (appInfo) {
            const wildcardDomain = CODER_WILDCARD_DOMAIN || 'drape.info';
            headers['Host'] = wildcardDomain;
        }

        console.log(`   Target: ${targetUrl}`);

        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers,
            data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
            responseType: 'stream',
            validateStatus: () => true,
            maxRedirects: 0,
            timeout: 30000
        });

        console.log(`   Response: ${response.status}`);

        // Forward response headers
        Object.entries(response.headers).forEach(([key, value]) => {
            if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key)) {
                res.setHeader(key, value);
            }
        });

        // Fix cookie paths
        const setCookie = response.headers['set-cookie'];
        if (setCookie) {
            const fixedCookies = setCookie.map(c => c.replace(/Path=\/[^;]*/i, 'Path=/'));
            res.setHeader('set-cookie', fixedCookies);
        }

        res.status(response.status);
        response.data.pipe(res);
    } catch (error) {
        console.error('❌ Proxy error:', error.message);
        console.error('   Error code:', error.code);
        console.error('   Error url:', targetUrl);

        if (!res.headersSent) {
            res.status(502).json({
                error: 'Proxy error',
                message: error.message
            });
        }
    }
}

/**
 * WebSocket upgrade handler for Coder
 */
function handleWebSocketUpgrade(wsProxy) {
    return (req, socket, head) => {
        console.log(`🔌 WS Upgrade: ${req.url}`);

        const parsed = parseCoderAppPath(req.url);
        const coderBase = CODER_API_URL || 'http://drape.info';

        if (parsed) {
            // App WebSocket - use subdomain
            const wildcardDomain = CODER_WILDCARD_DOMAIN || 'drape.info';
            const subdomain = `${parsed.app}--${parsed.workspace}--${parsed.user}.${wildcardDomain}`;
            const target = `http://${subdomain}`;

            // Rewrite URL to relative path
            req.url = parsed.path || '/';
            req.headers['Host'] = subdomain;
            req.headers['Origin'] = `http://${subdomain}`;

            console.log(`   Target: ${target}${req.url}`);

            wsProxy.ws(req, socket, head, { target });
        } else {
            // Standard Coder WebSocket
            req.headers['Coder-Session-Token'] = CODER_SESSION_TOKEN;

            wsProxy.ws(req, socket, head, { target: coderBase });
        }
    };
}

module.exports = {
    createCoderProxy,
    coderProxyMiddleware,
    handleWebSocketUpgrade,
    parseCoderAppPath,
    proxyToCoder
};
