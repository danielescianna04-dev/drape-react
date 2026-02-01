const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';
const WORKER_VM = '17810162ad9d58';

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

async function analyzeBottleneck() {
    console.log('🔍 Analyzing TIER 3 Performance Bottlenecks\n');
    console.log('═'.repeat(70));

    // Test 1: Pure download speed (no extraction)
    console.log('\n1️⃣  Testing pure download speed (no extraction)...');
    await exec(WORKER_VM, 'rm -f /tmp/test-cache.tar.zst');

    const downloadStart = Date.now();
    const downloadResult = await exec(WORKER_VM,
        `curl -s -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" ` +
        `"${AGENT_URL}/download?type=pnpm" -o /tmp/test-cache.tar.zst 2>&1 && ` +
        `ls -lh /tmp/test-cache.tar.zst | awk '{print $5}'`,
        180000
    );
    const downloadTime = Date.now() - downloadStart;

    console.log(`   Downloaded: ${downloadResult.stdout.trim()}`);
    console.log(`   Time: ${(downloadTime / 1000).toFixed(1)}s`);
    console.log(`   Speed: ${(380 / (downloadTime / 1000)).toFixed(1)} MB/s`);

    // Test 2: Pure extraction speed (local file)
    console.log('\n2️⃣  Testing pure extraction speed (local file)...');
    await exec(WORKER_VM, 'rm -rf /home/coder/volumes/pnpm-store/*');

    const extractStart = Date.now();
    const extractResult = await exec(WORKER_VM,
        'tar --zstd -xf /tmp/test-cache.tar.zst -C /home/coder/volumes/pnpm-store 2>&1 && echo "Done"',
        180000
    );
    const extractTime = Date.now() - extractStart;

    console.log(`   ${extractResult.stdout.trim()}`);
    console.log(`   Time: ${(extractTime / 1000).toFixed(1)}s`);
    console.log(`   Speed: ${(1543 / (extractTime / 1000)).toFixed(1)} MB/s (extraction)`);

    // Test 3: Check compression level of cache file
    console.log('\n3️⃣  Checking zstd compression level...');
    const levelResult = await exec(CACHE_MASTER,
        'zstd -l /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst 2>&1 | grep -E "(Compressed|Ratio|Level)" || echo "Info not available"'
    );
    console.log(`   ${levelResult.stdout}`);

    // Test 4: Check disk I/O performance
    console.log('\n4️⃣  Testing disk I/O performance...');
    const ioResult = await exec(WORKER_VM,
        'dd if=/dev/zero of=/home/coder/volumes/test-io bs=1M count=500 oflag=direct 2>&1 | grep -E "(MB/s|copied)"',
        60000
    );
    console.log(`   Write speed: ${ioResult.stdout}`);

    await exec(WORKER_VM, 'rm -f /home/coder/volumes/test-io');

    // Summary
    console.log('\n═'.repeat(70));
    console.log('\n📊 BREAKDOWN:');
    console.log(`   Download:   ${(downloadTime / 1000).toFixed(1)}s (${(380 / (downloadTime / 1000)).toFixed(1)} MB/s)`);
    console.log(`   Extraction: ${(extractTime / 1000).toFixed(1)}s (${(1543 / (extractTime / 1000)).toFixed(1)} MB/s)`);
    console.log(`   Total:      ${((downloadTime + extractTime) / 1000).toFixed(1)}s`);
    console.log(`   Pipeline:   171.5s (actual with curl | tar)`);
    console.log('\n💡 OPTIMIZATION OPPORTUNITIES:');

    if (downloadTime / 1000 > 10) {
        console.log(`   ⚠️  Download is slow (${(downloadTime / 1000).toFixed(1)}s) - network bottleneck`);
    } else {
        console.log(`   ✅ Download is fast (${(downloadTime / 1000).toFixed(1)}s)`);
    }

    if (extractTime / 1000 > 60) {
        console.log(`   ⚠️  Extraction is slow (${(extractTime / 1000).toFixed(1)}s) - consider:`);
        console.log('      • Lower zstd compression level (faster decompression)');
        console.log('      • Disk I/O optimization');
        console.log('      • Reduce number of small files');
    } else {
        console.log(`   ✅ Extraction is reasonable (${(extractTime / 1000).toFixed(1)}s)`);
    }

    console.log('\n═'.repeat(70));
}

analyzeBottleneck().catch(console.error);
