const axios = require('axios');
const EventSource = (require('eventsource').EventSource || require('eventsource'));

const BACKEND_URL = 'http://localhost:3000';
const PROJECT_ID = 'hFy5l3kyhnVvXC5Myo50';

async function runTest() {
    console.log(`\n🧪 FULL PREVIEW TEST: ${PROJECT_ID}\n`);

    try {
        // 1. Establish session
        console.log('1️⃣ Establishing Session...');
        const sessionRes = await axios.post(`${BACKEND_URL}/fly/session`, { projectId: PROJECT_ID });
        const machineId = sessionRes.data.machineId;
        console.log(`   ✅ Machine ID: ${machineId}\n`);

        // 2. Start Preview via SSE
        console.log('2️⃣ Starting Preview (via SSE)...');
        return new Promise((resolve) => {
            const es = new EventSource(`${BACKEND_URL}/fly/preview/start?projectId=${PROJECT_ID}`);
            let isAppLive = false;

            es.onmessage = async (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'step') {
                    console.log(`   [STEP] ${data.label || data.step}: ${data.message || ''}`);
                } else if (data.type === 'ready') {
                    console.log(`\n   ✅ PREVIEW READY! URL: ${data.previewUrl}`);
                    es.close();

                    // 3. Verify content
                    console.log('\n3️⃣ Verifying Content...');
                    try {
                        const res = await axios.get(`${BACKEND_URL}/`, {
                            headers: { 'Cookie': `drape_vm_id=${machineId}` },
                            timeout: 10000
                        });
                        const body = res.data;
                        if (body.includes('<div id="root">') || body.includes('<div id="__next">') || body.includes('<main')) {
                            console.log('   🎉 SUCCESS! The app is actually showing content.');
                            console.log(`   📄 Length: ${body.length} bytes`);
                        } else {
                            console.log('   ⚠️ App is live but could not find expected root element.');
                            console.log('   📄 Preview:', body.substring(0, 500));
                        }
                    } catch (e) {
                        console.log(`   ❌ Failed to verify content: ${e.message}`);
                    }
                    resolve();
                } else if (data.error) {
                    console.log(`\n   ❌ ERROR: ${data.error}`);
                    es.close();
                    resolve();
                }
            };

            es.onerror = (err) => {
                console.log(`\n   ⚠️ SSE Connection error (this might be normal at end of stream)`);
                es.close();
                resolve();
            };

            // Timeout safety
            setTimeout(() => {
                console.log('\n   ❌ TIMEOUT: Preview did not finish in 10 minutes.');
                es.close();
                resolve();
            }, 600000);
        });

    } catch (e) {
        console.error('❌ Test failed:', e.message);
    }
}

runTest();
