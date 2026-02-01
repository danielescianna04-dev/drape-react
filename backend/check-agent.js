const axios = require('axios');

const WORKER_VM = '68301eec416238';
const AGENT_URL = 'https://drape-workspaces.fly.dev';

async function exec(command) {
    const res = await axios.post(`${AGENT_URL}/exec`, {
        command,
        cwd: '/home/coder',
        timeout: 5000
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 10000
    });
    return res.data;
}

async function main() {
    // Check if agent is running
    console.log('1. Checking agent process...');
    const ps = await exec('pgrep -fl drape-agent');
    console.log('   Process:', ps.stdout.trim() || 'NOT RUNNING');

    // Check agent health
    console.log('\n2. Testing agent /health endpoint...');
    try {
        const health = await axios.get(`${AGENT_URL}/health`, {
            headers: { 'Fly-Force-Instance-Id': WORKER_VM },
            timeout: 3000
        });
        console.log('   ✅ Agent responding:', health.data);
    } catch (e) {
        console.log('   ❌ Agent not responding:', e.message);
    }

    // If not running, start it
    if (!ps.stdout.trim()) {
        console.log('\n3. Starting agent...');
        await exec('cd /home/coder && nohup node drape-agent.js > drape-agent.log 2>&1 &');
        console.log('   Started! Waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));

        // Check again
        const ps2 = await exec('pgrep -fl drape-agent');
        console.log('   New process:', ps2.stdout.trim() || 'STILL NOT RUNNING');
    }
}

main().catch(console.error);
