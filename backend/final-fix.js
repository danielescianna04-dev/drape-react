require('dotenv').config();
const flyService = require('./services/fly-service');

async function finalFix() {
    const vmId = '784975ec43e718';
    console.log(`🚑 FINAL FIX on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Write Config
    const viteConfig = `
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: {
    host: true,
    allowedHosts: ['drape-workspaces.fly.dev', 'localhost', '127.0.0.1']
  },
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: '.vitest/setup',
    include: ['**/test.{ts,tsx}']
  }
})
`;
    const b64 = Buffer.from(viteConfig).toString('base64');
    await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/vite.config.ts`, '/home/coder', vmId);
    console.log('✅ Config Written');

    // 2. Kill Processes
    try {
        // Kill main vite/npm processes
        const ps = await flyService.exec(agentUrl, 'ps aux', '/home/coder', vmId);
        const lines = ps.stdout.split('\n');
        for (const line of lines) {
            if ((line.includes('vite') || line.includes('npm')) && !line.includes('drape-agent')) {
                const pid = line.trim().split(/\s+/)[1];
                if (pid) await flyService.exec(agentUrl, `kill -9 ${pid}`, '/home/coder', vmId);
            }
        }
    } catch (e) { }
    console.log('✅ Processes Killed');

    await new Promise(r => setTimeout(r, 2000));

    // 3. Start Server
    await flyService.exec(agentUrl, 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &', '/home/coder/project', vmId);
    console.log('✅ Server Started');

    await new Promise(r => setTimeout(r, 5000));

    // 4. Verify Local
    const check = await flyService.exec(agentUrl, 'curl -I http://localhost:3000/', '/home/coder', vmId);
    console.log('Local Check:', check.stdout);
}

finalFix();
