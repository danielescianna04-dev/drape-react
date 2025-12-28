require('dotenv').config();
const flyService = require('./services/fly-service');

async function startServer() {
    const vmId = '784975ec43e718';
    console.log(`🚀 STARTING SERVER on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // Start server in background
    // We use nohup to ensure it stays alive
    try {
        // Note: exec waits for completion unless we detach. 
        // We can simulate detach by using a shell command that returns immediately.
        // But flyService.exec waits for stdout.
        // We will run it with a timeout of 1s, which might error but leave the process running if we use nohup properly.

        const cmd = 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &';

        console.log('Running: ' + cmd);
        await flyService.exec(agentUrl, cmd, '/home/coder/project', vmId);
        console.log('✅ Server start command issued');

    } catch (e) {
        console.log('Command returned (expected for background process):', e.message);
    }

    // Wait and check
    await new Promise(r => setTimeout(r, 2000));
    const log = await flyService.exec(agentUrl, 'tail -n 20 /home/coder/server.log', '/home/coder', vmId);
    console.log('\n--- New Server Log ---');
    console.log(log.stdout);
}

startServer();
