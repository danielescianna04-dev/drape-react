require('dotenv').config();
const flyService = require('./services/fly-service');

async function superFix() {
    const vmId = '784975ec43e718';
    console.log(`🦸 SUPER FIX on VM ${vmId} ...`);
    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Write Config (Minimal & Permissive)
    // trying both string and array just in case
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
    console.log('✅ Config Written');

    // 2. Kill Everything (Nuclear)
    console.log('💀 Killing...');
    try {
        await flyService.exec(agentUrl, 'pkill -9 -f vite', '/home/coder', vmId);
        await flyService.exec(agentUrl, 'pkill -9 -f npm', '/home/coder', vmId);
        await flyService.exec(agentUrl, 'pkill -9 -f esbuild', '/home/coder', vmId);
    } catch (e) { }

    await new Promise(r => setTimeout(r, 3000));

    // 3. Start
    console.log('🚀 Starting...');
    await flyService.exec(agentUrl, 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &', '/home/coder/project', vmId);
    console.log('✅ Started');
}

superFix();
