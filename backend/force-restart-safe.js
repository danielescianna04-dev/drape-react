require('dotenv').config();
const flyService = require('./services/fly-service');

async function forceRestartSafe() {
    const vmId = '784975ec43e718';
    console.log(`🔪 SAFE KILL & RESTART on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Get List of Processes
    try {
        const ps = await flyService.exec(agentUrl, 'ps aux', '/home/coder', vmId);
        const lines = ps.stdout.split('\n');

        const pidsToKill = [];
        for (const line of lines) {
            if (line.includes('node') || line.includes('vite') || line.includes('npm')) {
                // Avoid Agent (drape-agent.js)
                if (line.includes('drape-agent.js')) continue;

                // Extract PID (2nd column usually)
                const parts = line.trim().split(/\s+/);
                const pid = parts[1];
                if (pid && parseInt(pid) > 10) { // Safety check
                    pidsToKill.push(pid);
                }
            }
        }

        console.log('Targets acquired:', pidsToKill);

        for (const pid of pidsToKill) {
            console.log(`Killing ${pid}...`);
            await flyService.exec(agentUrl, `kill -9 ${pid}`, '/home/coder', vmId);
        }

    } catch (e) {
        console.error('Error in scouting:', e.message);
    }

    // 2. Start Server Fresh
    console.log('Starting server...');
    // Truncate log first
    await flyService.exec(agentUrl, 'echo "" > /home/coder/server.log', '/home/coder', vmId);

    const cmd = 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &';
    await flyService.exec(agentUrl, cmd, '/home/coder/project', vmId);
    console.log('✅ Server started.');

    // 3. Verify
    await new Promise(r => setTimeout(r, 3000));
    const log = await flyService.exec(agentUrl, 'tail -n 20 /home/coder/server.log', '/home/coder', vmId);
    console.log('\n--- New Server Log ---');
    console.log(log.stdout);
}

forceRestartSafe();
