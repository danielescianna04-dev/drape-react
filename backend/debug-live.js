require('dotenv').config();
const flyService = require('./services/fly-service');

async function debugLive() {
    const vmId = '784975ec43e718'; // Target specifically the VM from user logs
    console.log(`🔍 Debugging VM ${vmId} ...`);

    try {
        const agentUrl = `https://${flyService.appName}.fly.dev`;

        // 1. Check Processes
        console.log('\n--- Processes ---');
        const ps = await flyService.exec(agentUrl, 'ps aux', '/home/coder', vmId);
        console.log(ps.stdout);

        // 2. Check File Structure
        console.log('\n--- Project Files ---');
        const ls = await flyService.exec(agentUrl, 'ls -F /home/coder/project', '/home/coder', vmId);
        console.log(ls.stdout);

        // Check Server Log (tail)
        console.log('\n--- Server Log ---');
        const log = await flyService.exec(agentUrl, 'tail -n 50 /home/coder/server.log', '/home/coder', vmId);
        console.log(log.stdout);

    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) console.error('Data:', e.response.data);
    }
}

debugLive();
