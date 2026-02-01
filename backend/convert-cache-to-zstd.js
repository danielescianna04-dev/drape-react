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

async function convertToZstd() {
    console.log('🔄 Converting existing gzip cache to zstd\n');

    // 1. Check existing cache
    console.log('1. Checking existing cache...');
    const checkResult = await exec('ls -lh /home/coder/volumes/pnpm-store/pnpm-cache.tar.gz');
    console.log(checkResult.stdout);

    // 2. Convert gz to zst (decompress + recompress with zstd)
    console.log('\n2. Converting gzip → zstd (this will be MUCH faster)...');
    const convertCmd = `
        cd /home/coder/volumes/pnpm-store &&
        echo "Decompressing gzip..." &&
        gunzip -c pnpm-cache.tar.gz > pnpm-cache.tar &&
        echo "Recompressing with zstd..." &&
        zstd -19 pnpm-cache.tar -o pnpm-cache.tar.zst --force &&
        echo "Cleaning up intermediate file..." &&
        rm pnpm-cache.tar &&
        echo "Done!" &&
        ls -lh pnpm-cache.tar.zst pnpm-cache.tar.gz
    `;

    const convertResult = await exec(convertCmd, 240000); // 4 minutes
    console.log(convertResult.stdout);

    if (convertResult.exitCode !== 0) {
        console.log('stderr:', convertResult.stderr);
        throw new Error('Conversion failed');
    }

    // 3. Verify format
    console.log('\n3. Verifying zstd format...');
    const verifyResult = await exec('file /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst');
    console.log(verifyResult.stdout);

    // 4. Test download
    console.log('\n4. Testing download endpoint...');
    const testResult = await exec(
        `curl -sI -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" "${AGENT_URL}/download?type=pnpm" | head -10`
    );
    console.log(testResult.stdout);

    console.log('\n✅ Conversion complete!');
}

convertToZstd().catch(console.error);
