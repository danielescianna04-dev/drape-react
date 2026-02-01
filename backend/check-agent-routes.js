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

async function check() {
    // Check if the server is actually using the new agent code
    console.log('1. Check server file path in process:');
    const r1 = await exec('ps aux | grep "node /drape-agent.js"');
    console.log(r1.stdout);

    // Check when the agent was last modified
    console.log('\n2. Check agent file timestamp:');
    const r2 = await exec('ls -la /drape-agent.js');
    console.log(r2.stdout);

    // Check server startup logs (might be in PM2 or systemd)
    console.log('\n3. Try to find agent logs:');
    const r3 = await exec('ls -la /var/log/ | grep -E "(agent|drape|pm2)" || echo "No logs found"');
    console.log(r3.stdout);

    // Look for the actual server implementation around line 560
    console.log('\n4. Check if pathname matching works:');
    const r4 = await exec('grep -n "pathname === \\x27/download\\x27" /drape-agent.js');
    console.log('Download route match:', r4.stdout);

    // Check how the server handles 404s
    console.log('\n5. Check 404 handler:');
    const r5 = await exec('grep -n "404" /drape-agent.js | tail -5');
    console.log('404 handlers:', r5.stdout);
}

check().catch(console.error);
