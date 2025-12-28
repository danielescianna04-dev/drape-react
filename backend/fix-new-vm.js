require('dotenv').config();
const flyService = require('./services/fly-service');

async function fixNewVm() {
    const vmId = 'e82970dc0d2e68'; // NEW VM ID
    console.log(`🔧 FIXING NEW VM ${vmId}...`);
    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Kill existing dev server
    console.log('1️⃣ Killing existing processes...');
    try {
        await flyService.exec(agentUrl, 'pkill -f vite', '/home/coder', vmId);
        await flyService.exec(agentUrl, 'pkill -f npm', '/home/coder', vmId);
    } catch (e) { }

    await new Promise(r => setTimeout(r, 2000));

    // 2. Check current vite.config.ts
    console.log('\n2️⃣ Current vite.config.ts:');
    const current = await flyService.exec(agentUrl, 'cat /home/coder/project/vite.config.ts', '/home/coder', vmId);
    console.log(current.stdout);

    // 3. OVERWRITE vite.config.ts with fixed version
    console.log('\n3️⃣ Overwriting vite.config.ts...');
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
    console.log('✅ Config written');

    // 4. Verify it was written
    console.log('\n4️⃣ Verifying new config:');
    const verify = await flyService.exec(agentUrl, 'cat /home/coder/project/vite.config.ts', '/home/coder', vmId);
    console.log(verify.stdout);

    // 5. Restart dev server
    console.log('\n5️⃣ Starting dev server...');
    await flyService.exec(agentUrl, 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &', '/home/coder/project', vmId);
    console.log('✅ Dev server started');

    // 6. Wait and check server log
    await new Promise(r => setTimeout(r, 5000));
    console.log('\n6️⃣ Server log:');
    const log = await flyService.exec(agentUrl, 'tail -n 20 /home/coder/server.log', '/home/coder', vmId);
    console.log(log.stdout);
}

fixNewVm();
