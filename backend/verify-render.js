
const axios = require('axios');

const API_URL = 'http://127.0.0.1:3000'; // Force IPv4 to avoid ::1 issues
const PROJECT_ID = 'test-final-a';

async function verifyRender() {
    console.log('👀 Verifying Content Rendering...');

    try {
        console.log(`\n▶️ Creating & Starting Project: ${PROJECT_ID}...`);

        // 1. Create (Empty)
        try {
            await axios.post(`${API_URL}/fly/project/create`, { projectId: PROJECT_ID });
        } catch (e) {
            console.log(`   (Create ignored: ${e.message})`);
        }

        // 2. Start
        await axios.post(`${API_URL}/fly/preview/start`, { projectId: PROJECT_ID });

        // 3. Write index.html (So we have something to serve)
        console.log('   ✍️ Writing index.html...');
        await axios.post(`${API_URL}/fly/project/${PROJECT_ID}/file`, {
            path: 'index.html',
            content: '<h1>Hello Holy Grail</h1><p>Render Verification</p>'
        });

        // 4. Force Reload (Sync files to running VM)
        console.log('   🔄 Syncing to VM...');
        await axios.post(`${API_URL}/fly/reload`, { projectId: PROJECT_ID });

        // 5. Get Cookie
        const statusRes = await axios.get(`${API_URL}/fly/status`);
        const vm = statusRes.data.vms.find(v => v.projectId === PROJECT_ID);
        if (!vm) throw new Error('VM not found');
        const cookieVal = vm.vmId || vm.machineId;
        console.log(`   Target: ${vm.privateIp} (Cookie: ${cookieVal})`);

        // 6. Poll for Content
        console.log('\n⏳ Polling for HTML Content...');
        let attempts = 0;
        while (attempts < 30) {
            attempts++;
            try {
                const res = await axios.get(API_URL, {
                    headers: { Cookie: `drape_vm_id=${cookieVal}` },
                    timeout: 5000
                });

                if (res.status === 200) {
                    const html = res.data;
                    if (html.includes('Hello Holy Grail')) {
                        console.log('✅ Content Verified!');
                        console.log('--- RECEIVED HTML ---');
                        console.log(html);
                        console.log('---------------------');
                        process.exit(0);
                    } else {
                        console.log(`⚠️ 200 OK but content mismatch: ${html.substring(0, 50)}...`);
                    }
                } else {
                    process.stdout.write(`(${res.status})`);
                }
            } catch (e) {
                process.stdout.write('.');
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        console.error('\n❌ Timeout.');
        process.exit(1);

    } catch (error) {
        console.error('\n❌ Verify Failed:', error.message);
        process.exit(1);
    }
}

verifyRender();
