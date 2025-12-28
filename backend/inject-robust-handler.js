require('dotenv').config();
const flyService = require('./services/fly-service');

async function injectRobustHandler() {
    const vmId = '784975ec43e718';
    console.log(`🛡️ INJECTING ROBUST HANDLER into index.html on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Drape Debug</title>
    <script>
      function showBox(color, title, msg) {
        var box = document.createElement('div');
        box.style.position = 'fixed';
        box.style.top = '0';
        box.style.left = '0';
        box.style.width = '100%';
        box.style.backgroundColor = color;
        box.style.color = 'white';
        box.style.padding = '20px';
        box.style.zIndex = '999999';
        box.style.fontFamily = 'monospace';
        box.style.whiteSpace = 'pre-wrap';
        box.innerText = title + ':\\n' + msg;
        document.body.appendChild(box);
      }

      window.onerror = function(msg, url, line, col, error) {
        showBox('rgba(100,0,0,0.95)', '🔥 JS ERROR', msg + '\\n' + url + ':' + line);
        return false;
      };

      window.addEventListener('unhandledrejection', function(event) {
         showBox('rgba(100,0,0,0.95)', '🔥 PROMISE REJECTION', event.reason);
      });

      // CAPTURE PHASE for resource errors (script/css/img 404s)
      window.addEventListener('error', function(event) {
        if (event.target && (event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK')) {
            showBox('rgba(200,100,0,0.95)', '⚠️ RESOURCE FAIL', 'Failed to load: ' + (event.target.src || event.target.href));
        }
      }, true);
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
    <script>console.log("Creation of Scripts completed");</script>
  </body>
</html>`;

    const b64 = Buffer.from(indexHtml).toString('base64');

    try {
        await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/index.html`, '/home/coder', vmId);
        console.log('✅ Injected Robust Error Handler into index.html');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

injectRobustHandler();
