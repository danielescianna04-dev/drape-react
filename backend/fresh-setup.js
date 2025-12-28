require('dotenv').config();
const flyService = require('./services/fly-service');
const axios = require('axios');

// Repository to clone
const REPO_URL = 'https://github.com/joaopaulomoraes/reactjs-vite-tailwindcss-boilerplate.git';

async function freshSetup() {
    console.log('🚀 FRESH SETUP - Creating new VM and setting up project...\n');

    // 1. Create new VM
    console.log('1️⃣ Creating new MicroVM...');
    let machine;
    try {
        machine = await flyService.createMachine('fresh-debug-test', {
            repoUrl: REPO_URL
        });
        console.log(`✅ VM Created: ${machine.id}`);
        console.log(`   URL: https://${flyService.appName}.fly.dev`);
    } catch (e) {
        console.error('❌ Failed to create VM:', e.message);
        return;
    }

    const vmId = machine.id;
    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 2. Wait for machine to be ready
    console.log('\n2️⃣ Waiting for VM to be ready...');
    try {
        await flyService.waitForMachine(vmId, 60000);
        console.log('✅ VM is running');
    } catch (e) {
        console.error('❌ VM failed to start:', e.message);
        return;
    }

    // 3. Wait for Agent to be ready (poll)
    console.log('\n3️⃣ Waiting for Agent to respond...');
    let agentReady = false;
    for (let i = 0; i < 30; i++) {
        try {
            const res = await axios.get(`${agentUrl}/health`, {
                headers: { 'fly-force-instance-id': vmId },
                timeout: 5000
            });
            if (res.status === 200) {
                agentReady = true;
                console.log('✅ Agent is ready');
                break;
            }
        } catch (e) {
            process.stdout.write('.');
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    if (!agentReady) {
        console.error('\n❌ Agent did not respond');
        return;
    }

    // 4. Apply Vite Config Fix BEFORE starting server
    console.log('\n4️⃣ Applying Vite config fix (allowedHosts)...');
    const viteConfig = `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: {
    host: true,
    allowedHosts: ['drape-workspaces.fly.dev', '.fly.dev', 'localhost', '127.0.0.1']
  },
  plugins: [react(), tsconfigPaths()]
})
`;
    const b64 = Buffer.from(viteConfig).toString('base64');
    try {
        await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/vite.config.ts`, '/home/coder', vmId);
        console.log('✅ Vite config patched');
    } catch (e) {
        console.error('❌ Failed to patch config:', e.message);
    }

    // 5. Also fix index.tsx to use relative paths (critical fix from earlier)
    console.log('\n5️⃣ Fixing index.tsx import paths...');
    const indexTsx = `import { createRoot } from 'react-dom/client'
import 'tailwindcss/tailwind.css'
import App from './components/App'

const container = document.getElementById('root') as HTMLDivElement
const root = createRoot(container)
root.render(<App />)
`;
    const indexB64 = Buffer.from(indexTsx).toString('base64');
    try {
        await flyService.exec(agentUrl, `echo "${indexB64}" | base64 -d > /home/coder/project/src/index.tsx`, '/home/coder', vmId);
        console.log('✅ index.tsx patched');
    } catch (e) {
        console.error('❌ Failed to patch index.tsx:', e.message);
    }

    // 6. Start Dev Server
    console.log('\n6️⃣ Starting dev server...');
    try {
        await flyService.exec(agentUrl, 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &', '/home/coder/project', vmId);
        console.log('✅ Dev server started');
    } catch (e) {
        console.error('❌ Failed to start server:', e.message);
    }

    // 7. Wait for server to be ready
    console.log('\n7️⃣ Waiting for server to be ready...');
    await new Promise(r => setTimeout(r, 5000));

    // 8. Verify via curl (local to VM)
    console.log('\n8️⃣ Verifying server response (internal)...');
    try {
        const curlRes = await flyService.exec(agentUrl, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/', '/home/coder', vmId);
        console.log(`   Internal curl status: ${curlRes.stdout.trim()}`);
    } catch (e) {
        console.error('   Curl failed:', e.message);
    }

    // 9. Output final info
    console.log('\n' + '═'.repeat(60));
    console.log('🎉 SETUP COMPLETE!');
    console.log('═'.repeat(60));
    console.log(`VM ID: ${vmId}`);
    console.log(`URL:   https://${flyService.appName}.fly.dev`);
    console.log('═'.repeat(60));

    // Save VM ID for later use
    console.log(`\n📝 New VM ID: ${vmId}`);
}

freshSetup();
