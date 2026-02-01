const axios = require('axios');

const WORKER_VM = '68301eec416238';
const AGENT_URL = 'https://drape-workspaces.fly.dev';

async function main() {
    console.log('Testing agent health directly...');

    try {
        const res = await axios.get(`${AGENT_URL}/health`, {
            headers: { 'Fly-Force-Instance-Id': WORKER_VM },
            timeout: 3000
        });
        console.log('✅ Agent is UP:', res.data);
        console.log('\nTesting /upload endpoint...');

        // Test upload with small file
        const testData = Buffer.from('test');
        try {
            const uploadRes = await axios.post(
                `${AGENT_URL}/upload?path=/home/coder/test&extract=false`,
                testData,
                {
                    headers: {
                        'Fly-Force-Instance-Id': WORKER_VM,
                        'Content-Type': 'application/gzip'
                    },
                    timeout: 5000
                }
            );
            console.log('✅ Upload works!', uploadRes.data);
        } catch (e) {
            console.log('❌ Upload failed:', e.response?.data || e.message);
            console.log('   Status:', e.response?.status);
        }
    } catch (e) {
        console.log('❌ Agent is DOWN:', e.message);
        console.log('\n Agent probably crashed when we killed it. Need to restart the VM or deploy via different method.');
        console.log('Try: Restart the entire VM pool or use a different worker VM');
    }
}

main().catch(console.error);
