const axios = require('axios');

const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
const FLY_API_URL = 'https://api.machines.dev/v1';
const APP_NAME = 'drape-workspaces';

// VMs with broken agents
const BROKEN_VMS = [
    '68397e1fd20628',
    'd8d36e1a019368',
    '90804e91c267d8'
];

async function destroyVM(machineId) {
    try {
        console.log(`🗑️  Destroying VM ${machineId}...`);
        await axios.delete(
            `${FLY_API_URL}/apps/${APP_NAME}/machines/${machineId}?force=true`,
            {
                headers: {
                    'Authorization': `Bearer ${FLY_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`   ✅ Destroyed`);
        return true;
    } catch (error) {
        console.log(`   ❌ Failed: ${error.response?.data?.error || error.message}`);
        return false;
    }
}

async function main() {
    if (!FLY_API_TOKEN) {
        console.error('❌ FLY_API_TOKEN environment variable not set!');
        console.error('   Run: export FLY_API_TOKEN="your-token"');
        process.exit(1);
    }

    console.log('=== Destroying Broken VMs ===\n');
    console.log(`Will destroy ${BROKEN_VMS.length} VMs with broken agents\n`);

    for (const machineId of BROKEN_VMS) {
        await destroyVM(machineId);
        // Wait a bit between deletions
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n✅ Done! The VM pool will create fresh VMs with working agents.');
    console.log('   Restart the backend to trigger VM pool initialization.');
}

main().catch(console.error);
