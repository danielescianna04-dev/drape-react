require('dotenv').config();
const flyService = require('./services/fly-service');

async function injectGlobalHandler() {
    const vmId = '784975ec43e718';
    console.log(`🚑 INJECTING GLOBAL HANDLER into index.html on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Drape Debug</title>
    <script>
      // 🚨 GLOBAL ERROR HANDLER (BEFORE MODULES LOAD)
      window.onerror = function(msg, url, line, col, error) {
        var box = document.createElement('div');
        box.style.position = 'fixed';
        box.style.top = '0';
        box.style.left = '0';
        box.style.width = '100%';
        box.style.backgroundColor = 'rgba(100,0,0,0.95)';
        box.style.color = 'white';
        box.style.padding = '20px';
        box.style.zIndex = '999999';
        box.style.fontFamily = 'monospace';
        box.innerText = '🔥 CRITICAL ERROR:\\n' + msg + '\\n' + url + ':' + line;
        document.body.appendChild(box);
        return false;
      };
      window.addEventListener('unhandledrejection', function(event) {
         window.onerror('Unhandled Rejection: ' + event.reason);
      });
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>`;

    const b64 = Buffer.from(indexHtml).toString('base64');

    try {
        await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/index.html`, '/home/coder', vmId);
        console.log('✅ Injected Global Error Handler into index.html');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

injectGlobalHandler();
