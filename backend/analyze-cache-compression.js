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

async function analyzeCompression() {
    console.log('🔍 Analisi Compressione Cache\n');
    console.log('═'.repeat(70));

    // Check both cache files
    console.log('\n1️⃣  Confronto file cache:');
    const filesResult = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'ls -lh pnpm-cache.tar.zst* && ' +
        'echo "" && ' +
        'file pnpm-cache.tar.zst*'
    );
    console.log(filesResult.stdout);

    // Get detailed zstd info for both files
    console.log('\n2️⃣  Info dettagliate zstd:');
    console.log('\n   Cache NUOVA (zstd -1):');
    const newInfo = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'zstd -l pnpm-cache.tar.zst 2>&1'
    );
    console.log(newInfo.stdout);

    console.log('\n   Cache VECCHIA (backup):');
    const oldInfo = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'zstd -l pnpm-cache.tar.zst.backup 2>&1'
    );
    console.log(oldInfo.stdout);

    // Test decompression speed for both
    console.log('\n3️⃣  Test velocità decompressione:');

    console.log('\n   Test cache NUOVA (zstd -1):');
    const newTestStart = Date.now();
    const newTest = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'zstd -t pnpm-cache.tar.zst 2>&1 && echo "OK"',
        60000
    );
    const newTestTime = Date.now() - newTestStart;
    console.log(`   Risultato: ${newTest.stdout.trim()}`);
    console.log(`   Tempo: ${(newTestTime / 1000).toFixed(2)}s`);

    console.log('\n   Test cache VECCHIA (backup):');
    const oldTestStart = Date.now();
    const oldTest = await exec(
        'cd /home/coder/volumes/pnpm-store && ' +
        'zstd -t pnpm-cache.tar.zst.backup 2>&1 && echo "OK"',
        60000
    );
    const oldTestTime = Date.now() - oldTestStart;
    console.log(`   Risultato: ${oldTest.stdout.trim()}`);
    console.log(`   Tempo: ${(oldTestTime / 1000).toFixed(2)}s`);

    // Full decompression test
    console.log('\n4️⃣  Test decompressione completa (a /dev/null):');

    console.log('\n   Decompressione cache NUOVA:');
    const newDecompStart = Date.now();
    const newDecomp = await exec(
        'zstd -dc /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst > /dev/null 2>&1 && echo "Done"',
        120000
    );
    const newDecompTime = Date.now() - newDecompStart;
    console.log(`   ${newDecomp.stdout.trim()}`);
    console.log(`   Tempo: ${(newDecompTime / 1000).toFixed(1)}s (${(426 / (newDecompTime / 1000)).toFixed(1)} MB/s)`);

    console.log('\n   Decompressione cache VECCHIA:');
    const oldDecompStart = Date.now();
    const oldDecomp = await exec(
        'zstd -dc /home/coder/volumes/pnpm-store/pnpm-cache.tar.zst.backup > /dev/null 2>&1 && echo "Done"',
        120000
    );
    const oldDecompTime = Date.now() - oldDecompStart;
    console.log(`   ${oldDecomp.stdout.trim()}`);
    console.log(`   Tempo: ${(oldDecompTime / 1000).toFixed(1)}s (${(380 / (oldDecompTime / 1000)).toFixed(1)} MB/s)`);

    // Summary
    console.log('\n═'.repeat(70));
    console.log('\n📊 CONFRONTO FINALE:\n');
    console.log('   File sizes:');
    console.log(`      Vecchia: 380MB`);
    console.log(`      Nuova:   426MB (+${((426 / 380 - 1) * 100).toFixed(0)}%)`);
    console.log('\n   Velocità decompressione pura:');
    console.log(`      Vecchia: ${(oldDecompTime / 1000).toFixed(1)}s`);
    console.log(`      Nuova:   ${(newDecompTime / 1000).toFixed(1)}s`);
    console.log(`      Speedup: ${(oldDecompTime / newDecompTime).toFixed(2)}x`);

    console.log('\n   💡 CONCLUSIONE:');
    if (newDecompTime < oldDecompTime) {
        console.log(`      ✅ zstd -1 è ${(oldDecompTime / newDecompTime).toFixed(2)}x più veloce nella decompressione`);
    } else {
        console.log(`      ⚠️  zstd -1 non è più veloce (possibile cache vecchia già con livello basso)`);
    }

    console.log('\n═'.repeat(70));
}

analyzeCompression().catch(console.error);
