require('dotenv').config();
const flyService = require('./services/fly-service');

const REPO_URL = 'https://github.com/joaopaulomoraes/reactjs-vite-tailwindcss-boilerplate.git';

async function cloneAndFix() {
    const vmId = 'e82970dc0d2e68';
    console.log(`📦 CLONING REPO to VM ${vmId}...`);
    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Check if project dir exists and is empty
    console.log('1️⃣ Checking /home/coder/project...');
    const ls = await flyService.exec(agentUrl, 'ls -la /home/coder/project', '/home/coder', vmId);
    console.log(ls.stdout);

    // 2. Clone repo if needed
    console.log('\n2️⃣ Cloning repository...');
    try {
        await flyService.exec(agentUrl, `rm -rf /home/coder/project/*`, '/home/coder', vmId);
        await flyService.exec(agentUrl, `git clone --depth 1 ${REPO_URL} /home/coder/project-temp`, '/home/coder', vmId);
        await flyService.exec(agentUrl, 'mv /home/coder/project-temp/* /home/coder/project/', '/home/coder', vmId);
        await flyService.exec(agentUrl, 'mv /home/coder/project-temp/.* /home/coder/project/ 2>/dev/null || true', '/home/coder', vmId);
        await flyService.exec(agentUrl, 'rm -rf /home/coder/project-temp', '/home/coder', vmId);
        console.log('✅ Cloned');
    } catch (e) {
        console.error('Clone error:', e.message);
    }

    // 3. Verify clone
    console.log('\n3️⃣ Verifying clone...');
    const verify = await flyService.exec(agentUrl, 'ls -la /home/coder/project', '/home/coder', vmId);
    console.log(verify.stdout);

    // 4. Install dependencies
    console.log('\n4️⃣ Installing dependencies (this may take a while)...');
    const install = await flyService.exec(agentUrl, 'cd /home/coder/project && npm install', '/home/coder', vmId, 120000);
    console.log('Install output (last 50 lines):');
    console.log(install.stdout.split('\n').slice(-50).join('\n'));

    // 5. Apply Vite config fix
    console.log('\n5️⃣ Applying Vite config fix...');
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
    await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/vite.config.ts`, '/home/coder', vmId);
    console.log('✅ Config fixed');

    // 6. Start server
    console.log('\n6️⃣ Starting dev server...');
    await flyService.exec(agentUrl, 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &', '/home/coder/project', vmId);
    console.log('✅ Server starting...');

    // 7. Wait and check
    await new Promise(r => setTimeout(r, 5000));
    console.log('\n7️⃣ Server log:');
    const log = await flyService.exec(agentUrl, 'tail -n 20 /home/coder/server.log', '/home/coder', vmId);
    console.log(log.stdout);
}

cloneAndFix();
