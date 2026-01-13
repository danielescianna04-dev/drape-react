const flyService = require('./services/fly-service');

async function cleanup() {
    const machines = await flyService.listMachines();
    const poolVMs = machines.filter(m =>
        m.name.startsWith('ws-pool-') &&
        m.state === 'started'
    );

    console.log(`Found ${poolVMs.length} pool VMs`);

    // Keep only the 2 oldest, destroy the rest
    const sorted = poolVMs.sort((a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
    );

    const toKeep = sorted.slice(0, 2);
    const toDestroy = sorted.slice(2);

    console.log(`Keeping: ${toKeep.map(v => v.id).join(', ')}`);
    console.log(`Destroying: ${toDestroy.map(v => v.id).join(', ')}`);

    for (const vm of toDestroy) {
        try {
            await flyService.destroyMachine(vm.id);
            console.log(`✅ Destroyed ${vm.id}`);
        } catch (e) {
            console.log(`❌ Failed to destroy ${vm.id}: ${e.message}`);
        }
    }
}

cleanup().catch(console.error);
