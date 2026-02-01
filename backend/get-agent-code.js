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

async function getAgentCode() {
    // Get the version line
    console.log('Getting agent version info...');
    const versionResult = await exec('head -20 /drape-agent.js | grep -E "(Agent v|version)"');
    console.log('Version info:', versionResult.stdout);

    // Get the preCachedTar line
    console.log('\nGetting cache file config...');
    const cacheResult = await exec('grep -n "preCachedTar" /drape-agent.js');
    console.log('Cache config:', cacheResult.stdout);

    // Get the download endpoint code
    console.log('\nGetting download endpoint code...');
    const downloadResult = await exec('grep -A 5 "app.get.*download" /drape-agent.js | head -20');
    console.log('Download endpoint:', downloadResult.stdout);
}

getAgentCode().catch(console.error);
