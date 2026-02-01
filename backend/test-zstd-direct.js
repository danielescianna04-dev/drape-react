const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';
const WORKER_VM = '17810162ad9d58';

async function testZstd() {
    console.log('🧪 Testing zstd compression performance\n');

    // Test 1: Check download size and type
    console.log('1. Testing download from cache master...');
    const cmd1 = `curl -sI -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" "${AGENT_URL}/download?type=pnpm" | grep -E "(Content-Type|Content-Length)"`;

    const result1 = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd1,
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 10000
    });

    console.log(result1.data.stdout);

    // Test 2: Time the download + extraction
    console.log('\n2. Testing full download + extraction with timing...');
    const cmd2 = `
        mkdir -p /tmp/test-zstd &&
        time curl -s -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" "${AGENT_URL}/download?type=pnpm" | tar --zstd -xf - -C /tmp/test-zstd &&
        echo "SUCCESS" &&
        du -sm /tmp/test-zstd | cut -f1
    `;

    try {
        const result2 = await axios.post(`${AGENT_URL}/exec`, {
            command: cmd2,
            cwd: '/home/coder',
            timeout: 180000 // 3 minutes
        }, {
            headers: { 'Fly-Force-Instance-Id': WORKER_VM },
            timeout: 200000
        });

        console.log('stdout:', result2.data.stdout);
        console.log('stderr:', result2.data.stderr);
        console.log('exitCode:', result2.data.exitCode);

        // Cleanup
        await axios.post(`${AGENT_URL}/exec`, {
            command: 'rm -rf /tmp/test-zstd',
            cwd: '/home/coder'
        }, {
            headers: { 'Fly-Force-Instance-Id': WORKER_VM }
        });

    } catch (error) {
        console.log('❌ Error:', error.message);
    }
}

testZstd().catch(console.error);
