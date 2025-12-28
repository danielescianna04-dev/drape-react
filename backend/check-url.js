require('dotenv').config();
const flyService = require('./services/fly-service');

async function checkUrl() {
    const vmId = '784975ec43e718';
    console.log(`📡 CURL CHECK on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // Check HEAD of src/index.tsx
    console.log('\n--- HEAD /src/index.tsx ---');
    try {
        const head = await flyService.exec(agentUrl, 'curl -I http://localhost:3000/src/index.tsx', '/home/coder', vmId);
        console.log(head.stdout);
    } catch (e) { console.log('Head failed'); }

    // Check BODY of src/index.tsx (first 20 lines)
    console.log('\n--- BODY /src/index.tsx (first 20 lines) ---');
    try {
        const body = await flyService.exec(agentUrl, 'curl -s http://localhost:3000/src/index.tsx | head -n 20', '/home/coder', vmId);
        console.log(body.stdout);
    } catch (e) { console.log('Body failed'); }
}

checkUrl();
