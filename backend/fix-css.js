require('dotenv').config();
const flyService = require('./services/fly-service');

async function fixCss() {
    const vmId = '784975ec43e718';
    console.log(`🎨 Fixing CSS on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Create src/index.css
    const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;`;

    const cssB64 = Buffer.from(indexCss).toString('base64');
    await flyService.exec(agentUrl, `echo "${cssB64}" | base64 -d > /home/coder/project/src/index.css`, '/home/coder', vmId);
    console.log('✅ Created src/index.css');

    // 2. Update src/index.tsx to import ./index.css instead of tailwindcss/tailwind.css
    const indexTsx = `import { createRoot } from 'react-dom/client'
import './index.css'
import App from './components/App'

const container = document.getElementById('root') as HTMLDivElement
if (container) {
    const root = createRoot(container)
    root.render(<App />)
} else {
    console.error('Failed to find root element');
}
`;

    const tsxB64 = Buffer.from(indexTsx).toString('base64');
    await flyService.exec(agentUrl, `echo "${tsxB64}" | base64 -d > /home/coder/project/src/index.tsx`, '/home/coder', vmId);
    console.log('✅ Updated src/index.tsx imports');

}

fixCss();
