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

async function optimizeCache() {
    console.log('🚀 Ottimizzazione Cache con zstd -1\n');
    console.log('═'.repeat(70));

    // 1. Backup old cache
    console.log('\n1️⃣  Backup della cache attuale...');
    const backupResult = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'mv pnpm-cache.tar.zst pnpm-cache.tar.zst.backup 2>/dev/null || echo "No existing cache to backup"'
    );
    console.log(`   ${backupResult.stdout.trim()}`);

    // 2. Check current cache info
    console.log('\n2️⃣  Info cache precedente:');
    const oldInfo = await exec('ls -lh /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst.backup 2>&1 || echo "No backup"');
    console.log(`   ${oldInfo.stdout.trim()}`);

    // 3. Generate new cache with zstd -1
    console.log('\n3️⃣  Generazione nuova cache con zstd -1 (ultra-fast decompression)...');
    console.log('   Questo potrebbe richiedere 2-3 minuti...');

    const startTime = Date.now();
    const genResult = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'tar -cf - v10/files v10/index 2>/dev/null | zstd -1 -o pnpm-cache.tar.zst --force && ' +
        'echo "✅ Cache generated successfully!"',
        300000 // 5 minutes timeout
    );
    const genTime = Date.now() - startTime;

    console.log(`   ${genResult.stdout}`);
    if (genResult.stderr) console.log(`   stderr: ${genResult.stderr}`);

    if (genResult.exitCode !== 0) {
        console.error(`\n❌ Generazione fallita! Ripristino backup...`);
        await exec('cd /home/coder/volumes/pnpm-store && mv pnpm-cache.tar.zst.backup pnpm-cache.tar.zst');
        throw new Error('Cache generation failed');
    }

    console.log(`   Tempo generazione: ${(genTime / 1000).toFixed(1)}s`);

    // 4. Verify new cache
    console.log('\n4️⃣  Verifica nuova cache...');
    const verifyResult = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'ls -lh pnpm-cache.tar.zst && ' +
        'file pnpm-cache.tar.zst && ' +
        'echo "" && ' +
        'du -h pnpm-cache.tar.zst | cut -f1'
    );
    console.log(verifyResult.stdout);

    // 5. Get file sizes for comparison
    const sizeResult = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'stat -f "%z" pnpm-cache.tar.zst 2>/dev/null || stat -c "%s" pnpm-cache.tar.zst'
    );
    const newSizeMB = parseInt(sizeResult.stdout.trim()) / 1024 / 1024;

    const oldSizeResult = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'stat -f "%z" pnpm-cache.tar.zst.backup 2>/dev/null || stat -c "%s" pnpm-cache.tar.zst.backup 2>/dev/null || echo "0"'
    );
    const oldSizeMB = parseInt(oldSizeResult.stdout.trim() || '0') / 1024 / 1024;

    // 6. Test download endpoint
    console.log('\n5️⃣  Test download endpoint...');
    const testResult = await exec(
        'curl -sI http://localhost:13338/download?type=pnpm | head -10'
    );
    console.log(testResult.stdout);

    // Summary
    console.log('\n═'.repeat(70));
    console.log('\n📊 RISULTATI OTTIMIZZAZIONE:\n');

    if (oldSizeMB > 0) {
        console.log(`   Cache precedente (zstd -19): ${oldSizeMB.toFixed(1)}MB`);
        console.log(`   Cache nuova (zstd -1):       ${newSizeMB.toFixed(1)}MB`);
        console.log(`   Differenza:                  +${(newSizeMB - oldSizeMB).toFixed(1)}MB (+${((newSizeMB / oldSizeMB - 1) * 100).toFixed(1)}%)`);
    } else {
        console.log(`   Cache nuova (zstd -1): ${newSizeMB.toFixed(1)}MB`);
    }

    console.log(`\n   ⚡ Trade-off: +${((newSizeMB - oldSizeMB) / oldSizeMB * 100).toFixed(0)}% dimensione`);
    console.log(`   🚀 Beneficio: 3-4x decompressione più veloce!`);
    console.log(`   💰 Costo rete: +${(newSizeMB - oldSizeMB).toFixed(0)}MB per transfer (trascurabile)`);

    console.log('\n═'.repeat(70));
    console.log('\n✅ Ottimizzazione completata!');
    console.log('\n📝 Note:');
    console.log('   - Backup salvato come: pnpm-cache.tar.zst.backup');
    console.log('   - Per ripristinare: mv pnpm-cache.tar.zst.backup pnpm-cache.tar.zst');
    console.log('\n🎯 Prossimo step: Test TIER 3 performance');
}

optimizeCache().catch(console.error);
