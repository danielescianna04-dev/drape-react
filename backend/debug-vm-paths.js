const axios = require('axios');

const FLY_API_TOKEN = 'Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhcHAiOiJkcmFwZS13b3Jrc3BhY2VzIiwiZmx5X3Rva2VuX3R5cGUiOiJhcHAiLCJncmFudHMiOlsibWFjaGluZXMiXSwiaWF0IjoxNzM2MjU0OTY0LCJpc3MiOiJGbHkuaW8gQXBwIFRva2VuIn0.SuYtPCbp1scK98MfUDj-8QBTI2lwU7xnJ_KjzwxKM1BmEOlQZt1jCYKgN5sqAaWzr2KkZGMCHQ9XTtLXSUBtAQ';
const AGENT_URL = 'https://drape-workspaces.fly.dev';
const MACHINE_ID = '56834d13f67618';

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

async function debugPaths() {
    console.log('=== Debugging Paths on VM ===\n');

    console.log('1. /home/coder directory:');
    let result = await exec('ls -lah /home/coder | head -20');
    console.log(result.stdout);
    console.log('');

    console.log('2. /home/coder/project directory (if exists):');
    result = await exec('ls -lah /home/coder/project 2>&1 | head -20');
    console.log(result.stdout);
    console.log('');

    console.log('3. Find all package.json files:');
    result = await exec('find /home/coder -name "package.json" -type f 2>&1 | head -10');
    console.log(result.stdout);
    console.log('');

    console.log('4. Check /home/coder/install.sh:');
    result = await exec('cat /home/coder/install.sh 2>&1 | head -20');
    console.log(result.stdout);
}

debugPaths().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
