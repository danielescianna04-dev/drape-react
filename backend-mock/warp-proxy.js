#!/usr/bin/env node

// Proxy locale per connettere Container Warp → Backend AWS
const http = require('http');
const https = require('https');
const url = require('url');

const AWS_API_BASE = 'https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod';
const PROXY_PORT = 8888;

// Sessioni attive (simple in-memory storage)
const sessions = new Map();

// Forward requests to AWS backend
async function forwardToAWS(path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const awsUrl = `${AWS_API_BASE}${path}`;
    console.log(`📡 Forwarding: ${method} ${awsUrl}`);
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    const req = https.request(awsUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: result
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: { raw: data }
          });
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ AWS Request Error:', error.message);
      reject(error);
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Create HTTP proxy server
const server = http.createServer(async (req, res) => {
  // Enable CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID, X-Session-ID');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  try {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    
    // Collect request body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        // Parse body if present
        let requestBody = null;
        if (body) {
          try {
            requestBody = JSON.parse(body);
          } catch (e) {
            requestBody = body;
          }
        }
        
        console.log(`\n🔄 ${req.method} ${path}`);
        console.log('📋 Headers:', req.headers);
        if (requestBody) console.log('📦 Body:', requestBody);
        
        // Special handling for simple command execution
        if (path === '/cmd' && req.method === 'POST') {
          // Simple command interface: POST /cmd with {command: "..."}
          if (!requestBody || !requestBody.command) {
            res.writeHead(400, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Command required'}));
            return;
          }
          
          // Get or create session
          let sessionId = req.headers['x-session-id'];
          if (!sessionId) {
            // Create new session
            console.log('🔑 Creating new session...');
            const sessionResponse = await forwardToAWS('/session/create', 'POST', {
              'X-User-ID': req.headers['x-user-id'] || 'warp-proxy-user'
            }, null);
            
            if (sessionResponse.body.success) {
              sessionId = sessionResponse.body.session.sessionId;
              sessions.set(sessionId, sessionResponse.body.session);
              console.log('✅ Session created:', sessionId);
            } else {
              res.writeHead(500, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({error: 'Failed to create session'}));
              return;
            }
          }
          
          // Execute command
          const result = await forwardToAWS('/command/execute', 'POST', {
            'X-Session-ID': sessionId
          }, {
            command: requestBody.command
          });
          
          // Add session info to response
          const responseBody = {
            ...result.body,
            sessionId: sessionId
          };
          
          res.writeHead(result.statusCode, {'Content-Type': 'application/json'});
          res.end(JSON.stringify(responseBody));
          
        } else {
          // Forward all other requests directly to AWS
          const result = await forwardToAWS(path, req.method, req.headers, requestBody);
          
          res.writeHead(result.statusCode, {'Content-Type': 'application/json'});
          res.end(JSON.stringify(result.body));
        }
        
      } catch (error) {
        console.error('❌ Processing Error:', error.message);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          error: 'Proxy error', 
          message: error.message
        }));
      }
    });
    
  } catch (error) {
    console.error('❌ Server Error:', error.message);
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Server error', message: error.message}));
  }
});

// Start server
server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`
🚀 Warp AI IDE Proxy Server
============================
✅ Server running on: http://localhost:${PROXY_PORT}
🌐 Accessible from container: http://host.docker.internal:${PROXY_PORT}
🔗 Proxying to: ${AWS_API_BASE}

📡 Available endpoints:
  POST /cmd                    # Simple command execution
  POST /session/create         # Create session  
  POST /command/execute        # Execute command
  GET  /health                 # Health check

🎯 Simple usage from container:
  curl -X POST http://host.docker.internal:${PROXY_PORT}/cmd \\
    -H "Content-Type: application/json" \\
    -d '{"command": "flutter --version"}'

🔄 Proxy ready! Send requests from Warp container...
`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server Error:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.log(`💡 Port ${PROXY_PORT} is already in use. Try a different port.`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down proxy server...');
  server.close(() => {
    console.log('✅ Proxy server stopped');
    process.exit(0);
  });
});