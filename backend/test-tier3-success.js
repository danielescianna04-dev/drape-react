const axios = require('axios');

const BACKEND_URL = 'http://192.168.0.124:3000';
const CACHE_MASTER = '3287d475f96d68';
const WORKER_VM = '48e3376f2e4768'; // Different VM

async function main() {
    console.log('🎯 Final TIER 3 Test (Direct VM-to-VM Transfer)\n');
    console.log(`Cache Master: ${CACHE_MASTER}`);
    console.log(`Worker VM: ${WORKER_VM}\n`);

    const startTime = Date.now();

    try {
        const response = await axios.post(`${BACKEND_URL}/api/cache-copy`, {
            workerMachineId: WORKER_VM,
            cacheMasterMachineId: CACHE_MASTER
        }, {
            timeout: 180000 // 3 minutes
        });

        const elapsed = Date.now() - startTime;

        if (response.data.success) {
            console.log(`\n✅ TIER 3 SUCCESS!`);
            console.log(`   Final Size: ${response.data.finalSizeMB}MB`);
            console.log(`   Total Time: ${(response.data.elapsed / 1000).toFixed(1)}s`);
            console.log(`   Transfer Speed: ${(response.data.finalSizeMB / (response.data.elapsed / 1000)).toFixed(1)} MB/s`);
            console.log(`\n🎉 TIER 3 IS WORKING!`);
            console.log(`   vs TIER 2.5 (Google Cloud): ~65s`);
            console.log(`   IMPROVEMENT: ${((65 / (response.data.elapsed / 1000) - 1) * 100).toFixed(0)}% faster!`);
        } else {
            console.log(`\n⚠️ Verification failed`);
            console.log(`   Message: ${response.data.message}`);
        }

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`\n❌ FAILED after ${(elapsed / 1000).toFixed(1)}s`);
        console.log(`   Error: ${error.response?.data?.error || error.message}`);
    }
}

main().catch(console.error);
