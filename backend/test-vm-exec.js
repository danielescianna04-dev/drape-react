const axios = require('axios');

const FLY_API_TOKEN = 'Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhcHAiOiJkcmFwZS13b3Jrc3BhY2VzIiwiZmx5X3Rva2VuX3R5cGUiOiJhcHAiLCJncmFudHMiOlsibWFjaGluZXMiXSwiaWF0IjoxNzM2MjU0OTY0LCJpc3MiOiJGbHkuaW8gQXBwIFRva2VuIn0.SuYtPCbp1scK98MfUDj-8QBTI2lwU7xnJ_KjzwxKM1BmEOlQZt1jCYKgN5sqAaWzr2KkZGMCHQ9XTtLXSUBtAQ';
const AGENT_URL = 'https://drape-workspaces.fly.dev';
const MACHINE_ID = '56834d13f67618';

async function testExec() {
    console.log('Testing VM exec endpoint...\n');

    try {
        console.log(`POST ${AGENT_URL}/exec`);
        console.log(`Machine ID: ${MACHINE_ID}\n`);

        const response = await axios.post(`${AGENT_URL}/exec`, {
            command: 'echo "Hello from VM"',
            machineId: MACHINE_ID
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': FLY_API_TOKEN
            },
            timeout: 10000
        });

        console.log('Response status:', response.status);
        console.log('Response data:', JSON.stringify(response.data, null, 2));

        if (response.data) {
            console.log('\nParsed fields:');
            console.log('- exitCode:', response.data.exitCode);
            console.log('- stdout:', JSON.stringify(response.data.stdout));
            console.log('- stderr:', JSON.stringify(response.data.stderr));
            console.log('- stdout length:', response.data.stdout?.length || 0);
            console.log('- stderr length:', response.data.stderr?.length || 0);
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testExec();
