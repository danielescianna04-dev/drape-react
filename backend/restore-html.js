require('dotenv').config();
const flyService = require('./services/fly-service');

async function restoreHtml() {
    const vmId = '784975ec43e718';
    console.log(`🧹 RESTORING CLEAN index.html on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Drape React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>`;

    const b64 = Buffer.from(indexHtml).toString('base64');

    try {
        await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/index.html`, '/home/coder', vmId);
        console.log('✅ Restored clean index.html');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

restoreHtml();
