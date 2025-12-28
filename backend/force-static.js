require('dotenv').config();
const flyService = require('./services/fly-service');

async function forceStatic() {
    const vmId = '784975ec43e718';
    console.log(`🧱 STATIC OPTION: Forcing static HTML on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    const staticHtml = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>STATIC DEBUG</title>
    <style>body { background-color: purple !important; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; }</style>
  </head>
  <body>
    <h1>STATIC HTML WORKS</h1>
    <script>console.log("Static JS works");</script>
  </body>
</html>
`;

    const b64 = Buffer.from(staticHtml).toString('base64');

    try {
        await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/index.html`, '/home/coder', vmId);
        console.log('✅ Overwrote index.html with Static HTML');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

forceStatic();
