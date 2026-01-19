const axios = require('axios');

const FLY_API_TOKEN = 'Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhcHAiOiJkcmFwZS13b3Jrc3BhY2VzIiwiZmx5X3Rva2VuX3R5cGUiOiJhcHAiLCJncmFudHMiOlsibWFjaGluZXMiXSwiaWF0IjoxNzM2MjU0OTY0LCJpc3MiOiJGbHkuaW8gQXBwIFRva2VuIn0.SuYtPCbp1scK98MfUDj-8QBTI2lwU7xnJ_KjzwxKM1BmEOlQZt1jCYKgN5sqAaWzr2KkZGMCHQ9XTtLXSUBtAQ';
const AGENT_URL = 'https://drape-workspaces.fly.dev';
const MACHINE_ID = '6e823d1dfe9658';

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
    console.log('=== Checking VM Files ===\n');

    console.log('1. /home/coder structure:');
    let result = await exec('ls -lah /home/coder');
    console.log(result.stdout);
    console.log('');

    console.log('2. /home/coder/project:');
    result = await exec('find /home/coder/project -maxdepth 2 -type f 2>&1 | head -20');
    console.log(result.stdout);
    console.log('');

    console.log('3. Working directory:');
    result = await exec('pwd');
    console.log(result.stdout);
    console.log('');

    console.log('4. All files in /home/coder:');
    result = await exec('find /home/coder -maxdepth 1 -type f 2>&1');
    console.log(result.stdout);
}

checkVM().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
