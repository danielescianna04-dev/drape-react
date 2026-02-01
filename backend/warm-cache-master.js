const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';

async function warmCacheMaster() {
    console.log('🔥 Warming cache master with zstd pre-compressed cache...\n');

    // 1. Check current pnpm-store state
    console.log('1. Checking pnpm-store state...');
    const checkCmd = `ls -la /home/coder/volumes/pnpm-store/ 2>&1 && du -sm /home/coder/volumes/pnpm-store/ | cut -f1`;

    const checkResult = await axios.post(`${AGENT_URL}/exec`, {
        command: checkCmd,
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
        timeout: 10000
    });

    console.log(checkResult.data.stdout);
    const sizeMB = parseInt(checkResult.data.stdout.split('\n').pop().trim());
    console.log(`\nCache master pnpm-store size: ${sizeMB}MB`);

    if (sizeMB < 500) {
        console.log('\n❌ Cache master pnpm-store too small (<500MB)');
        console.log('   Need to populate it first with actual pnpm packages');
        return;
    }

    // 2. Generate pre-compressed zstd cache
    console.log('\n2. Generating pre-compressed zstd cache...');
    const genCmd = `
        cd /home/coder/volumes/pnpm-store &&
        if [ -d "files" ]; then
            # pnpm 10.x layout
            tar --zstd -cf pnpm-cache.tar.zst files index 2>&1 | head -5 &&
            ls -lh pnpm-cache.tar.zst
        elif [ -d "v10/files" ]; then
            # pnpm v10 layout
            tar --zstd -cf pnpm-cache.tar.zst -C v10 files index 2>&1 | head -5 &&
            ls -lh pnpm-cache.tar.zst
        else
            echo "ERROR: Unknown pnpm layout"
        fi
    `;

    const genResult = await axios.post(`${AGENT_URL}/exec`, {
        command: genCmd,
        cwd: '/home/coder',
        timeout: 180000 // 3 minutes
    }, {
        headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
        timeout: 200000
    });

    console.log(genResult.data.stdout);
    if (genResult.data.stderr) console.log('stderr:', genResult.data.stderr);

    console.log('\n3. Testing download now...');
    const testCmd = `curl -sI -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" "${AGENT_URL}/download?type=pnpm" | grep -E "(Content-Type|Content-Length)"`;

    const testResult = await axios.post(`${AGENT_URL}/exec`, {
        command: testCmd,
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
        timeout: 10000
    });

    console.log(testResult.data.stdout || testResult.data.stderr);
}

warmCacheMaster().catch(console.error);
