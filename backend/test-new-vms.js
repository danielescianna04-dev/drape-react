const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const NEW_VMS = [
    'e2861545b69ed8',
    '3d8de96df91d08',
    '781972df561e58',
    '4d8921e0c0ed08'
];

async function testVM(machineId) {
    console.log(`Testing VM: ${machineId}`);
    try {
        // Test health
        const health = await axios.get(`${AGENT_URL}/health`, {
            headers: { 'Fly-Force-Instance-Id': machineId },
            timeout: 5000
        });
        console.log('  Health: OK');

        // Test exec
        const execResult = await axios.post(`${AGENT_URL}/exec`, {
            command: '/bin/echo "Agent working!"',
            cwd: '/home/coder'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Fly-Force-Instance-Id': machineId
            },
            timeout: 5000
        });
        console.log(`  Exec: ${execResult.data.exitCode === 0 ? '✅ WORKING' : '❌ FAILED'}`);
        if (execResult.data.stdout) {
            console.log(`  Output: ${execResult.data.stdout.trim()}`);
        }
    } catch (error) {
        console.log(`  Error: ${error.message}`);
    }
    console.log('');
}

async function main() {
    console.log('=== Testing New VMs ===\n');
    for (const vm of NEW_VMS) {
        await testVM(vm);
    }
}

main();
