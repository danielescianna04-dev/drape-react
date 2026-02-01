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

async function verify() {
    // Just look for "download" in the file
    console.log('1. Search for /download in agent:');
    const r1 = await exec('grep -n "/download" /drape-agent.js | head -20');
    console.log(r1.stdout || '(no matches)');

    // Look at line 563 specifically (where we saw the download code earlier)
    console.log('\n2. Line 563 specifically:');
    const r2 = await exec('sed -n "563p" /drape-agent.js');
    console.log('Line 563:', r2.stdout);

    // Check file size
    console.log('\n3. Agent file size:');
    const r3 = await exec('wc -l /drape-agent.js');
    console.log(r3.stdout);

    // Look for the actual route handling structure
    console.log('\n4. Look for pathname checks:');
    const r4 = await exec('grep -n "pathname ===" /drape-agent.js | head -10');
    console.log(r4.stdout || '(no pathname === checks found)');

    // Alternative: look for route patterns
    console.log('\n5. Look for route patterns:');
    const r5 = await exec('grep -n "if (pathname" /drape-agent.js | head -10');
    console.log(r5.stdout || '(no pathname checks found)');
}

verify().catch(console.error);
