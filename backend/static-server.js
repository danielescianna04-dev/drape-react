/**
 * Simple Node.js Static File Server
 * Replacement for Python's http.server for systems without Python
 * With automatic port finding if requested port is in use
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Get port and directory from command line args
const requestedPort = parseInt(process.argv[2]) || 8000;
const directory = process.argv[3] || '.';

/**
 * Check if a port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - True if port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find an available port starting from the given port
 * @param {number} startPort - Starting port to try
 * @param {number} maxAttempts - Maximum number of ports to try
 * @returns {Promise<number>} - First available port
 */
async function findAvailablePort(startPort, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found after trying ${maxAttempts} ports starting from ${startPort}`);
}

// MIME types for common file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain'
};

const server = http.createServer((req, res) => {
  // Decode URL and remove query string
  let filePath = decodeURIComponent(req.url.split('?')[0]);

  // Default to index.html if path ends with /
  if (filePath.endsWith('/')) {
    filePath += 'index.html';
  }

  // Build full file path
  const fullPath = path.resolve(path.join(directory, filePath));
  const baseDir = path.resolve(directory);

  // Security: prevent directory traversal
  // Normalize both paths for Windows compatibility
  if (!fullPath.startsWith(baseDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // Check if file exists
  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      // File not found
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    // Get MIME type
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Read and serve file
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        console.error(`Error reading file: ${err.message}`);
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': data.length
      });
      res.end(data);
    });
  });
});

// Start server with automatic port finding
async function startServer() {
  try {
    const port = await findAvailablePort(requestedPort);

    if (port !== requestedPort) {
      console.log(`⚠️  Port ${requestedPort} is in use, using port ${port} instead`);
    }

    server.listen(port, '0.0.0.0', () => {
      // Output the actual port being used - this is parsed by the frontend
      console.log(`ACTUAL_PORT:${port}`);
      console.log(`Static file server running at http://0.0.0.0:${port}/`);
      console.log(`Serving files from: ${path.resolve(directory)}`);
    });

    server.on('error', (err) => {
      console.error(`Server error: ${err.message}`);
      process.exit(1);
    });
  } catch (err) {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

startServer();
