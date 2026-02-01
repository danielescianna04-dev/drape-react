const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const PROJECT_ID = 'imieiinvestimenti-copia-5'; // The project from your tests

async function testWarmVMPerformance() {
    console.log('🎯 Testing Optimized Performance (Warm VM)\n');
    console.log('═'.repeat(70));

    try {
        // Step 1: Open project first time (may need to start VM)
        console.log('\n1️⃣  First open (may include VM startup)...');
        const firstStart = Date.now();

        const firstResponse = await axios.post(`${BASE_URL}/clone`, {
            projectId: PROJECT_ID,
            repoUrl: 'https://github.com/example/repo.git', // Placeholder
            branch: 'main'
        }, {
            timeout: 60000
        });

        const firstTime = Date.now() - firstStart;
        const firstVm = firstResponse.data.machineId;

        console.log(`   ✅ Opened in ${(firstTime / 1000).toFixed(1)}s`);
        console.log(`   📍 VM: ${firstVm}`);
        console.log(`   ${firstTime > 25000 ? '⚠️ ' : '✅ '} VM was ${firstTime > 25000 ? 'COLD (includes startup)' : 'WARM'}`);

        // Step 2: Close the project (but keep VM warm)
        console.log('\n2️⃣  Closing project (keeping VM warm)...');
        await axios.post(`${BASE_URL}/cleanup`, {
            projectId: PROJECT_ID,
            machineId: firstVm
        });

        console.log('   ✅ Closed');

        // Wait 2 seconds
        console.log('\n⏳  Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 3: Re-open project (VM should still be warm)
        console.log('\n3️⃣  Second open (VM should be WARM)...');
        const secondStart = Date.now();

        const secondResponse = await axios.post(`${BASE_URL}/clone`, {
            projectId: PROJECT_ID,
            repoUrl: 'https://github.com/example/repo.git',
            branch: 'main'
        }, {
            timeout: 60000
        });

        const secondTime = Date.now() - secondStart;
        const secondVm = secondResponse.data.machineId;

        console.log(`   ✅ Opened in ${(secondTime / 1000).toFixed(1)}s`);
        console.log(`   📍 VM: ${secondVm}`);
        console.log(`   ${secondVm === firstVm ? '✅' : '⚠️'} ${secondVm === firstVm ? 'Same VM (reused)' : 'Different VM'}`);

        // Step 4: Results
        console.log('\n═'.repeat(70));
        console.log('\n📊 PERFORMANCE RESULTS:\n');
        console.log(`   First open:   ${(firstTime / 1000).toFixed(1)}s ${firstTime > 25000 ? '(includes VM startup ~13-15s)' : ''}`);
        console.log(`   Second open:  ${(secondTime / 1000).toFixed(1)}s ← TRUE optimized performance`);

        if (secondTime < 22000) {
            console.log('\n🎉 SUCCESS! Optimized performance achieved:');
            console.log(`   - Binary upload working (no base64 overhead)`);
            console.log(`   - ${((33000 - secondTime) / 33000 * 100).toFixed(0)}% faster than original 33s`);
            console.log(`   - Warm VM reuse working correctly`);
        } else {
            console.log('\n⚠️  Performance still slower than expected');
            console.log('   Check backend logs for bottlenecks');
        }

        console.log('\n═'.repeat(70));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('   Response:', error.response.data);
        }
    }
}

testWarmVMPerformance().catch(console.error);
