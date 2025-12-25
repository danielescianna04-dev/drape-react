require('dotenv').config();
const flyService = require('./services/fly-service');
const axios = require('axios');

async function debugVM() {
    const projectId = 'test-final-a';
    console.log(`🔍 Debugging VM for ${projectId}...`);

    try {
        const machines = await flyService.listMachines();
        const vm = machines.find(m => m.config?.env?.PROJECT_ID === projectId || m.name.includes(projectId));

        if (!vm) {
            console.error('❌ VM not found');
            return;
        }

        console.log(`   Found VM: ${vm.id} (${vm.name}) - ${vm.state}`);
        const agentUrl = `https://${flyService.appName}.fly.dev`;

        // Check 1: Processes
        console.log('\n1. Processes (ps aux):');
        const ps = await flyService.exec(agentUrl, 'ps aux', '/home/coder', vm.id);
        console.log(ps.stdout);

        // Check 2: Curl localhost
        console.log('\n2. Internal Curl (localhost:3000):');
        const curl = await flyService.exec(agentUrl, 'curl -v localhost:3000', '/home/coder', vm.id);
        console.log(curl.stdout);
        console.log(curl.stderr);

        // Check 3: Agent Logs
        console.log('\n3. Agent Log Tail:');
        // Assuming agent logs to stdout which we can't see easily via exec unless redirected.
        // But we can check if react scripts are running.

    } catch (e) {
        console.error(e.message);
    }
}

debugVM();
