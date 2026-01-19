require('dotenv').config();
const axios = require('axios');

const BACKEND_URL = 'http://localhost:3000';
const PROJECT_ID = 'hFy5l3kyhnVvXC5Myo50';

async function runTest() {
    console.log(`🧪 Testing preview for project: ${PROJECT_ID}...`);

    try {
        // Step 1: Establish Session (Auto-starts VM if needed)
        console.log('1️⃣ Establishing Session/Machine ID...');
        const sessionRes = await axios.post(`${BACKEND_URL}/fly/session`, {
            projectId: PROJECT_ID
        }, { timeout: 30000 });

        const machineId = sessionRes.data.machineId;
        console.log(`   ✅ Session established with Machine ID: ${machineId}`);

        // Step 2: START the preview (triggers dev server)
        console.log('2️⃣ Triggering Preview Start (Non-blocking)...');
        axios.post(`${BACKEND_URL}/fly/preview/start`, {
            projectId: PROJECT_ID
        }).catch(err => {
            // Ignore stream disconnect errors
            if (!err.message.includes('timeout')) console.log('   (Start triggered, stream continuing in background)');
        });

        console.log('   🚀 Start triggered\n');



        // Step 3: Poll for App
        console.log('3️⃣ Polling for App Response (via Gateway)...');
        const maxAttempts = 50;
        let attempt = 0;
        let appReady = false;

        while (attempt < maxAttempts && !appReady) {
            attempt++;
            try {
                const res = await axios.get(`${BACKEND_URL}/`, {
                    timeout: 5000,
                    headers: {
                        'Cookie': `drape_vm_id=${machineId}`,
                        'X-Drape-Check': 'true'
                    },
                    validateStatus: () => true
                });

                const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                const status = res.status;

                if (status === 200 && body.includes('<div id="root">')) {
                    console.log(`   ✅ [${attempt}] App is LIVE and showing React Root!`);
                    console.log(`   📄 Body preview: ${body.substring(0, 100).replace(/\n/g, ' ')}...`);
                    appReady = true;
                } else if (body.includes('Installing Dependencies') || body.includes('Starting Server')) {
                    console.log(`   ⏳ [${attempt}] App is still setting up (Loading Screen seen)`);
                } else if (status === 503 || body.includes('Starting workspace')) {
                    console.log(`   ⏳ [${attempt}] VM is booting (503)`);
                } else if (status === 200 && body.length > 200) {
                    console.log(`   ❓ [${attempt}] 200 OK but root not found. Body length: ${body.length}`);
                    // Might be a non-React app or different root ID
                    if (body.includes('<script')) {
                        console.log(`   ✅ [${attempt}] App seems live (contains scripts)!`);
                        appReady = true;
                    }
                } else {
                    console.log(`   🔍 [${attempt}] Status: ${status}, Body length: ${body.length}`);
                }
            } catch (e) {
                console.log(`   ⏳ [${attempt}] Connection error: ${e.message}`);
            }

            if (!appReady) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        if (appReady) {
            console.log('\n🎉 SUCCESS! The preview is verified and working.');
        } else {
            console.log('\n❌ TIMEOUT: The app did not start in time.');
        }

    } catch (e) {
        console.error('❌ Test failed:', e.message);
        if (e.response) console.error('   Details:', e.response.data);
    }
}

runTest();
