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

async function checkInstallScript() {
    console.log('=== Checking Install Script ===\n');

    // 1. Check if install.sh exists
    console.log('1. Install script file:');
    let result = await exec('ls -lh /home/coder/install.sh 2>&1');
    console.log(result.stdout);
    console.log('');

    // 2. Cat the install script if it exists
    console.log('2. Install script content:');
    result = await exec('cat /home/coder/install.sh 2>&1 || echo "NO_SCRIPT"');
    console.log(result.stdout);
    console.log('');

    // 3. Check package.json exists
    console.log('3. Package.json:');
    result = await exec('ls -lh /home/coder/project/package.json 2>&1');
    console.log(result.stdout);
    console.log('');

    // 4. Check files in project
    console.log('4. Files in /home/coder/project:');
    result = await exec('ls -lah /home/coder/project | head -20');
    console.log(result.stdout);
}

checkInstallScript().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
