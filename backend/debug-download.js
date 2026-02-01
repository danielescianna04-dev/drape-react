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

async function debug() {
    // Show lines around the preCachedTar definition
    console.log('1. Code around preCachedTar (lines 560-600):');
    const r1 = await exec('sed -n "560,600p" /drape-agent.js');
    console.log(r1.stdout);

    console.log('\n2. Test direct file access:');
    const r2 = await exec('test -f /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst && echo "File exists and is readable" || echo "File NOT accessible"');
    console.log(r2.stdout);

    console.log('\n3. File permissions:');
    const r3 = await exec('ls -la /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst');
    console.log(r3.stdout);

    console.log('\n4. Try reading first 4 bytes (magic number):');
    const r4 = await exec('head -c 4 /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst | xxd');
    console.log(r4.stdout);
}

debug().catch(console.error);
