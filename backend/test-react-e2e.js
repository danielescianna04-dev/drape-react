/**
 * End-to-End React Test
 * Tests the full flow: Create Project -> Start Preview -> Verify Loading -> Wait for App
 */

require('dotenv').config();
const axios = require('axios');

const BACKEND_URL = 'http://localhost:3000';
// Using a simple Vite React starter (works with Node 20)
const REPO_URL = 'https://github.com/joaopaulomoraes/reactjs-vite-tailwindcss-boilerplate.git';

async function runTest() {
    console.log('🧪 Starting React E2E Test...');
    console.log(`   Repo: ${REPO_URL}\n`);

    try {
        // Step 1: Create Project
        // Generate a unique project ID
        const projectId = 'test-react-' + Date.now().toString(36);

        console.log('1️⃣ Creating Project...');
        const createRes = await axios.post(`${BACKEND_URL}/fly/project/create`, {
            projectId,
            repositoryUrl: REPO_URL
        }, { timeout: 60000 });

        console.log(`   ✅ Project created: ${projectId}`);
        console.log(`   📁 Files: ${createRes.data.filesCount}\n`);

        // Step 2: Start Preview
        console.log('2️⃣ Starting Preview...');
        const startTime = Date.now();
        const previewRes = await axios.post(`${BACKEND_URL}/fly/preview/start`, {
            projectId
        }, { timeout: 120000 }); // Increased timeout for file sync + setup

        const elapsed = Date.now() - startTime;
        console.log(`   ✅ Preview started in ${elapsed}ms`);
        console.log(`   🔗 Machine ID: ${previewRes.data.machineId}`);
        console.log(`   📍 Preview URL: ${previewRes.data.previewUrl}\n`);

        // Step 3: Set Session Cookie
        console.log('3️⃣ Setting Session...');
        await axios.post(`${BACKEND_URL}/fly/session`, {
            projectId,
            machineId: previewRes.data.machineId
        });
        console.log(`   ✅ Session set\n`);

        // Step 4: Poll for App (expect loading screen first, then app)
        console.log('4️⃣ Polling for App Response...');
        const maxAttempts = 60; // 2 minutes
        let attempt = 0;
        let sawLoading = false;
        let appReady = false;

        while (attempt < maxAttempts && !appReady) {
            attempt++;
            try {
                const res = await axios.get(`${BACKEND_URL}/`, {
                    timeout: 5000,
                    headers: {
                        'Cookie': `drape_vm_id=${previewRes.data.machineId}`
                    },
                    validateStatus: () => true // Don't throw on non-2xx
                });

                const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

                if (body.includes('Installing Dependencies') || body.includes('Server Starting')) {
                    if (!sawLoading) {
                        console.log(`   🔄 [${attempt}] Loading screen detected! Good.`);
                        sawLoading = true;
                    }
                } else if (res.status === 200 && body.length > 500 && !body.includes('error')) {
                    // Likely the actual app (React apps have long HTML)
                    console.log(`   ✅ [${attempt}] App is live! (${body.length} bytes)`);
                    appReady = true;
                } else if (res.status >= 500) {
                    console.log(`   ⏳ [${attempt}] Status ${res.status}, waiting...`);
                } else {
                    console.log(`   🔍 [${attempt}] Status ${res.status}, body length: ${body.length}`);
                }
            } catch (e) {
                console.log(`   ⏳ [${attempt}] Error: ${e.message}`);
            }

            if (!appReady) {
                await new Promise(r => setTimeout(r, 2000)); // Wait 2s between polls
            }
        }

        // Summary
        console.log('\n📊 Test Summary:');
        console.log(`   Loading Screen Seen: ${sawLoading ? '✅ Yes' : '❌ No'}`);
        console.log(`   App Ready: ${appReady ? '✅ Yes' : '❌ No (timeout)'}`);
        console.log(`   Total Time: ~${attempt * 2}s`);

        if (sawLoading && appReady) {
            console.log('\n🎉 SUCCESS! React flow works end-to-end.');
        } else if (sawLoading && !appReady) {
            console.log('\n⚠️ PARTIAL SUCCESS: Loading screen works, but app did not start in time.');
        } else {
            console.log('\n❌ FAILURE: Something is broken.');
        }

    } catch (e) {
        console.error('❌ Test failed:', e.message);
        if (e.response) {
            console.error('   Response:', e.response.data);
        }
    }
}

runTest();
