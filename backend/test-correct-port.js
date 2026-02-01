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

async function testCorrectPort() {
    console.log('Testing /download endpoint on correct port (13338)...\n');

    // Test 1: HEAD request
    console.log('1. Testing localhost:13338 HEAD request:');
    const r1 = await exec('curl -sI http://localhost:13338/download?type=pnpm 2>&1 | head -15', 15000);
    console.log(r1.stdout);

    // Test 2: Check magic bytes
    console.log('\n2. Testing first 4 bytes (magic number):');
    const r2 = await exec('curl -s http://localhost:13338/download?type=pnpm 2>&1 | head -c 4 | xxd', 20000);
    console.log(r2.stdout);
    console.log('Expected zstd magic: 00000000: 28b5 2ffd');

    // Test 3: Get file size from Content-Length header
    console.log('\n3. Check Content-Length:');
    const r3 = await exec('curl -sI http://localhost:13338/download?type=pnpm 2>&1 | grep -i "content-length"', 15000);
    console.log(r3.stdout);
}

testCorrectPort().catch(console.error);
