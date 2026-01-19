const axios = require('axios');

const FLY_API_TOKEN = 'Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhcHAiOiJkcmFwZS13b3Jrc3BhY2VzIiwiZmx5X3Rva2VuX3R5cGUiOiJhcHAiLCJncmFudHMiOlsibWFjaGluZXMiXSwiaWF0IjoxNzM2MjU0OTY0LCJpc3MiOiJGbHkuaW8gQXBwIFRva2VuIn0.SuYtPCbp1scK98MfUDj-8QBTI2lwU7xnJ_KjzwxKM1BmEOlQZt1jCYKgN5sqAaWzr2KkZGMCHQ9XTtLXSUBtAQ';
const AGENT_URL = 'https://drape-workspaces.fly.dev';
const MACHINE_ID = '56834d13f67618'; // New VM

async function exec(command) {
    try {
        const response = await axios.post(`${AGENT_URL}/exec`, {
            command,
            machineId: MACHINE_ID
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': FLY_API_TOKEN
            }
        });
        return response.data;
    } catch (error) {
        return { exitCode: -1, stdout: '', stderr: error.message };
    }
}

async function checkVM() {
    console.log('=== Checking VM 56834d13f67618 ===\n');

    console.log('1. Files in /home/coder/project:');
    let result = await exec('ls -lah /home/coder/project');
    console.log(result.stdout || 'EMPTY');
    console.log('');

    console.log('2. File count:');
    result = await exec('find /home/coder/project -type f 2>&1 | wc -l');
    console.log('Files:', result.stdout?.trim());
    console.log('');

    console.log('3. Install script:');
    result = await exec('ls -lh /home/coder/install.sh 2>&1');
    console.log(result.stdout || 'NO_SCRIPT');
    console.log('');

    console.log('4. Package.json:');
    result = await exec('test -f /home/coder/project/package.json && echo "EXISTS" || echo "NO_FILE"');
    console.log(result.stdout?.trim());
}

checkVM().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
