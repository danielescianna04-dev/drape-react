const axios = require('axios');

const FLY_API_TOKEN = 'Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhcHAiOiJkcmFwZS13b3Jrc3BhY2VzIiwiZmx5X3Rva2VuX3R5cGUiOiJhcHAiLCJncmFudHMiOlsibWFjaGluZXMiXSwiaWF0IjoxNzM2MjU0OTY0LCJpc3MiOiJGbHkuaW8gQXBwIFRva2VuIn0.SuYtPCbp1scK98MfUDj-8QBTI2lwU7xnJ_KjzwxKM1BmEOlQZt1jCYKgN5sqAaWzr2KkZGMCHQ9XTtLXSUBtAQ';
const AGENT_URL = 'https://drape-workspaces.fly.dev';
const MACHINE_ID = '68397e1fd20628';

async function testCommands() {
    const commands = [
        'ls',
        'ls -1',
        'ls /home/coder',
        'cat /etc/hostname',
        '/bin/echo test',
        'sh -c "echo test"',
        'stat /home/coder/project/node_modules'
    ];

    for (const cmd of commands) {
        console.log(`\nTesting: ${cmd}`);
        console.log('─'.repeat(50));

        try {
            const response = await axios.post(`${AGENT_URL}/exec`, {
                command: cmd,
                machineId: MACHINE_ID
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': FLY_API_TOKEN
                },
                timeout: 5000
            });

            console.log('Exit code:', response.data.exitCode);
            console.log('Stdout:', JSON.stringify(response.data.stdout));
            console.log('Stderr:', JSON.stringify(response.data.stderr));
        } catch (error) {
            console.log('Error:', error.message);
        }
    }
}

testCommands();
