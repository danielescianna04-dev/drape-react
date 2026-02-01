const axios = require('axios');

async function main() {
    const res = await axios.get('http://192.168.0.124:3000/fly/vms');
    const vms = res.data.machines || [];

    console.log(`Total VMs: ${vms.length}\n`);

    const running = vms.filter(vm => vm.state === 'running');
    console.log(`Running VMs: ${running.length}`);

    const workers = running.filter(vm => !vm.isCacheMaster);
    console.log(`Worker VMs: ${workers.length}\n`);

    for (const vm of workers.slice(0, 3)) {
        console.log(`Testing ${vm.machineId}...`);
        try {
            const health = await axios.get('https://drape-workspaces.fly.dev/health', {
                headers: { 'Fly-Force-Instance-Id': vm.machineId },
                timeout: 3000
            });
            console.log(`  ✅ Healthy!`);
            return vm.machineId;
        } catch (e) {
            console.log(`  ❌ Down: ${e.message}`);
        }
    }
}

main().then(vm => {
    if (vm) {
        console.log(`\n✅ Use this VM: ${vm}`);
    } else {
        console.log('\n❌ No working VMs');
    }
}).catch(console.error);
