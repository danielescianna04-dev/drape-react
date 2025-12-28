require('dotenv').config();
const flyService = require('./services/fly-service');

async function fixViteConfig() {
    const vmId = '784975ec43e718';
    console.log(`🔧 FIXING VITE CONFIG on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    const viteConfig = `
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config https://vitest.dev/config
export default defineConfig({
  server: {
    host: true,
    allowedHosts: ['drape-workspaces.fly.dev', 'localhost']
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

    try {
        await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/vite.config.ts`, '/home/coder', vmId);
        // FORCE RESTART THE SERVER by killing the process (npm run dev)
        // Actually, HMR might pick up config changes, but better to restart.
        // Wait, I can't easily restart via exec unless I kill the node process.
        // The agent runs `startCommand` which is `npm run dev`. If I kill it, does the agent restart it?
        // No, the agent (drape-agent.js) is running separately. The `npm run dev` is typically managed by `concurrently` or similar in the user's start logic, OR it's just a background process.
        // Let's just update the file. Vite usually auto-restarts on config change.

        console.log('✅ Updated vite.config.ts with explicit allowedHosts');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

fixViteConfig();
