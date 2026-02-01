const axios = require('axios');
const archiver = require('archiver');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const WORKER_VM = '148e659eb07de8'; // VM used in recent tests

async function testOptimizedForceSync() {
    console.log('🚀 Testing Optimized Force-Sync (Binary Upload)\n');
    console.log('═'.repeat(70));

    // Create test files
    const testFiles = [];
    for (let i = 0; i < 50; i++) {
        testFiles.push({
            path: `test-file-${i}.txt`,
            content: `Test content for file ${i} - ${Math.random()}`
        });
    }

    console.log(`\n📦 Creating test archive with ${testFiles.length} files...`);

    // Create tar.gz archive
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });
    const chunks = [];

    archive.on('data', chunk => chunks.push(chunk));

    for (const file of testFiles) {
        archive.append(file.content, { name: file.path });
    }

    await archive.finalize();

    await new Promise((resolve, reject) => {
        archive.on('end', resolve);
        archive.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    console.log(`   Archive size: ${(buffer.length / 1024).toFixed(1)}KB`);

    // Test 1: Binary upload (NEW, optimized)
    console.log('\n1️⃣  Testing BINARY upload (optimized)...');
    const binaryStart = Date.now();

    try {
        const binaryResponse = await axios.post(`${AGENT_URL}/extract`, buffer, {
            timeout: 30000,
            headers: {
                'Fly-Force-Instance-Id': WORKER_VM,
                'Content-Type': 'application/gzip'
            },
            maxContentLength: 50 * 1024 * 1024,
            maxBodyLength: 50 * 1024 * 1024
        });

        const binaryTime = Date.now() - binaryStart;
        console.log(`   ✅ Binary upload completed in ${binaryTime}ms`);
        console.log(`   Files extracted: ${binaryResponse.data.filesExtracted || 0}`);

    } catch (e) {
        console.error(`   ❌ Binary upload failed: ${e.message}`);
    }

    // Test 2: Base64 upload (OLD, for comparison)
    console.log('\n2️⃣  Testing BASE64 upload (legacy)...');
    const base64Start = Date.now();

    try {
        const base64Archive = buffer.toString('base64');
        const base64Size = base64Archive.length;
        console.log(`   Base64 size: ${(base64Size / 1024).toFixed(1)}KB (+${(((base64Size / buffer.length) - 1) * 100).toFixed(0)}%)`);

        const base64Response = await axios.post(`${AGENT_URL}/extract`, {
            archive: base64Archive
        }, {
            timeout: 30000,
            headers: {
                'Fly-Force-Instance-Id': WORKER_VM
            },
            maxContentLength: 50 * 1024 * 1024,
            maxBodyLength: 50 * 1024 * 1024
        });

        const base64Time = Date.now() - base64Start;
        console.log(`   ✅ Base64 upload completed in ${base64Time}ms`);
        console.log(`   Files extracted: ${base64Response.data.filesExtracted || 0}`);

    } catch (e) {
        console.error(`   ❌ Base64 upload failed: ${e.message}`);
    }

    console.log('\n═'.repeat(70));
    console.log('\n📊 COMPARISON:');
    console.log(`   Binary (optimized):  ${(buffer.length / 1024).toFixed(1)}KB`);
    console.log(`   Base64 (legacy):     ${(buffer.toString('base64').length / 1024).toFixed(1)}KB (+33%)`);
    console.log('\n💡 Binary upload eliminates:');
    console.log('   - Base64 encoding CPU overhead');
    console.log('   - +33% size increase');
    console.log('   - Decoding on agent side');
    console.log('\n✅ Expected speedup: 3x faster for force-sync!');
    console.log('\n═'.repeat(70));
}

testOptimizedForceSync().catch(console.error);
