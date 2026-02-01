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

async function checkRouting() {
    // Look at the routing structure around line 224 (isApiRoute)
    console.log('1. Routing logic (lines 220-235):');
    const r1 = await exec('sed -n "220,235p" /drape-agent.js');
    console.log(r1.stdout);

    // Look at what happens after isApiRoute check
    console.log('\n2. Code after isApiRoute check (lines 235-250):');
    const r2 = await exec('sed -n "235,250p" /drape-agent.js');
    console.log(r2.stdout);

    // Check if there's any condition that might skip the /download handler
    console.log('\n3. Lines before /download handler (lines 555-565):');
    const r3 = await exec('sed -n "555,565p" /drape-agent.js');
    console.log(r3.stdout);

    // Let's also check for any early returns or guards
    console.log('\n4. Check for early returns before line 562:');
    const r4 = await exec('sed -n "220,560p" /drape-agent.js | grep -n "return" | tail -10');
    console.log(r4.stdout);
}

checkRouting().catch(console.error);
