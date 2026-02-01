const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const VM_ID = '68395d3cd59598';

async function testUploadSize(sizeBytes, label) {
    const testFile = path.join(os.tmpdir(), `test-${sizeBytes}.tar.gz`);
    fs.writeFileSync(testFile, Buffer.alloc(sizeBytes, 'x'));
    const data = fs.readFileSync(testFile);

    console.log(`\n${label} (${(sizeBytes / 1024 / 1024).toFixed(1)}MB)...`);

    try {
        const res = await axios.post(
            `${AGENT_URL}/upload?path=/home/coder/test-${sizeBytes}&extract=false`,
            data,
            {
                headers: {
                    'Fly-Force-Instance-Id': VM_ID,
                    'Content-Type': 'application/gzip'
                },
                timeout: 60000
            }
        );

        console.log(`  ✅ SUCCESS - ${JSON.stringify(res.data)}`);
        fs.unlinkSync(testFile);
        return true;

    } catch (error) {
        console.log(`  ❌ FAILED - Status: ${error.response?.status}, Error: ${error.message}`);
        fs.unlinkSync(testFile);
        return false;
    }
}

async function main() {
    console.log('🧪 Testing /upload endpoint with different file sizes');
    console.log(`VM: ${VM_ID}\n`);

    const tests = [
        [1024, '1KB'],
        [100 * 1024, '100KB'],
        [1 * 1024 * 1024, '1MB'],
        [10 * 1024 * 1024, '10MB'],
        [50 * 1024 * 1024, '50MB'],
        [100 * 1024 * 1024, '100MB']
    ];

    for (const [size, label] of tests) {
        const success = await testUploadSize(size, label);
        if (!success) {
            console.log(`\n❌ Upload fails at ${label}`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000)); // Wait 1s between tests
    }
}

main().catch(console.error);
