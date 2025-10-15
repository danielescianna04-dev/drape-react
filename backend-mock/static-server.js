const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

const serveDir = path.resolve(process.argv[2] || '.');

// Serve static files from a directory
app.use(express.static(serveDir, {
    index: ['index.html', 'index.htm'],
    setHeaders: (res, filePath) => {
        // Set correct Content-Type for CSS
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        }
    }
}));

// Fallback for SPA routing
app.get('*', (req, res) => {
    const indexPath = path.join(serveDir, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Not Found');
    }
});

const port = process.argv[3] || 8000;
app.listen(port, '0.0.0.0', () => {
    console.log(`Static server running on port ${port}`);
    console.log(`Serving files from: ${serveDir}`);
});
