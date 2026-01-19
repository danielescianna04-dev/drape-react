const axios = require('axios');

const FLY_API_TOKEN = 'Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhcHAiOiJkcmFwZS13b3Jrc3BhY2VzIiwiZmx5X3Rva2VuX3R5cGUiOiJhcHAiLCJncmFudHMiOlsibWFjaGluZXMiXSwiaWF0IjoxNzM2MjU0OTY0LCJpc3MiOiJGbHkuaW8gQXBwIFRva2VuIn0.SuYtPCbp1scK98MfUDj-8QBTI2lwU7xnJ_KjzwxKM1BmEOlQZt1jCYKgN5sqAaWzr2KkZGMCHQ9XTtLXSUBtAQ';
const AGENT_URL = 'https://drape-workspaces.fly.dev';
const MACHINE_ID = '148e6d95f19998';

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
        console.error(`Error executing: ${command}`, error.message);
        return { exitCode: -1, stdout: '', stderr: error.message };
    }
}

async function checkVMState() {
    console.log('=== Checking VM State for Machine:', MACHINE_ID, '===\n');

    // 1. Check install.log for errors
    console.log('1. Install Log (last 30 lines):');
    let result = await exec('tail -30 /home/coder/install.log 2>&1 || echo "NO_INSTALL_LOG"');
    console.log(result.stdout);
    console.log('');

    // 2. Check if typescript is installed
    console.log('2. TypeScript installation:');
    result = await exec('ls -la /home/coder/project/node_modules/.bin/tsc 2>&1');
    console.log(result.stdout);
    console.log('');

    // 3. Check if next is installed
    console.log('3. Next.js installation:');
    result = await exec('ls -la /home/coder/project/node_modules/.bin/next 2>&1');
    console.log(result.stdout);
    console.log('');

    // 4. Try to run npx next manually
    console.log('4. Test npx next (version check):');
    result = await exec('cd /home/coder/project && npx next --version 2>&1');
    console.log(result.stdout);
    console.log('Exit code:', result.exitCode);
    console.log('');

    // 5. Check server.log if it exists
    console.log('5. Server Log (last 50 lines):');
    result = await exec('tail -50 /home/coder/server.log 2>&1 || echo "NO_SERVER_LOG"');
    console.log(result.stdout);
    console.log('');

    // 6. Check running processes
    console.log('6. Running Node processes:');
    result = await exec('ps auxf | grep -E "(next|node)" | grep -v grep');
    console.log(result.stdout);
    console.log('');

    // 7. Check package.json scripts
    console.log('7. Package.json scripts:');
    result = await exec('cat /home/coder/project/package.json 2>&1 | jq .scripts');
    console.log(result.stdout);
    console.log('');

    // 8. Try manual dev server start (foreground, 5s timeout)
    console.log('8. Manual dev server test (5s):');
    result = await exec('cd /home/coder/project && timeout 5s npx next dev --turbo -H 0.0.0.0 --port 3000 2>&1 || true');
    console.log(result.stdout);
}

checkVMState().then(() => {
    console.log('Done.');
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
