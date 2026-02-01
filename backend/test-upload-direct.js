const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const VM_ID = '68395d3cd59598'; // Healthy VM

async function main() {
    console.log(`🧪 Testing /upload endpoint directly on ${VM_ID}\n`);

    // Create a tiny test file
    const testFile = path.join(os.tmpdir(), 'test-tiny.tar.gz');
    fs.writeFileSync(testFile, Buffer.from('tiny test content'));
    const fileData = fs.readFileSync(testFile);

    console.log(`1. Testing with tiny file (${fileData.length} bytes)...`);

    try {
        const res = await axios.post(
            `${AGENT_URL}/upload?path=/home/coder/test-upload&extract=false`,
            fileData,
            {
                headers: {
                    'Fly-Force-Instance-Id': VM_ID,
                    'Content-Type': 'application/gzip',
                    'Content-Length': fileData.length
                },
                timeout: 10000
            }
        );

        console.log(`   ✅ Upload SUCCESS!`);
        console.log(`   Response:`, res.data);

    } catch (error) {
        console.log(`   ❌ Upload FAILED!`);
        console.log(`   Status: ${error.response?.status}`);
        console.log(`   Error: ${error.response?.data || error.message}`);

        // If it's a 500, let's check what the agent says
        if (error.response?.status === 500) {
            console.log(`\n2. Checking agent logs...`);
            try {
                const logs = await axios.post(`${AGENT_URL}/exec`, {
                    command: 'tail -50 /tmp/drape-agent-*.log 2>/dev/null || echo "no logs"',
                    cwd: '/home/coder'
                }, {
                    headers: { 'Fly-Force-Instance-Id': VM_ID },
                    timeout: 5000
                });
                console.log(`   Logs:\n${logs.data.stdout}`);
            } catch (e) {
                console.log(`   Could not get logs: ${e.message}`);
            }
        }
    } finally {
        fs.unlinkSync(testFile);
    }
}

main().catch(console.error);
