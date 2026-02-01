const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';

async function exec(cmd) {
    const result = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd,
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
        timeout: 15000
    });
    return result.data;
}

async function check() {
    console.log('1. Checking /app directory:');
    const r1 = await exec('ls -la /app/');
    console.log(r1.stdout);

    console.log('\n2. Checking agent process:');
    const r2 = await exec('ps aux | grep drape-agent');
    console.log(r2.stdout);

    console.log('\n3. Checking if pnpm-cache.tar.zst exists:');
    const r3 = await exec('ls -lh /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst 2>&1');
    console.log(r3.stdout || r3.stderr);

    console.log('\n4. Testing download endpoint directly:');
    const r4 = await exec('curl -sI http://localhost:3000/download?type=pnpm | head -10');
    console.log(r4.stdout);
}

check().catch(console.error);
