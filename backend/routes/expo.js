/**
 * Expo Preview Routes
 * Special handling for Expo/React Native web previews
 */

const express = require('express');
const router = express.Router();
const { getLocalIP } = require('../utils/helpers');

const LOCAL_IP = getLocalIP();

/**
 * GET /expo-preview/:port
 * Serves an HTML wrapper that loads the Expo web bundle
 */
router.get('/:port', (req, res) => {
    const { port } = req.params;
    const metroUrl = `http://${LOCAL_IP}:${port}`;

    console.log(`📱 Expo Preview: port ${port}`);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Expo Web Preview - Drape</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body, #root {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #000;
    }
    #loading {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      color: #fff;
      z-index: 9999;
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid rgba(255,255,255,0.2);
      border-radius: 50%;
      border-top-color: #61dafb;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    #loading h2 {
      margin-top: 24px;
      font-size: 18px;
      font-weight: 500;
      color: #61dafb;
    }
    #loading p {
      margin-top: 12px;
      font-size: 14px;
      opacity: 0.6;
    }
    #loading .error {
      color: #ff6b6b;
      margin-top: 16px;
      font-size: 13px;
      max-width: 300px;
      text-align: center;
    }
    .retry-btn {
      margin-top: 20px;
      padding: 10px 24px;
      background: #61dafb;
      color: #000;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s ease;
    }
    .retry-btn:hover {
      transform: scale(1.05);
    }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <h2>Loading Expo Web</h2>
    <p>Connecting to Metro bundler...</p>
    <div id="error-msg" class="error" style="display: none;"></div>
    <button id="retry-btn" class="retry-btn" style="display: none;" onclick="location.reload()">Retry</button>
  </div>
  <div id="root"></div>

  <script>
    const METRO_URL = '${metroUrl}';
    const MAX_RETRIES = 30;
    let retryCount = 0;
    
    function showError(msg) {
      document.getElementById('error-msg').textContent = msg;
      document.getElementById('error-msg').style.display = 'block';
      document.getElementById('retry-btn').style.display = 'block';
      document.querySelector('.spinner').style.display = 'none';
    }
    
    function updateStatus(msg) {
      document.querySelector('#loading p').textContent = msg;
    }
    
    async function loadExpo() {
      try {
        updateStatus('Fetching manifest...');
        
        const response = await fetch(METRO_URL, { 
          headers: { 'Accept': 'application/json' },
          timeout: 5000
        });
        
        if (!response.ok) {
          throw new Error('Metro not ready: ' + response.status);
        }
        
        const manifest = await response.json();
        
        if (manifest.launchAsset && manifest.launchAsset.url) {
          let bundleUrl = manifest.launchAsset.url;
          
          // Ensure web platform
          bundleUrl = bundleUrl
            .replace('platform=ios', 'platform=web')
            .replace('platform=android', 'platform=web');
          
          updateStatus('Loading bundle...');
          console.log('Loading Expo bundle:', bundleUrl);
          
          const script = document.createElement('script');
          script.src = bundleUrl;
          script.onload = () => {
            console.log('Expo bundle loaded');
            document.getElementById('loading').style.display = 'none';
          };
          script.onerror = (e) => {
            showError('Failed to load bundle. Check console for details.');
            console.error('Bundle load error:', e);
          };
          document.body.appendChild(script);
        } else {
          // Try loading as regular React app
          updateStatus('Loading as React app...');
          const script = document.createElement('script');
          script.src = METRO_URL + '/bundle.js?platform=web';
          script.onload = () => {
            document.getElementById('loading').style.display = 'none';
          };
          script.onerror = () => {
            showError('Could not load bundle');
          };
          document.body.appendChild(script);
        }
      } catch (error) {
        console.log('Load attempt failed:', error.message);
        retryCount++;
        
        if (retryCount < MAX_RETRIES) {
          updateStatus('Waiting for Metro... (' + retryCount + '/' + MAX_RETRIES + ')');
          setTimeout(loadExpo, 2000);
        } else {
          showError('Could not connect to Metro bundler at ' + METRO_URL);
        }
      }
    }
    
    // Start loading
    setTimeout(loadExpo, 1000);
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

module.exports = router;
