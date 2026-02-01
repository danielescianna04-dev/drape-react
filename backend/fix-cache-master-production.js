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
        timeout: timeout + 10000
    });
    return result.data;
}

async function fixCacheMaster() {
    console.log('🔧 Fixing Cache Master for Production\n');
    console.log('═'.repeat(60));

    // 1. Check if cache master is running
    console.log('\n1️⃣  Checking cache master status...');
    try {
        const health = await axios.get(`${AGENT_URL}/health`, {
            headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
            timeout: 5000
        });
        console.log(`   ✅ Cache master is UP - ${JSON.stringify(health.data)}`);
    } catch (e) {
        console.log(`   ❌ Cache master is DOWN - starting it...`);
        // Start the machine
        const { exec: execSync } = require('child_process');
        execSync(`flyctl machine start ${CACHE_MASTER} --app drape-workspaces`);
        console.log(`   Waiting for startup...`);
        await new Promise(r => setTimeout(r, 10000));
    }

    // 2. Check current pnpm-store state
    console.log('\n2️⃣  Checking pnpm-store state...');
    const checkResult = await exec('du -sm /home/coder/volumes/pnpm-store 2>/dev/null | cut -f1 || echo "0"', 15000);
    const currentSize = parseInt(checkResult.stdout.trim() || '0');
    console.log(`   Current size: ${currentSize}MB`);

    if (currentSize < 500) {
        console.log('\n   ⚠️  Cache master has insufficient cache (<500MB)');
        console.log('   📦 Downloading cache from Google Cloud Storage (TIER 2.5)...');

        // Use existing cache from GCS if available
        const downloadResult = await exec(
            `curl -L -o /tmp/gcs-cache.tar.gz "https://storage.googleapis.com/drape-pnpm-cache/pnpm-latest.tar.gz" 2>&1 && ` +
            `tar -xzf /tmp/gcs-cache.tar.gz -C /home/coder/volumes/pnpm-store/ 2>&1 && ` +
            `rm /tmp/gcs-cache.tar.gz && ` +
            `du -sm /home/coder/volumes/pnpm-store | cut -f1`,
            300000 // 5 minutes
        );

        const newSize = parseInt(downloadResult.stdout.split('\n').pop().trim() || '0');
        if (newSize > 500) {
            console.log(`   ✅ Downloaded cache from GCS: ${newSize}MB`);
        } else {
            console.log(`   ⚠️  GCS cache not available, generating fresh cache...`);
            // Generate cache by installing popular packages
            const genResult = await exec(
                `cd /tmp && ` +
                `echo '{"dependencies":{"react":"^18.2.0","react-dom":"^18.2.0","next":"^14.0.0","typescript":"^5.3.0","tailwindcss":"^3.4.0","@types/react":"^18.2.0","@types/node":"^20.0.0"}}' > package.json && ` +
                `pnpm install --store-dir=/home/coder/volumes/pnpm-store 2>&1 | tail -20 && ` +
                `du -sm /home/coder/volumes/pnpm-store | cut -f1`,
                300000
            );
            console.log(`   Generated: ${genResult.stdout.split('\n').pop().trim()}MB`);
        }
    }

    // 3. Check pnpm-store layout
    console.log('\n3️⃣  Detecting pnpm-store layout...');
    const layoutResult = await exec('ls -la /home/coder/volumes/pnpm-store/ | head -20');
    console.log(layoutResult.stdout);

    const hasFiles = layoutResult.stdout.includes(' files');
    const hasV10 = layoutResult.stdout.includes(' v10');
    const layout = hasFiles ? 'pnpm10' : hasV10 ? 'v10' : 'unknown';
    console.log(`   Detected layout: ${layout}`);

    // 4. Generate pre-compressed zstd cache
    console.log('\n4️⃣  Generating pre-compressed zstd cache...');

    let tarCmd;
    if (layout === 'pnpm10') {
        tarCmd = 'cd /home/coder/volumes/pnpm-store && tar --zstd -cf pnpm-cache.tar.zst files index 2>&1';
    } else if (layout === 'v10') {
        tarCmd = 'cd /home/coder/volumes/pnpm-store && tar --zstd -cf pnpm-cache.tar.zst v10/files v10/index 2>&1';
    } else {
        throw new Error('Unknown pnpm layout - cannot generate cache');
    }

    console.log(`   Command: ${tarCmd}`);
    const genResult = await exec(`${tarCmd} && ls -lh /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst`, 240000);
    console.log(genResult.stdout);

    if (genResult.exitCode !== 0) {
        console.log('   stderr:', genResult.stderr);
        throw new Error('Failed to generate zstd cache');
    }

    // 5. Verify the cache file
    console.log('\n5️⃣  Verifying generated cache...');
    const verifyResult = await exec(
        'ls -lh /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst && ' +
        'file /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst'
    );
    console.log(verifyResult.stdout);

    // 6. Test download endpoint
    console.log('\n6️⃣  Testing download endpoint...');
    const testResult = await exec(
        `curl -sI -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" "${AGENT_URL}/download?type=pnpm" | grep -E "(HTTP|Content-Type|Content-Length|Content-Disposition)"`
    );
    console.log(testResult.stdout);

    if (testResult.stdout.includes('200') && testResult.stdout.includes('zstd')) {
        console.log('\n✅ Cache master is ready!');
        console.log('   - zstd pre-compressed cache generated');
        console.log('   - Download endpoint working');
        console.log('   - Ready for production TIER 3 transfers');
        return true;
    } else {
        throw new Error('Download endpoint not working correctly');
    }
}

fixCacheMaster()
    .then(() => {
        console.log('\n' + '═'.repeat(60));
        console.log('🎉 CACHE MASTER PRODUCTION READY!');
    })
    .catch(error => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });
