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

async function testCompressionLevels() {
    console.log('🧪 Testing different zstd compression levels\n');
    console.log('═'.repeat(70));

    // Check current cache compression info
    console.log('\n1️⃣  Current cache file info:');
    const currentInfo = await exec(CACHE_MASTER,
        'ls -lh /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst && ' +
        'file /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst'
    );
    console.log(currentInfo.stdout);

    // Test different compression levels
    const levels = [1, 3, 10, 19];
    const results = [];

    for (const level of levels) {
        console.log(`\n2️⃣  Testing zstd level ${level}...`);

        // Generate compressed file
        console.log(`   Compressing with level ${level}...`);
        const compressStart = Date.now();
        const compressResult = await exec(CACHE_MASTER,
            `cd /home/coder/volumes/pnpm-store && ` +
            `tar -cf - v10/files v10/index 2>/dev/null | zstd -${level} -o /tmp/test-${level}.tar.zst && ` +
            `ls -lh /tmp/test-${level}.tar.zst | awk '{print $5}'`,
            300000
        );
        const compressTime = (Date.now() - compressStart) / 1000;
        const compressedSize = compressResult.stdout.trim();

        console.log(`   Size: ${compressedSize}, Time: ${compressTime.toFixed(1)}s`);

        // Test decompression speed
        console.log(`   Testing decompression speed...`);
        const decompressStart = Date.now();
        await exec(WORKER_VM, 'rm -rf /tmp/test-extract && mkdir -p /tmp/test-extract');

        // Download + extract
        const extractResult = await exec(WORKER_VM,
            `curl -s http://${CACHE_MASTER}.vm.drape-workspaces.internal:13338/tmp/test-${level}.tar.zst 2>/dev/null | ` +
            `zstd -d | tar -xf - -C /tmp/test-extract 2>&1 || ` +
            `(scp root@${CACHE_MASTER}:/tmp/test-${level}.tar.zst /tmp/ 2>&1 && ` +
            `tar --zstd -xf /tmp/test-${level}.tar.zst -C /tmp/test-extract)`,
            300000
        );
        const decompressTime = (Date.now() - decompressStart) / 1000;

        console.log(`   Decompression: ${decompressTime.toFixed(1)}s`);

        // Clean up
        await exec(CACHE_MASTER, `rm -f /tmp/test-${level}.tar.zst`);
        await exec(WORKER_VM, 'rm -rf /tmp/test-extract /tmp/test-*.tar.zst');

        results.push({
            level,
            compressedSize,
            compressTime,
            decompressTime
        });
    }

    // Summary
    console.log('\n═'.repeat(70));
    console.log('\n📊 COMPRESSION LEVEL COMPARISON:\n');
    console.log('Level | Size    | Compress Time | Decompress Time | Total');
    console.log('------|---------|---------------|-----------------|-------');

    for (const r of results) {
        const total = r.compressTime + r.decompressTime;
        console.log(`  ${String(r.level).padEnd(4)}| ${String(r.compressedSize).padEnd(8)}| ${String(r.compressTime.toFixed(1) + 's').padEnd(14)}| ${String(r.decompressTime.toFixed(1) + 's').padEnd(16)}| ${total.toFixed(1)}s`);
    }

    // Find best
    const fastest = results.reduce((best, curr) =>
        (curr.decompressTime < best.decompressTime) ? curr : best
    );

    console.log('\n💡 RECOMMENDATION:');
    console.log(`   Best for decompression speed: zstd -${fastest.level}`);
    console.log(`   Decompression time: ${fastest.decompressTime.toFixed(1)}s`);
    console.log(`   vs current (likely -19): 180.1s`);
    console.log(`   Potential speedup: ${(180.1 / fastest.decompressTime).toFixed(1)}x faster! 🚀`);

    console.log('\n═'.repeat(70));
}

testCompressionLevels().catch(console.error);
