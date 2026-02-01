const axios = require('axios');

const BACKEND_URL = 'http://192.168.0.124:3000';
const CACHE_MASTER = '3287d475f96d68';
const WORKER_VM = '68395d3cd59598'; // Healthy VM

async function main() {
    console.log('🧪 Testing TIER 3 with buffer upload\n');
    console.log(`Cache Master: ${CACHE_MASTER}`);
    console.log(`Worker VM: ${WORKER_VM}\n`);

    const startTime = Date.now();

    try {
        const response = await axios.post(`${BACKEND_URL}/api/cache-copy`, {
            workerMachineId: WORKER_VM,
            cacheMasterMachineId: CACHE_MASTER
        }, {
            timeout: 120000 // 2 minutes
        });

        const elapsed = Date.now() - startTime;

        if (response.data.success) {
            console.log(`✅ TIER 3 SUCCESS!`);
            console.log(`   Size: ${response.data.finalSizeMB}MB`);
            console.log(`   Time: ${(elapsed / 1000).toFixed(1)}s`);
            console.log(`   Speed: ${(response.data.finalSizeMB / (elapsed / 1000)).toFixed(1)} MB/s`);
            console.log(`\n🎉 TIER 3 IS WORKING! Fix complete.`);
        } else {
            console.log(`❌ Verification failed: ${response.data.message}`);
        }

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`❌ FAILED after ${(elapsed / 1000).toFixed(1)}s`);
        console.log(`   Error: ${error.response?.data?.error || error.message}`);
        console.log(`   Status: ${error.response?.status || 'N/A'}`);
    }
}

main().catch(console.error);
