const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';

async function checkVersion() {
    const result = await axios.post(`${AGENT_URL}/exec`, {
        command: 'grep "Drape Agent v" /app/drape-agent.js | head -1',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
        timeout: 10000
    });

    console.log('Agent version:', result.data.stdout.trim());

    // Also check what compression type it's configured for
    const result2 = await axios.post(`${AGENT_URL}/exec`, {
        command: 'grep "pnpm-cache.tar" /app/drape-agent.js | grep "const preCachedTar"',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
        timeout: 10000
    });

    console.log('Cache file config:', result2.data.stdout.trim());
}

checkVersion().catch(console.error);
