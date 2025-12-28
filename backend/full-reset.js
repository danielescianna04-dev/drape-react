require('dotenv').config();
const flyService = require('./services/fly-service');

async function fullReset() {
    const vmId = '784975ec43e718';
    console.log(`🔥 FULL RESET - Stopping VM ${vmId}...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Stop the machine
    try {
        console.log('Stopping...');
        await flyService.stopMachine(vmId);
        console.log('✅ VM Stop requested');
    } catch (e) {
        console.log('Stop error (may already be stopped):', e.message);
    }

    // Wait for stop
    await new Promise(r => setTimeout(r, 5000));

    // 2. Destroy the machine
    try {
        console.log('Destroying...');
        await flyService.destroyMachine(vmId);
        console.log('✅ VM Destroyed');
    } catch (e) {
        console.log('Destroy error:', e.message);
    }
}

fullReset();
