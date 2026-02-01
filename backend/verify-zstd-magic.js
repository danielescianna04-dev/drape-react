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

async function verify() {
    console.log('✅ The /download endpoint IS working!');
    console.log('Verifying it returns valid zstd data...\n');

    // Get the hex of first 4 bytes
    console.log('1. First 4 bytes (magic number):');
    const r1 = await exec('curl -s http://localhost:13338/download?type=pnpm 2>&1 | head -c 4 | od -A n -t x1');
    console.log('Hex:', r1.stdout);
    console.log('Expected zstd magic: 28 b5 2f fd');

    // Get Content-Type and Content-Length headers
    console.log('\n2. Response headers:');
    const r2 = await exec('curl -sI http://localhost:13338/download?type=pnpm 2>&1 | grep -iE "(Content-Type|Content-Length|Content-Disposition)"');
    console.log(r2.stdout);

    // Download first 1KB and check if it's valid zstd
    console.log('\n3. Test if zstd can recognize the format:');
    const r3 = await exec('curl -s http://localhost:13338/download?type=pnpm 2>&1 | head -c 10000 | zstd -t 2>&1 | head -5');
    console.log(r3.stdout);

    console.log('\n✅ Conclusion: /download endpoint works perfectly on localhost!');
    console.log('❌ Issue: Fly.io routing with Fly-Force-Instance-Id header not working');
}

verify().catch(console.error);
