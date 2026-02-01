const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const WORKER_VM = '17810162ad9d58';

async function check() {
    console.log('🔍 Checking zstd and tar support...\n');

    // Check zstd
    console.log('1. zstd version:');
    const r1 = await axios.post(`${AGENT_URL}/exec`, {
        command: 'zstd --version',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 5000
    });
    console.log(r1.data.stdout || r1.data.stderr);

    // Check tar version and zstd support
    console.log('\n2. tar version:');
    const r2 = await axios.post(`${AGENT_URL}/exec`, {
        command: 'tar --version | head -1',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 5000
    });
    console.log(r2.data.stdout);

    // Test if tar supports --zstd
    console.log('\n3. Testing tar --zstd support:');
    const r3 = await axios.post(`${AGENT_URL}/exec`, {
        command: 'tar --help | grep zstd',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 5000
    });
    console.log(r3.data.stdout || '(no zstd support in tar)');

    // Try alternative: tar -I zstd
    console.log('\n4. Testing tar -I zstd support:');
    const r4 = await axios.post(`${AGENT_URL}/exec`, {
        command: 'echo test | tar -I zstd -cf - - 2>&1 | head -2',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 5000
    });
    console.log(r4.data.stdout || r4.data.stderr);
}

check().catch(console.error);
