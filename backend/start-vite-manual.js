require('dotenv').config();
const flyService = require('./services/fly-service');

const vmId = '2860325f704d08';
const agentUrl = 'https://drape-workspaces.fly.dev';

(async () => {
    console.log('🚀 Starting Vite dev server...');

    // First patch vite.config.ts
    console.log('1. Patching vite.config.ts...');
    try {
        // Check current config
        const config = await flyService.exec(agentUrl, 'cat vite.config.ts', '/home/coder/project', vmId);
        console.log('Current config:', config.stdout);

        if (config.stdout.includes('allowedHosts')) {
            console.log('Already patched!');
        } else {
            // Patch it
            const patchCmd = `sed -i "s/defineConfig({/defineConfig({ server: { allowedHosts: ['drape-workspaces.fly.dev', '.fly.dev', 'localhost'] }, /g" vite.config.ts`;
            await flyService.exec(agentUrl, patchCmd, '/home/coder/project', vmId);

            const newConfig = await flyService.exec(agentUrl, 'cat vite.config.ts', '/home/coder/project', vmId);
            console.log('After patch:', newConfig.stdout);
        }
    } catch (e) {
        console.error('Patch error:', e.message);
    }

    // Start server
    console.log('\n2. Starting server...');
    await flyService.exec(agentUrl, 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &', '/home/coder/project', vmId);

    console.log('\n3. Waiting 10 seconds...');
    await new Promise(r => setTimeout(r, 10000));

    // Check
    console.log('\n4. Checking processes...');
    const ps = await flyService.exec(agentUrl, 'ps aux | grep -E "npm|vite|node"', '/home/coder', vmId);
    console.log(ps.stdout);

    console.log('\n5. Checking server log...');
    const log = await flyService.exec(agentUrl, 'tail -20 /home/coder/server.log', '/home/coder', vmId);
    console.log(log.stdout);

    console.log('\n6. Testing curl...');
    const curlResult = await flyService.exec(agentUrl, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/', '/home/coder', vmId);
    console.log('HTTP Status:', curlResult.stdout);

})().catch(e => console.error('Error:', e.message));
