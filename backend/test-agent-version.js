const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const MACHINES = [
    '68397e1fd20628',
    'd8d36e1a019368',
    '56834d13f67618',
    '90804e91c267d8'
];

async function checkAgentVersions() {
    console.log('=== Checking Agent Versions on All VMs ===\n');

    for (const machineId of MACHINES) {
        console.log(`Machine: ${machineId}`);
        try {
            const health = await axios.get(`${AGENT_URL}/health`, {
                headers: { 'Fly-Force-Instance-Id': machineId },
                timeout: 5000
            });
            console.log('  Health:', health.data);

            // Try simple exec
            const execResult = await axios.post(`${AGENT_URL}/exec`, {
                command: '/bin/echo test',
                cwd: '/home/coder'
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Fly-Force-Instance-Id': machineId
                },
                timeout: 5000
            });
            console.log('  Exec test:', execResult.data);

        } catch (error) {
            console.log('  Error:', error.message);
        }
        console.log('');
    }
}

checkAgentVersions();
