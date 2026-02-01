const axios = require('axios');

async function main() {
    console.log('Finding working VMs...\n');

    const status = await axios.get('http://192.168.0.124:3000/fly/status');
    console.log('Status response keys:', Object.keys(status.data));
    console.log('flyio:', status.data.flyio);
    console.log('activeVMs:', status.data.activeVMs);

    // Try all possible locations
    const vms = status.data.vms || status.data.machines || status.data.flyio?.machines || [];
    console.log(`Total VMs: ${vms.length}`);

    if (vms.length === 0 && status.data.flyio) {
        console.log('\nFull flyio data:', JSON.stringify(status.data.flyio, null, 2));
    }

    if (vms.length > 0) {
        console.log('First VM structure:', JSON.stringify(vms[0], null, 2));
    }

    const running = vms.filter(vm => vm.state === 'running' || vm.status === 'running');
    console.log(`Running VMs: ${running.length}`);

    const workers = running.filter(vm => !vm.isCacheMaster && !vm.is_cache_master);

    console.log(`Found ${workers.length} running worker VMs:`);
    for (const vm of workers) {
        console.log(`  - ${vm.machineId || vm.id || vm.machine_id}`);
    }

    // Test each one
    for (const vm of running.slice(0, 3)) { // Test first 3
        console.log(`\nTesting ${vm.machineId}...`);
        try {
            const health = await axios.get('https://drape-workspaces.fly.dev/health', {
                headers: { 'Fly-Force-Instance-Id': vm.machineId },
                timeout: 3000
            });
            console.log(`  ✅ Healthy! Agent version: ${health.data.agent || 'unknown'}`);

            // This one works, let's use it
            console.log(`\n✅ Using VM: ${vm.machineId}`);
            return vm.machineId;
        } catch (e) {
            console.log(`  ❌ Not responding: ${e.message}`);
        }
    }

    console.log('\n❌ No working VMs found');
}

main().then(workingVM => {
    if (workingVM) {
        console.log(`\nℹ️  Use this VM ID for testing: ${workingVM}`);
    }
}).catch(console.error);
