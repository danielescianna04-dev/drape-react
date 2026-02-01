const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const VMS = ['68395d3cd59598', '48e3376f2e4768', '1859d7df129918', '68301eec416238'];

async function checkVM(vmId) {
    console.log(`\nChecking ${vmId}...`);

    try {
        const health = await axios.get(`${AGENT_URL}/health`, {
            headers: { 'Fly-Force-Instance-Id': vmId },
            timeout: 3000
        });
        console.log(`  ✅ Agent UP - ${JSON.stringify(health.data)}`);
        return true;
    } catch (e) {
        console.log(`  ❌ Agent DOWN - ${e.message}`);
        if (e.response) {
            console.log(`     HTTP ${e.response.status}: ${JSON.stringify(e.response.data)}`);
        }
        return false;
    }
}

async function main() {
    console.log('🔍 Checking agent health on all VMs...');

    for (const vm of VMS) {
        await checkVM(vm);
    }
}

main().catch(console.error);
