const axios = require('axios');

const BACKEND_URL = 'http://192.168.0.124:3000';
const CACHE_MASTER = '3287d475f96d68'; // From logs
// Try different worker VMs (excluding the one we crashed)
const WORKER_VMS = ['68395d3cd59598', '48e3376f2e4768', '1859d7df129918'];

async function testCacheCopy(workerVM) {
    console.log(`\n🧪 Testing cache copy to ${workerVM}...`);
    const startTime = Date.now();

    try {
        const response = await axios.post(`${BACKEND_URL}/api/cache-copy`, {
            workerMachineId: workerVM,
            cacheMasterMachineId: CACHE_MASTER
        }, {
            timeout: 120000 // 2 minutes
        });

        const elapsed = Date.now() - startTime;

        if (response.data.success) {
            console.log(`✅ SUCCESS!`);
            console.log(`   Size: ${response.data.finalSizeMB}MB`);
            console.log(`   Time: ${(elapsed / 1000).toFixed(1)}s`);
            console.log(`   Speed: ${(response.data.finalSizeMB / (elapsed / 1000)).toFixed(1)} MB/s`);
            return true;
        } else {
            console.log(`❌ Verification failed: ${response.data.message}`);
            return false;
        }

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`❌ FAILED after ${(elapsed / 1000).toFixed(1)}s`);
        console.log(`   Error: ${error.response?.data?.error || error.message}`);
        console.log(`   Status: ${error.response?.status || 'N/A'}`);
        return false;
    }
}

async function main() {
    console.log('🔧 Testing TIER 3 Cache Copy with Transfer-Encoding fix\n');
    console.log('Cache Master:', CACHE_MASTER);
    console.log('Worker VMs to test:', WORKER_VMS.join(', '));

    for (const workerVM of WORKER_VMS) {
        const success = await testCacheCopy(workerVM);
        if (success) {
            console.log(`\n✅ TIER 3 IS WORKING! Fix successful.`);
            break;
        }
        console.log('\nTrying next VM...');
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s between attempts
    }
}

main().catch(console.error);
