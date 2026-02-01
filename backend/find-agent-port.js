const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';

async function exec(cmd, timeout = 30000) {
    const result = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd,
        cwd: '/home/coder',
        timeout
    }, {
        headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
        timeout: timeout + 5000
    });
    return result.data;
}

async function findPort() {
    console.log('Finding what port the agent is actually running on...\n');

    // Check all listening ports
    console.log('1. All listening TCP ports:');
    const r1 = await exec('netstat -tlnp 2>/dev/null || ss -tlnp 2>/dev/null');
    console.log(r1.stdout || r1.stderr);

    // Check the agent process
    console.log('\n2. Agent process details:');
    const r2 = await exec('ps aux | grep drape-agent | grep -v grep');
    console.log(r2.stdout);

    // Check if there's a PORT environment variable
    console.log('\n3. Check PORT env var from process:');
    const r3 = await exec('cat /proc/659/environ | tr "\\0" "\\n" | grep -E "(PORT|port)"');
    console.log(r3.stdout || '(no PORT env var found)');

    // Look for port 3000 in the agent code
    console.log('\n4. Check what port agent listens on (in code):');
    const r4 = await exec('grep -n "listen" /drape-agent.js | grep -v "//" | head -5');
    console.log(r4.stdout);

    // Look for PORT constant
    console.log('\n5. Check PORT constant in agent:');
    const r5 = await exec('grep -n "const PORT" /drape-agent.js || grep -n "PORT =" /drape-agent.js | head -3');
    console.log(r5.stdout);
}

findPort().catch(console.error);
