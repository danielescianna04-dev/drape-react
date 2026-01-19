const flyService = require('./services/fly-service');

// Mock dependencies
require('dotenv').config();
const { initializeApp } = require('firebase-admin/app');
try { initializeApp(); } catch (e) { } // Ignore if already initialized

const MACHINE_ID = '2873e04a36de08';

async function run() {
    console.log(`Reading logs from VM ${MACHINE_ID}...`);

    // 1. Get Agent URL
    const vm = {
        agentUrl: 'https://drape-workspaces.fly.dev',
        machineId: MACHINE_ID
    };

    // 2. Check server.log
    console.log('\n--- Reading /home/coder/server.log ---');
    try {
        const res = await flyService.exec(vm.agentUrl, 'cat /home/coder/server.log', '/home/coder', MACHINE_ID);
        console.log(res.stdout);
        console.log('STDERR:', res.stderr);
    } catch (e) {
        console.log('Failed to read logs:', e.message);
        if (e.response) console.log(e.response.data);
    }
}

run();
