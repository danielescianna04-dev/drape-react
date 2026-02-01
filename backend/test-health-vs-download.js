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

async function compare() {
    console.log('Comparing /health vs /download endpoints...\n');

    // Test /health
    console.log('1. Test /health (should work):');
    const r1 = await exec('curl -s http://localhost:13338/health 2>&1');
    console.log(r1.stdout);

    // Test /download
    console.log('\n2. Test /download (returns 404):');
    const r2 = await exec('curl -s http://localhost:13338/download?type=pnpm 2>&1 | head -10');
    console.log(r2.stdout);

    // Check if maybe there's a different cacheType parameter issue
    console.log('\n3. Try /download without query params:');
    const r3 = await exec('curl -s http://localhost:13338/download 2>&1 | head -10');
    console.log(r3.stdout);

    // Test exec endpoint (to see if other endpoints work)
    console.log('\n4. Test /exec endpoint (POST):');
    const r4 = await exec('curl -s -X POST http://localhost:13338/exec -H "Content-Type: application/json" -d \'{"command":"echo test"}\' 2>&1');
    console.log(r4.stdout);

    // Check agent console log for request logging
    console.log('\n5. Check recent agent logs (if available via dmesg or journalctl):');
    const r5 = await exec('journalctl -u drape-agent -n 20 --no-pager 2>/dev/null || dmesg | grep -i drape | tail -10 || echo "No logs available"');
    console.log(r5.stdout);
}

compare().catch(console.error);
