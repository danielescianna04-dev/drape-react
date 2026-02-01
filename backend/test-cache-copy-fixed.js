const axios = require('axios');

const BACKEND_URL = 'http://192.168.0.124:3000';
const CACHE_MASTER = '3287d475f96d68'; // From logs

async function main() {
    console.log('🧪 Testing TIER 3 Cache Copy with fix...\n');

    // Find any running worker VM
    console.log('1. Getting VM pool status...');
    const vmPoolStatus = await axios.post(`${BACKEND_URL}/fly/inspect`, {});
    const pool = vmPoolStatus.data;

    console.log(`   Pool: ${pool.poolSize} total, ${pool.runningVMs?.length || 0} running`);

    const runningWorkers = (pool.runningVMs || []).filter(vm => !vm.isCacheMaster);

    if (runningWorkers.length === 0) {
        console.log('\n❌ No running worker VMs available for testing');
        return;
    }

    const workerVM = runningWorkers[0];
    console.log(`   Using worker: ${workerVM.machineId}`);

    // Test cache copy
    console.log('\n2. Testing cache copy...');
    const startTime = Date.now();

    try {
        const response = await axios.post(`${BACKEND_URL}/api/cache-copy`, {
            workerMachineId: workerVM.machineId,
            cacheMasterMachineId: CACHE_MASTER
        }, {
            timeout: 120000 // 2 minutes
        });

        const elapsed = Date.now() - startTime;

        if (response.data.success) {
            console.log(`\n✅ Cache copy SUCCESS!`);
            console.log(`   Size: ${response.data.finalSizeMB}MB`);
            console.log(`   Time: ${(elapsed / 1000).toFixed(1)}s`);
            console.log(`   Speed: ${(response.data.finalSizeMB / (elapsed / 1000)).toFixed(1)} MB/s`);
        } else {
            console.log(`\n❌ Cache copy completed but verification failed`);
            console.log(`   Message: ${response.data.message}`);
        }

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`\n❌ Cache copy FAILED after ${(elapsed / 1000).toFixed(1)}s`);
        console.log(`   Error: ${error.response?.data?.error || error.message}`);

        if (error.response?.status) {
            console.log(`   HTTP Status: ${error.response.status}`);
        }
    }
}

main().catch(console.error);
