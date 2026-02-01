const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';
const WORKER_VM = '1859d7df129918';

async function testDownloadSpeed() {
    console.log('📊 Testing pure download speed (no extraction)...\n');

    // Test 1: Download to /dev/null (no disk writes)
    console.log('1. Download to /dev/null (pure network speed):');
    const cmd1 = `time curl -s -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" "${AGENT_URL}/download?type=pnpm" > /dev/null`;

    const result1 = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd1,
        cwd: '/home/coder',
        timeout: 60000
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 65000
    });

    console.log(result1.data.stderr || result1.data.stdout);

    // Test 2: Download + save to disk (with disk writes)
    console.log('\n2. Download + save to disk:');
    const cmd2 = `time curl -s -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" "${AGENT_URL}/download?type=pnpm" -o /tmp/test-cache.tar.gz`;

    const result2 = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd2,
        cwd: '/home/coder',
        timeout: 60000
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 65000
    });

    console.log(result2.data.stderr || result2.data.stdout);

    // Get file size
    const sizeCheck = await axios.post(`${AGENT_URL}/exec`, {
        command: 'ls -lh /tmp/test-cache.tar.gz',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 5000
    });

    console.log(`\n3. Downloaded file: ${sizeCheck.data.stdout.trim()}`);

    // Test 3: Extraction time
    console.log('\n4. Testing extraction time:');
    const cmd3 = `time tar -xzf /tmp/test-cache.tar.gz -C /tmp/test-extract`;

    await axios.post(`${AGENT_URL}/exec`, {
        command: 'mkdir -p /tmp/test-extract',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM }
    });

    const result3 = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd3,
        cwd: '/home/coder',
        timeout: 120000
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 125000
    });

    console.log(result3.data.stderr || result3.data.stdout);

    // Cleanup
    await axios.post(`${AGENT_URL}/exec`, {
        command: 'rm -rf /tmp/test-cache.tar.gz /tmp/test-extract',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM }
    });

    console.log('\n✅ Analysis complete!');
}

testDownloadSpeed().catch(console.error);
