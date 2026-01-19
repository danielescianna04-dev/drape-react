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

async function checkProjectFiles() {
    console.log('=== Checking Project Files on VM ===\n');

    // 1. Count files in project
    console.log('1. File count in /home/coder/project:');
    let result = await exec('find /home/coder/project -type f 2>&1 | wc -l');
    console.log('Files:', result.stdout?.trim());
    console.log('');

    // 2. List top-level files
    console.log('2. Top-level files in project:');
    result = await exec('ls -lah /home/coder/project');
    console.log(result.stdout);
    console.log('');

    // 3. Check if package.json exists
    console.log('3. Package.json exists:');
    result = await exec('test -f /home/coder/project/package.json && echo "YES" || echo "NO"');
    console.log(result.stdout?.trim());
    console.log('');

    // 4. Check install.sh
    console.log('4. Install script:');
    result = await exec('test -f /home/coder/install.sh && cat /home/coder/install.sh || echo "NO_SCRIPT"');
    console.log(result.stdout?.slice(0, 500));
    console.log('');

    // 5. Try manual pnpm install (dry-run)
    console.log('5. Test pnpm install (dry-run):');
    result = await exec('cd /home/coder/project && pnpm install --dry-run 2>&1 | head -10');
    console.log(result.stdout);
}

checkProjectFiles().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
