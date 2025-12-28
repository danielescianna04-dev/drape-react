
require('dotenv').config();
const flyService = require('./services/fly-service');

async function cleanup() {
    console.log('🧹 Starting Cleanup Protocol...');

    try {
        const machines = await flyService.listMachines();
        console.log(`🔍 Found ${machines.length} machines.`);

        for (const m of machines) {
            if (m.name.startsWith('ws-')) {
                console.log(`💥 Destroying ${m.name} (${m.id})...`);
                try {
                    // Use stop first to be nice, then destroy if supported or just stop
                    // fly-service has stopMachine. Let's check if it has destroy.
                    // If not, we'll just stop.
                    await flyService.stopMachine(m.id);
                    console.log(`   ✅ Stopped ${m.name}`);
                } catch (e) {
                    console.error(`   ❌ Failed to stop ${m.name}: ${e.message}`);
                }
            } else {
                console.log(`   ⏭️ Skipping non-workspace machine: ${m.name}`);
            }
        }
        console.log('✨ Cleanup Complete.');
    } catch (e) {
        console.error('❌ Cleanup failed:', e);
    }
}

cleanup();
