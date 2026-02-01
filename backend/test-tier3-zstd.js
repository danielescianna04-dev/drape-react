const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';
const WORKER_VM = '17810162ad9d58'; // Pick any worker VM

async function exec(machineId, cmd, timeout = 30000) {
    const result = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd,
        cwd: '/home/coder',
        timeout
    }, {
        headers: { 'Fly-Force-Instance-Id': machineId },
        timeout: timeout + 5000
    });
    return result.data;
}

async function testTier3() {
    console.log('🚀 Testing TIER 3 with zstd compression\\n');
    console.log('═'.repeat(70));

    // Clear worker cache first
    console.log('\\n1️⃣  Clearing worker pnpm-store...');
    const clearResult = await exec(WORKER_VM, 'rm -rf /home/coder/volumes/pnpm-store/* && echo "Cleared"');
    console.log(`   ${clearResult.stdout}`);

    // Test download + extraction with zstd
    console.log('\\n2️⃣  Testing direct VM-to-VM transfer with zstd...');
    const startTime = Date.now();

    const downloadCmd = `curl -s -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" ` +
                       `"${AGENT_URL}/download?type=pnpm" | ` +
                       `tar --zstd -xf - -C /home/coder/volumes/pnpm-store 2>&1 && ` +
                       `echo "Transfer complete"`;

    console.log(`   Executing: VM-to-VM download + zstd extraction...`);
    const transferResult = await exec(WORKER_VM, downloadCmd, 180000); // 3 minutes

    const elapsed = Date.now() - startTime;
    console.log(`   ${transferResult.stdout}`);
    if (transferResult.stderr) console.log(`   stderr: ${transferResult.stderr}`);

    if (transferResult.exitCode !== 0) {
        console.error(`   ❌ Transfer failed with exit code ${transferResult.exitCode}`);
        return;
    }

    // Verify size
    console.log('\\n3️⃣  Verifying cache size on worker...');
    const sizeResult = await exec(WORKER_VM, 'du -sm /home/coder/volumes/pnpm-store 2>/dev/null | cut -f1 || echo "0"');
    const sizeMB = parseInt(sizeResult.stdout.trim() || '0');

    console.log('\\n' + '═'.repeat(70));
    console.log(`\\n✅ TIER 3 with zstd completed!`);
    console.log(`   Size: ${sizeMB}MB`);
    console.log(`   Time: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`   Speed: ${(sizeMB / (elapsed / 1000)).toFixed(1)} MB/s effective`);
    console.log('\\n' + '═'.repeat(70));

    // Compare with previous gzip performance
    console.log('\\n📊 Performance Comparison:');
    console.log(`   Before (gzip):  120s (291MB)`);
    console.log(`   After (zstd):   ${(elapsed / 1000).toFixed(1)}s (${sizeMB}MB)`);
    console.log(`   Improvement:    ${(120 / (elapsed / 1000)).toFixed(1)}x faster! 🚀`);
}

testTier3().catch(console.error);
