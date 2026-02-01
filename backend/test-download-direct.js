const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';

async function test() {
    console.log('Testing download endpoint...\n');

    try {
        // Test 1: HEAD request to see headers
        console.log('1. Testing HEAD request:');
        const headResponse = await axios.head(`${AGENT_URL}/download?type=pnpm`, {
            headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
            timeout: 15000,
            validateStatus: () => true // Don't throw on non-2xx
        });

        console.log('Status:', headResponse.status);
        console.log('Headers:', headResponse.headers);

        // Test 2: GET request with range to download just first 1MB
        console.log('\n2. Testing GET request (first 1000 bytes):');
        const getResponse = await axios.get(`${AGENT_URL}/download?type=pnpm`, {
            headers: {
                'Fly-Force-Instance-Id': CACHE_MASTER,
                'Range': 'bytes=0-999'
            },
            timeout: 15000,
            validateStatus: () => true,
            responseType: 'arraybuffer'
        });

        console.log('Status:', getResponse.status);
        console.log('Content-Length:', getResponse.headers['content-length']);
        console.log('Content-Type:', getResponse.headers['content-type']);
        if (getResponse.data) {
            const bytes = Buffer.from(getResponse.data);
            console.log('First 4 bytes (hex):', bytes.slice(0, 4).toString('hex'));
            console.log('Expected zstd magic: 28b52ffd');
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

test().catch(console.error);
