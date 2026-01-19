const axios = require('axios');

const FLY_API_TOKEN = 'Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhcHAiOiJkcmFwZS13b3Jrc3BhY2VzIiwiZmx5X3Rva2VuX3R5cGUiOiJhcHAiLCJncmFudHMiOlsibWFjaGluZXMiXSwiaWF0IjoxNzM2MjU0OTY0LCJpc3MiOiJGbHkuaW8gQXBwIFRva2VuIn0.SuYtPCbp1scK98MfUDj-8QBTI2lwU7xnJ_KjzwxKM1BmEOlQZt1jCYKgN5sqAaWzr2KkZGMCHQ9XTtLXSUBtAQ';
const AGENT_URL = 'https://drape-workspaces.fly.dev';
const MACHINE_ID = '68397e1fd20628';

async function exec(command, cwd = '/home/coder/project') {
    try {
        const response = await axios.post(`${AGENT_URL}/exec`, {
            command,
            cwd
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Fly-Force-Instance-Id': MACHINE_ID
            },
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        return { exitCode: -1, stdout: '', stderr: error.message };
    }
}

async function checkVM() {
    console.log('=== Checking VM 68397e1fd20628 (CORRECT API) ===\n');

    console.log('1. Echo test:');
    let result = await exec('echo "Hello from VM"');
    console.log('Exit code:', result.exitCode);
    console.log('Stdout:', result.stdout);
    console.log('');

    console.log('2. PWD:');
    result = await exec('pwd');
    console.log('Working dir:', result.stdout?.trim());
    console.log('');

    console.log('3. List /home/coder:');
    result = await exec('ls -lah /home/coder', '/home/coder');
    console.log(result.stdout || 'EMPTY');
    console.log('');

    console.log('4. Project directory:');
    result = await exec('ls -lah .', '/home/coder/project');
    console.log(result.stdout || 'EMPTY');
    console.log('');

    console.log('5. Check for package.json:');
    result = await exec('test -f package.json && echo "EXISTS" || echo "NO_FILE"');
    console.log(result.stdout?.trim());
    console.log('');

    console.log('6. Check for node_modules:');
    result = await exec('test -d node_modules && echo "EXISTS" || echo "NO_DIR"');
    console.log(result.stdout?.trim());
    console.log('');

    console.log('7. File count in project:');
    result = await exec('find . -type f | wc -l');
    console.log('Files:', result.stdout?.trim());
    console.log('');

    console.log('8. Check for dev server process:');
    result = await exec('ps aux | grep "next dev" | grep -v grep', '/home/coder');
    console.log(result.stdout || 'NO PROCESS');
}

checkVM().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
