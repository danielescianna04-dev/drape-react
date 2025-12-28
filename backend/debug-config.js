require('dotenv').config();
const flyService = require('./services/fly-service');

async function debugConfig() {
    const vmId = 'e82970dc0d2e68';
    console.log(`🔍 DEBUGGING CONFIG on VM ${vmId}...`);
    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Check current config
    console.log('1️⃣ Current vite.config.ts:');
    const config = await flyService.exec(agentUrl, 'cat /home/coder/project/vite.config.ts', '/home/coder', vmId);
    console.log(config.stdout);

    // 2. Check if server is running
    console.log('\n2️⃣ Running processes:');
    const ps = await flyService.exec(agentUrl, 'ps aux | grep -E "node|vite|npm"', '/home/coder', vmId);
    console.log(ps.stdout);

    // 3. Server log
    console.log('\n3️⃣ Server log:');
    const log = await flyService.exec(agentUrl, 'tail -n 30 /home/coder/server.log', '/home/coder', vmId);
    console.log(log.stdout);

    // 4. Kill ALL vite/npm processes
    console.log('\n4️⃣ Killing all processes...');
    try {
        await flyService.exec(agentUrl, 'pkill -9 -f vite', '/home/coder', vmId);
        await flyService.exec(agentUrl, 'pkill -9 -f npm', '/home/coder', vmId);
    } catch (e) { }

    await new Promise(r => setTimeout(r, 2000));

    // 5. Write config fresh (using a simpler approach)
    console.log('\n5️⃣ Writing fresh config...');
    // Use heredoc style to avoid escaping issues
    const cmd = `cat << 'EOF' > /home/coder/project/vite.config.ts
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
EOF`;
    await flyService.exec(agentUrl, cmd, '/home/coder', vmId);
    console.log('✅ Written');

    // 6. Verify
    console.log('\n6️⃣ Verifying:');
    const verify = await flyService.exec(agentUrl, 'cat /home/coder/project/vite.config.ts', '/home/coder', vmId);
    console.log(verify.stdout);

    // 7. Start fresh
    console.log('\n7️⃣ Starting server...');
    await flyService.exec(agentUrl, 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &', '/home/coder/project', vmId);

    await new Promise(r => setTimeout(r, 5000));

    // 8. Check log
    console.log('\n8️⃣ New server log:');
    const newLog = await flyService.exec(agentUrl, 'tail -n 20 /home/coder/server.log', '/home/coder', vmId);
    console.log(newLog.stdout);

    // 9. Test localhost internally
    console.log('\n9️⃣ Testing localhost:');
    const test = await flyService.exec(agentUrl, 'curl -v http://localhost:3000/ 2>&1 | head -30', '/home/coder', vmId);
    console.log(test.stdout);
}

debugConfig();
