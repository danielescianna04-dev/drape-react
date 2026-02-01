const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const WORKER_VM = '48e3376f2e4768';

async function verify() {
    console.log('🔍 Verifying pigz installation...\n');

    // Check if pigz is installed
    const checkPigz = await axios.post(`${AGENT_URL}/exec`, {
        command: 'which pigz && pigz --version 2>&1 | head -1',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 5000
    });

    console.log('pigz check:', checkPigz.data.stdout || checkPigz.data.stderr);

    // Check CPU cores
    const cpuCheck = await axios.post(`${AGENT_URL}/exec`, {
        command: 'nproc',
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 5000
    });

    console.log('CPU cores:', cpuCheck.data.stdout.trim());

    // Test pigz decompression speed vs gzip
    console.log('\n📊 Testing pigz vs gzip speed...');

    const testCmd = `
        # Create test data
        dd if=/dev/urandom of=/tmp/test.dat bs=1M count=100 2>&1 | tail -1 &&
        # Compress with gzip
        echo "Compressing with gzip..." &&
        time gzip -c /tmp/test.dat > /tmp/test.gz 2>&1 | tail -3 &&
        # Decompress with gzip
        echo "Decompressing with gzip..." &&
        time gzip -dc /tmp/test.gz > /dev/null 2>&1 | tail -3 &&
        # Decompress with pigz
        echo "Decompressing with pigz..." &&
        time pigz -dc /tmp/test.gz > /dev/null 2>&1 | tail -3 &&
        # Cleanup
        rm -f /tmp/test.dat /tmp/test.gz
    `;

    const testResult = await axios.post(`${AGENT_URL}/exec`, {
        command: testCmd,
        cwd: '/home/coder',
        timeout: 60000
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 65000
    });

    console.log(testResult.data.stdout);
}

verify().catch(console.error);
