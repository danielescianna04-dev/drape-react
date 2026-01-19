require('dotenv').config();
const flyService = require('./services/fly-service');

async function purgeAll() {
    console.log('🧹 Purging all machines...');
    const machines = await flyService.listMachines();
    console.log(`Found ${machines.length} machines`);

    for (const m of machines) {
        if (m.name.startsWith('ws-')) {
            console.log(`🗑️ Destroying ${m.name} (${m.id})...`);
            try {
                await flyService.destroyMachine(m.id);
                console.log(`   ✅ Destroyed`);
            } catch (e) {
                console.error(`   ❌ Failed: ${e.message}`);
            }
        }
    }
    console.log('✅ Purge complete');
}

purgeAll();
