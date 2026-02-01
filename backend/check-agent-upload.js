const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const VM_ID = '68395d3cd59598';

async function exec(cmd) {
    const res = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd,
        cwd: '/'
    }, {
        headers: { 'Fly-Force-Instance-Id': VM_ID },
        timeout: 10000
    });
    return res.data.stdout + res.data.stderr;
}

async function main() {
    console.log('🔍 Checking /drape-agent.js for /upload endpoint\n');

    // Check version
    console.log('1. Agent version:');
    const version = await exec('head -30 /drape-agent.js | grep "Drape Agent"');
    console.log(`   ${version.trim()}\n`);

    // Check if /upload endpoint exists
    console.log('2. Searching for /upload endpoint:');
    const uploadCheck = await exec('grep -n "/upload" /drape-agent.js | head -5');
    console.log(uploadCheck.trim() || '   ❌ /upload endpoint NOT FOUND');
    console.log('');

    // List all endpoints
    console.log('3. All endpoints in agent:');
    const endpoints = await exec('grep -n "pathname ===" /drape-agent.js');
    console.log(endpoints);
}

main().catch(console.error);
