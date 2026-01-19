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

async function detailedCheck() {
    console.log('=== Detailed VM Check for 56834d13f67618 ===\n');

    console.log('1. Current working directory:');
    let result = await exec('pwd');
    console.log('PWD:', result.stdout?.trim() || 'EMPTY');
    console.log('');

    console.log('2. /home/coder contents:');
    result = await exec('ls -lah /home/coder 2>&1');
    console.log(result.stdout || result.stderr || 'EMPTY');
    console.log('');

    console.log('3. /home/coder/project exists?');
    result = await exec('test -d /home/coder/project && echo "YES" || echo "NO"');
    console.log('Project dir:', result.stdout?.trim());
    console.log('');

    console.log('4. /home/coder/project contents (first 20):');
    result = await exec('ls -lah /home/coder/project 2>&1 | head -20');
    console.log(result.stdout || result.stderr || 'EMPTY');
    console.log('');

    console.log('5. Where are the 29k files?');
    result = await exec('du -sh /home/coder/* 2>&1 | sort -h');
    console.log(result.stdout || result.stderr || 'EMPTY');
    console.log('');

    console.log('6. Check for node_modules:');
    result = await exec('find /home/coder -name "node_modules" -type d 2>&1 | head -5');
    console.log(result.stdout || result.stderr || 'EMPTY');
    console.log('');

    console.log('7. Check install status files:');
    result = await exec('ls -lh /home/coder/install.* 2>&1');
    console.log(result.stdout || result.stderr || 'EMPTY');
    console.log('');

    console.log('8. Running processes:');
    result = await exec('ps aux | grep -E "node|pnpm|npm" | grep -v grep 2>&1');
    console.log(result.stdout || result.stderr || 'EMPTY');
}

detailedCheck().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
