
const axios = require('axios');

const API_URL = 'http://localhost:3000';
const USER_A_PROJECT = 'test-final-a';
const USER_B_PROJECT = 'test-final-b';

async function runTest() {
    console.log('🧪 Starting Final Verification Suite...');

    try {
        // 1. Create User A Project
        console.log(`\n▶️ Creating Project A: ${USER_A_PROJECT}...`);
        await axios.post(`${API_URL}/fly/project/create`, {
            projectId: USER_A_PROJECT,
            framework: 'react'
        });
        // Trigger start (Provisions VM)
        console.log('   Starting VM A...');
        await axios.post(`${API_URL}/fly/preview/start`, { projectId: USER_A_PROJECT });
        console.log(`✅ Project A Started`);

        // 2. Create User B Project
        console.log(`\n▶️ Creating Project B: ${USER_B_PROJECT}...`);
        await axios.post(`${API_URL}/fly/project/create`, {
            projectId: USER_B_PROJECT,
            framework: 'react'
        });
        // Trigger start (Provisions VM)
        console.log('   Starting VM B...');
        await axios.post(`${API_URL}/fly/preview/start`, { projectId: USER_B_PROJECT });
        console.log(`✅ Project B Started`);

        // 3. Verify Multi-Tenancy (Both machines should be active)
        console.log(`\n▶️ Verifying active machines status...`);
        // Wait 2 seconds for creation propagation if needed
        await new Promise(r => setTimeout(r, 2000));

        const statusRes = await axios.get(`${API_URL}/fly/status`);
        const vmsList = statusRes.data.vms || [];

        console.log(`   Active VMs Count: ${statusRes.data.activeVMs}`);
        console.log(`   VM List IDs:`, vmsList.map(v => v.vmId));

        const vmA = vmsList.find(v => v.projectId === USER_A_PROJECT);
        const vmB = vmsList.find(v => v.projectId === USER_B_PROJECT);

        if (vmA && vmB) {
            console.log(`✅ Multi-Tenancy CONFIRMED: Both projects are active.`);
            console.log(`   A: ${vmA.vmId}`);
            console.log(`   B: ${vmB.vmId}`);
        } else {
            console.error(`❌ Multi-Tenancy FAILED. Active VMs List:`, vmsList);
            // Check process exit at end
        }

        if (vmA) {
            // 4. Verify Gateway Routing (User A)
            console.log(`\n▶️ Verifying Gateway Routing (Project A)...`);
            try {
                // We use vmId (which is machineId) for the cookie
                const cookieVal = vmA.vmId || vmA.machineId;
                console.log(`   Testing Cookie: drape_vm_id=${cookieVal}`);

                const gatewayResA = await axios.get(API_URL, {
                    headers: {
                        Cookie: `drape_vm_id=${cookieVal}`
                    },
                    validateStatus: () => true // Accept all status codes to inspect them
                });

                // Should get proxied response (or app error 502/503 but NOT 404 Gateway Error)
                console.log(`✅ Gateway A Request Status: ${gatewayResA.status}`);

                if (gatewayResA.data && typeof gatewayResA.data === 'string' && gatewayResA.data.includes('Running 404')) {
                    console.error('❌ FATAL: Gateway returned 404 - Routing failed.');
                    process.exit(1);
                } else {
                    console.log('✅ Gateway routed successfully (did not show Gateway 404).');
                }

            } catch (e) {
                console.error(`❌ Gateway Verification Error:`, e.message);
            }
        }

        if (!vmA || !vmB) {
            process.exit(1);
        }

        console.log('\n🎉 ALL TESTS COMPLETED.');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test Suite Failed:', error.message);
        if (error.response) console.error(error.response.data);
        process.exit(1);
    }
}

runTest();
