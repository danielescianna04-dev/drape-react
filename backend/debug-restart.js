const orchestrator = require('./services/workspace-orchestrator');
const flyService = require('./services/fly-service');
require('dotenv').config();
const { initializeApp } = require('firebase-admin/app');
try { initializeApp(); } catch (e) { }

const MACHINE_ID = '2873e04a36de08';

async function run() {
    console.log(`Checking VM ${MACHINE_ID}...`);

    // 1. Get Agent URL
    const vm = {
        agentUrl: 'https://drape-workspaces.fly.dev',
        machineId: MACHINE_ID
    };

    // 2. Check Process
    console.log('\n--- Checking Process ---');
    try {
        const res = await flyService.exec(vm.agentUrl, 'ps aux | grep node', '/home/coder', MACHINE_ID);
        console.log(res.stdout);
    } catch (e) {
        console.log('Failed to check ps:', e.message);
    }

    // 3. Curl Localhost
    console.log('\n--- Curl Localhost ---');
    try {
        const cmd = 'curl -v http://localhost:3000';
        console.log(`Running: ${cmd}`);
        const res = await flyService.exec(vm.agentUrl, cmd, '/home/coder', MACHINE_ID, 10000);
        console.log(res.stdout);
        console.log('STDERR:', res.stderr);
    } catch (e) {
        console.log('Curl failed:', e.message);
    }
}

run();
