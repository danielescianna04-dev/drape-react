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
    if (err) {
      // Path doesn't exist - check if it's a directory request without trailing slash
      const dirPath = fullPath.replace(/\/index\.html$/, '');
      fs.stat(dirPath, (dirErr, dirStats) => {
        if (!dirErr && dirStats.isDirectory()) {
          // It's a directory - generate listing
          generateDirectoryListing(dirPath, filePath.replace(/\/index\.html$/, '/'), res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        }
      });
      return;
    }

    if (stats.isDirectory()) {
      // It's a directory - check for index.html first
      const indexPath = path.join(fullPath, 'index.html');
      fs.stat(indexPath, (indexErr, indexStats) => {
        if (!indexErr && indexStats.isFile()) {
          // Serve index.html
          serveFile(indexPath, res);
        } else {
          // Generate directory listing
          generateDirectoryListing(fullPath, filePath, res);
        }
      });
      return;
    }

    // It's a file - serve it
    serveFile(fullPath, res);
  });
});

/**
 * Serve a file with proper MIME type
 */
function serveFile(fullPath, res) {
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

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
}

/**
 * Generate an HTML directory listing page
 */
function generateDirectoryListing(dirPath, urlPath, res) {
  fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
      return;
    }

    // Sort: directories first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    // Generate HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Index of ${urlPath}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 20px;
      min-height: 100vh;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      padding: 16px 0;
      border-bottom: 1px solid #21262d;
      margin-bottom: 16px;
      color: #58a6ff;
    }
    .breadcrumb { color: #8b949e; }
    .breadcrumb a { color: #58a6ff; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }
    ul { list-style: none; }
    li {
      border-bottom: 1px solid #21262d;
    }
    li:last-child { border-bottom: none; }
    a {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 8px;
      color: #c9d1d9;
      text-decoration: none;
      transition: background 0.15s;
    }
    a:hover { background: #161b22; }
    .icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    .folder { color: #54aeff; }
    .file { color: #8b949e; }
    .name { flex: 1; }
    .folder-name { color: #58a6ff; font-weight: 500; }
    .parent { color: #8b949e; }
  </style>
</head>
<body>
  <div class="container">
    <h1>
      <span class="breadcrumb">${generateBreadcrumb(urlPath)}</span>
    </h1>
    <ul>
      ${urlPath !== '/' ? `<li><a href="../"><svg class="icon parent" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12L2 6h12z"/></svg><span class="name parent">..</span></a></li>` : ''}
      ${entries.map(entry => {
        const isDir = entry.isDirectory();
        const href = isDir ? `${entry.name}/` : entry.name;
        const icon = isDir
          ? '<svg class="icon folder" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/></svg>'
          : '<svg class="icon file" viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6h-2.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25V1.75z"/></svg>';
        const nameClass = isDir ? 'name folder-name' : 'name';
        return `<li><a href="${href}">${icon}<span class="${nameClass}">${entry.name}</span></a></li>`;
      }).join('\n      ')}
    </ul>
  </div>
</body>
</html>`;

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Length': Buffer.byteLength(html)
    });
    res.end(html);
  });
}

/**
 * Generate breadcrumb navigation HTML
 */
function generateBreadcrumb(urlPath) {
  if (urlPath === '/') return '/';

  const parts = urlPath.split('/').filter(Boolean);
  let html = '<a href="/">/</a>';
  let currentPath = '';

  parts.forEach((part, i) => {
    currentPath += '/' + part;
    if (i < parts.length - 1) {
      html += ` <a href="${currentPath}/">${part}</a> /`;
    } else {
      html += ` ${part} /`;
    }
  });

  return html;
}

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
