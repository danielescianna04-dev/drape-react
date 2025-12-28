require('dotenv').config();
const flyService = require('./services/fly-service');

async function listVms() {
    console.log('📋 LISTING ALL VMs...');

    try {
        const machines = await flyService.listMachines();
        console.log(`Found ${machines.length} machines:`);
        machines.forEach(m => {
            console.log(`  - ${m.id}: ${m.name} (${m.state})`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

listVms();
