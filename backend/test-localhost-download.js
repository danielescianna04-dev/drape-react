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

async function testLocalhost() {
    console.log('Testing /download endpoint on localhost within cache master VM...\n');

    // Test 1: curl localhost:3000/download
    console.log('1. Testing localhost HEAD request:');
    const r1 = await exec('curl -sI http://localhost:3000/download?type=pnpm 2>&1', 15000);
    console.log(r1.stdout);

    // Test 2: Try to get first few bytes
    console.log('\n2. Testing localhost GET (first 4 bytes for magic number):');
    const r2 = await exec('curl -s http://localhost:3000/download?type=pnpm 2>&1 | head -c 4 | xxd', 15000);
    console.log(r2.stdout);
    console.log('Expected zstd magic: 00000000: 28b5 2ffd');

    // Test 3: Check if agent is actually listening on port 3000
    console.log('\n3. Check if agent is listening on port 3000:');
    const r3 = await exec('netstat -tlnp | grep ":3000" || ss -tlnp | grep ":3000"', 10000);
    console.log(r3.stdout || 'No listener on port 3000');

    // Test 4: Test health endpoint for comparison
    console.log('\n4. Test /health endpoint (should work):');
    const r4 = await exec('curl -s http://localhost:3000/health', 10000);
    console.log(r4.stdout);
}

testLocalhost().catch(console.error);
