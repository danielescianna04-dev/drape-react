const axios = require('axios');

const BACKEND_URL = 'http://192.168.0.124:3000';
const CACHE_MASTER = '3287d475f96d68';
const WORKER_VM = '68395d3cd59598'; // Running VM with v2.13

async function main() {
    console.log('🧪 Testing TIER 3 with v2.13 agent (stream upload)\n');
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
            console.log(`\n✅ TIER 3 SUCCESS!`);
            console.log(`   Final Size: ${response.data.finalSizeMB}MB`);
            console.log(`   Total Time: ${(elapsed / 1000).toFixed(1)}s`);
            console.log(`   Transfer Speed: ${(response.data.finalSizeMB / (elapsed / 1000)).toFixed(1)} MB/s`);
            console.log(`\n🎉 TIER 3 IS WORKING! Ready to enable in production.`);
        } else {
            console.log(`\n⚠️ Upload completed but verification failed`);
            console.log(`   Message: ${response.data.message}`);
            console.log(`   Final Size: ${response.data.finalSizeMB}MB`);
        }

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`\n❌ TIER 3 FAILED after ${(elapsed / 1000).toFixed(1)}s`);
        console.log(`   Error: ${error.response?.data?.error || error.message}`);
        console.log(`   Status: ${error.response?.status || 'N/A'}`);
    }
}

main().catch(console.error);
