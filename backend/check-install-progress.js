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

async function checkInstallProgress() {
    console.log('=== Checking Install Progress ===\n');

    // 1. Check if install script is running
    console.log('1. Install processes:');
    let result = await exec('ps auxf | grep -E "(pnpm|install)" | grep -v grep');
    console.log(result.stdout || 'No install processes running');
    console.log('');

    // 2. Check install.log
    console.log('2. Install log (last 20 lines):');
    result = await exec('tail -20 /home/coder/install.log 2>&1 || echo "NO_INSTALL_LOG"');
    console.log(result.stdout);
    console.log('');

    // 3. Check install marker
    console.log('3. Install marker status:');
    result = await exec('cat /home/coder/install.marker 2>&1 || echo "NO_MARKER"');
    console.log(result.stdout);
    console.log('');

    // 4. Check node_modules count
    console.log('4. node_modules package count:');
    result = await exec('ls /home/coder/project/node_modules 2>/dev/null | wc -l');
    console.log('Packages:', result.stdout.trim());
    console.log('');

    // 5. Check if Next.js is installed
    console.log('5. Next.js binary:');
    result = await exec('ls -lh /home/coder/project/node_modules/.bin/next 2>&1');
    console.log(result.stdout);
}

checkInstallProgress().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
