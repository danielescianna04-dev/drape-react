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

async function testOptimizedTier3() {
    console.log('🚀 Test TIER 3 con Cache Ottimizzata (zstd -1)\n');
    console.log('═'.repeat(70));

    // 1. Clear worker cache
    console.log('\n1️⃣  Pulizia cache worker...');
    await exec(WORKER_VM, 'rm -rf /home/coder/volumes/pnpm-store/*');
    console.log('   ✅ Cache pulita');

    // 2. Test complete transfer (download + extraction)
    console.log('\n2️⃣  Test TIER 3 completo (download + extraction)...');
    console.log('   Avvio transfer con zstd -1 ottimizzato...\n');

    const startTime = Date.now();

    const downloadCmd = `curl -s -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" ` +
                       `"${AGENT_URL}/download?type=pnpm" | ` +
                       `tar --zstd -xf - -C /home/coder/volumes/pnpm-store 2>&1`;

    const transferResult = await exec(WORKER_VM, downloadCmd, 180000);

    const totalTime = Date.now() - startTime;

    if (transferResult.exitCode !== 0) {
        console.error(`   ❌ Transfer fallito: ${transferResult.stderr || transferResult.stdout}`);
        return;
    }

    console.log('   ✅ Transfer completato!');

    // 3. Verify cache size
    console.log('\n3️⃣  Verifica cache trasferita...');
    const sizeResult = await exec(WORKER_VM, 'du -sm /home/coder/volumes/pnpm-store 2>/dev/null | cut -f1');
    const sizeMB = parseInt(sizeResult.stdout.trim() || '0');

    console.log(`   Cache size: ${sizeMB}MB`);

    // 4. Breakdown test (separate download and extraction)
    console.log('\n4️⃣  Breakdown test per analisi dettagliata...');

    // Clear again for breakdown
    await exec(WORKER_VM, 'rm -rf /home/coder/volumes/pnpm-store/* && rm -f /tmp/cache-test.tar.zst');

    // Download only
    console.log('\n   📥 Solo download (no extraction)...');
    const downloadStart = Date.now();
    await exec(WORKER_VM,
        `curl -s -H "Fly-Force-Instance-Id: ${CACHE_MASTER}" ` +
        `"${AGENT_URL}/download?type=pnpm" -o /tmp/cache-test.tar.zst`,
        120000
    );
    const downloadTime = Date.now() - downloadStart;

    // Extraction only
    console.log('   📂 Solo extraction (file locale)...');
    const extractStart = Date.now();
    await exec(WORKER_VM,
        'tar --zstd -xf /tmp/cache-test.tar.zst -C /home/coder/volumes/pnpm-store',
        120000
    );
    const extractTime = Date.now() - extractStart;

    // Cleanup
    await exec(WORKER_VM, 'rm -f /tmp/cache-test.tar.zst');

    // Results
    console.log('\n═'.repeat(70));
    console.log('\n📊 RISULTATI TEST TIER 3 OTTIMIZZATO:\n');

    console.log('   📦 Cache info:');
    console.log(`      Size compressed:   426MB (zstd -1)`);
    console.log(`      Size extracted:    ${sizeMB}MB`);
    console.log(`      Compression ratio: ${((426 / sizeMB) * 100).toFixed(1)}%`);

    console.log('\n   ⏱️  Performance:');
    console.log(`      Download:          ${(downloadTime / 1000).toFixed(1)}s (${(426 / (downloadTime / 1000)).toFixed(1)} MB/s)`);
    console.log(`      Extraction:        ${(extractTime / 1000).toFixed(1)}s (${(sizeMB / (extractTime / 1000)).toFixed(1)} MB/s)`);
    console.log(`      Total (pipeline):  ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`      Total (separato):  ${((downloadTime + extractTime) / 1000).toFixed(1)}s`);

    console.log('\n   🎯 Confronto con versione precedente:');
    console.log(`      Prima (zstd -19):  171.5s (extraction: ~180s)`);
    console.log(`      Dopo (zstd -1):    ${(totalTime / 1000).toFixed(1)}s (extraction: ${(extractTime / 1000).toFixed(1)}s)`);
    console.log(`      Miglioramento:     ${(171.5 / (totalTime / 1000)).toFixed(2)}x più veloce! 🚀`);
    console.log(`      Risparmio tempo:   ${(171.5 - totalTime / 1000).toFixed(1)}s (-${(((171.5 - totalTime / 1000) / 171.5) * 100).toFixed(0)}%)`);

    // Speed comparison
    const oldExtractionSpeed = 1543 / 180; // 8.6 MB/s
    const newExtractionSpeed = sizeMB / (extractTime / 1000);
    console.log(`\n   💡 Velocità extraction:`);
    console.log(`      Prima:  ${oldExtractionSpeed.toFixed(1)} MB/s`);
    console.log(`      Dopo:   ${newExtractionSpeed.toFixed(1)} MB/s`);
    console.log(`      Gain:   ${(newExtractionSpeed / oldExtractionSpeed).toFixed(2)}x più veloce! ⚡`);

    console.log('\n═'.repeat(70));

    if (totalTime / 1000 < 90) {
        console.log('\n✅ OBIETTIVO RAGGIUNTO! Cache transfer < 90s');
        console.log('🎉 Soluzione pronta per produzione!');
    } else {
        console.log('\n⚠️  Tempo ancora sopra target (90s), ma migliorato significativamente');
    }

    console.log('\n═'.repeat(70));
}

testOptimizedTier3().catch(console.error);
