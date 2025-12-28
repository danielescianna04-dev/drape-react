require('dotenv').config();
const flyService = require('./services/fly-service');

async function patchPaths() {
    const vmId = '784975ec43e718';
    console.log(`🔧 Patching paths for VM ${vmId} ...`);

    try {
        const agentUrl = `https://${flyService.appName}.fly.dev`;

        // Patch src/index.tsx
        const indexPatch = `
import { createRoot } from 'react-dom/client'
import 'tailwindcss/tailwind.css'
import App from './components/App'

const container = document.getElementById('root') as HTMLDivElement
const root = createRoot(container)

root.render(<App />)
`;
        // Encode as base64 to avoid quote issues
        const indexB64 = Buffer.from(indexPatch).toString('base64');
        await flyService.exec(agentUrl, `echo "${indexB64}" | base64 -d > /home/coder/project/src/index.tsx`, '/home/coder', vmId);
        console.log('✅ Patched src/index.tsx');

        // Patch src/components/App.tsx
        // Need to read it first? No, I have the content from previous turn.
        // Just replace the top imports. The rest is big.
        // Actually, sed might be safer to just replace lines.

        // Sed replace "components/Avatar" -> "./Avatar"
        await flyService.exec(agentUrl, `sed -i "s|from 'components/Avatar'|from './Avatar'|g" /home/coder/project/src/components/App.tsx`, '/home/coder', vmId);

        // Sed replace "assets/logo.svg" -> "../assets/logo.svg" (App is in components/, logo in src/assets/)
        // Wait, structure:
        // src/components/App.tsx
        // src/assets/logo.svg
        // import ... from 'assets/logo.svg' -> '../assets/logo.svg'
        await flyService.exec(agentUrl, `sed -i "s|from 'assets/logo.svg'|from '../assets/logo.svg'|g" /home/coder/project/src/components/App.tsx`, '/home/coder', vmId);

        console.log('✅ Patched src/components/App.tsx');

        // Also check Avatar.tsx?
        // Let's assume it doesn't have imports for now or they are simple.

    } catch (e) {
        console.error('Error:', e.message);
    }
}

patchPaths();
