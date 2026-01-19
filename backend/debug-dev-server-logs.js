/**
 * Debug script to check dev server logs
 */
const flyService = require('./services/fly-service');
const axios = require('axios');

async function checkLogs() {
    const machineId = '148e6d9dbdd768';
    const agentUrl = `https://drape-workspaces.fly.dev`;

    console.log(`\n🔍 Checking dev server logs for VM: ${machineId}\n`);

    try {
        // 1. Check if server.log exists
        console.log('1️⃣ Checking if server.log exists...');
        const checkFile = await flyService.exec(
            agentUrl,
            'ls -lh /home/coder/server.log',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log('File info:', checkFile.stdout || 'File not found');
        console.log('Stderr:', checkFile.stderr || 'none');

        // 2. Read last 50 lines of server.log
        console.log('\n2️⃣ Reading last 50 lines of server.log...');
        const logs = await flyService.exec(
            agentUrl,
            'tail -n 50 /home/coder/server.log',
            '/home/coder',
            machineId,
            10000,
            true
        );
        console.log('\n📄 SERVER.LOG CONTENT:');
        console.log('================================');
        console.log(logs.stdout || '(empty)');
        console.log('================================');
        if (logs.stderr) {
            console.log('\n⚠️ STDERR:', logs.stderr);
        }

        // 3. Check if process is running
        console.log('\n3️⃣ Checking for dev server process...');
        const psCheck = await flyService.exec(
            agentUrl,
            'ps aux | grep -E "vite|node|npm" | grep -v grep',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log('Processes:', psCheck.stdout || 'No dev server process found');

        // 4. Check install.log
        console.log('\n4️⃣ Checking install.log...');
        const installLogs = await flyService.exec(
            agentUrl,
            'tail -n 30 /home/coder/install.log',
            '/home/coder',
            machineId,
            10000,
            true
        );
        console.log('\n📄 INSTALL.LOG CONTENT:');
        console.log('================================');
        console.log(installLogs.stdout || '(empty)');
        console.log('================================');

        // 5. Check package.json
        console.log('\n5️⃣ Checking package.json scripts...');
        const packageJson = await flyService.exec(
            agentUrl,
            'cat /home/coder/project/package.json | grep -A 10 "scripts"',
            '/home/coder/project',
            machineId,
            5000,
            true
        );
        console.log('Scripts:', packageJson.stdout);

        // 6. Try to start manually
        console.log('\n6️⃣ Attempting manual start (foreground, 10s timeout)...');
        const manualStart = await flyService.exec(
            agentUrl,
            'cd /home/coder/project && timeout 10s npm run dev || true',
            '/home/coder/project',
            machineId,
            15000,
            true
        );
        console.log('\n📄 MANUAL START OUTPUT:');
        console.log('================================');
        console.log('STDOUT:', manualStart.stdout);
        console.log('STDERR:', manualStart.stderr);
        console.log('================================');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

checkLogs().then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
}).catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
