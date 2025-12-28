require('dotenv').config();
const flyService = require('./services/fly-service');

const KEEP_VM = 'e82970dc0d2e68'; // The fresh fixed one

async function stopOtherVms() {
    console.log(`🔥 STOPPING ALL VMs EXCEPT ${KEEP_VM}...`);

    try {
        const machines = await flyService.listMachines();
        console.log(`Found ${machines.length} machines`);

        for (const m of machines) {
            if (m.id === KEEP_VM) {
                console.log(`  ✅ KEEPING: ${m.id} (${m.name})`);
                continue;
            }
            if (m.state === 'stopped') {
                console.log(`  ⏸️ Already stopped: ${m.id}`);
                continue;
            }

            console.log(`  🛑 Stopping: ${m.id} (${m.name})...`);
            try {
                await flyService.stopMachine(m.id);
                console.log(`     ✅ Stopped`);
            } catch (e) {
                console.log(`     ❌ Error: ${e.message}`);
            }
        }

        console.log('\n✅ Done!');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

stopOtherVms();
