require('dotenv').config();
const flyService = require('./services/fly-service');

async function restoreFull() {
    const vmId = '784975ec43e718';
    console.log(`♻️  RESTORING APP on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Restore index.html
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

    // 2. Restore src/index.tsx (Using Relative Import for App)
    const indexTsx = `import { createRoot } from 'react-dom/client'
import 'tailwindcss/tailwind.css'
import App from './components/App'

const container = document.getElementById('root') as HTMLDivElement
if (container) {
    const root = createRoot(container)
    root.render(<App />)
} else {
    console.error('Failed to find root element');
}
`;

    try {
        const htmlB64 = Buffer.from(indexHtml).toString('base64');
        await flyService.exec(agentUrl, `echo "${htmlB64}" | base64 -d > /home/coder/project/index.html`, '/home/coder', vmId);
        console.log('✅ Restored index.html');

        const tsxB64 = Buffer.from(indexTsx).toString('base64');
        await flyService.exec(agentUrl, `echo "${tsxB64}" | base64 -d > /home/coder/project/src/index.tsx`, '/home/coder', vmId);
        console.log('✅ Restored src/index.tsx');

        // 3. Ensure src/components/App.tsx uses relative paths (just in case)
        // We did this in patch-paths.js but let's be 100% sure in one go
        await flyService.exec(agentUrl, `sed -i "s|from 'components/Avatar'|from './Avatar'|g" /home/coder/project/src/components/App.tsx`, '/home/coder', vmId);
        await flyService.exec(agentUrl, `sed -i "s|from 'assets/logo.svg'|from '../assets/logo.svg'|g" /home/coder/project/src/components/App.tsx`, '/home/coder', vmId);
        console.log('✅ Verified relative paths in App.tsx');

    } catch (e) {
        console.error('Error:', e.message);
    }
}

restoreFull();
