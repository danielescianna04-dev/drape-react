const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';
const WORKER_VM = '17810162ad9d58';

async function check() {
    console.log('🔍 Checking cache master response headers...\n');

    const cmd = `curl -sI -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" "${AGENT_URL}/download?type=pnpm"`;

    const result = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd,
        cwd: '/home/coder',
        timeout: 10000
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 15000
    });

    console.log('Headers:\n', result.data.stdout || result.data.stderr);

    // Also test downloading first few bytes to check magic bytes
    console.log('\n🔍 Checking file format (magic bytes)...');
    const cmd2 = `curl -s -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" "${AGENT_URL}/download?type=pnpm" | head -c 4 | xxd`;

    const result2 = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd2,
        cwd: '/home/coder',
        timeout: 10000
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 15000
    });

    console.log(result2.data.stdout);
    console.log('\nExpected:');
    console.log('  gzip:  1f 8b');
    console.log('  zstd:  28 b5 2f fd');
}

check().catch(console.error);
