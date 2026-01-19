const flyService = require('./services/fly-service');
require('dotenv').config();
const { initializeApp } = require('firebase-admin/app');
try { initializeApp(); } catch (e) { }

const MACHINE_ID = '2873e04a36de08';

async function run() {
    console.log(`Reading agent code from VM ${MACHINE_ID}...`);

    // 1. Get Agent URL
    const vm = {
        agentUrl: 'https://drape-workspaces.fly.dev',
        machineId: MACHINE_ID
    };

    // 2. Cat drape-agent.js
    console.log('\n--- Reading /home/coder/drape-agent.js (300-350) ---');
    try {
        const res = await flyService.exec(vm.agentUrl, 'sed -n "300,350p" /home/coder/drape-agent.js', '/home/coder', MACHINE_ID);
        console.log(res.stdout);
    } catch (e) {
        console.log('Failed to read agent:', e.message);
    }
}

run();
