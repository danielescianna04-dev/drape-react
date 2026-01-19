/**
 * Debug startup script on the VM
 */
const flyService = require('./services/fly-service');

async function debugStartup() {
    const machineId = 'e7846ed2fde468'; // Current VM from logs
    const agentUrl = `https://drape-workspaces.fly.dev`;

    console.log(`\n🔍 Debugging startup script for VM: ${machineId}\n`);

    try {
        // 1. Check if startup script exists
        console.log('1️⃣ Checking if start-server.sh exists...');
        const checkScript = await flyService.exec(
            agentUrl,
            'ls -lh /home/coder/start-server.sh',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log('Script file:', checkScript.stdout || 'NOT FOUND');

        // 2. Read the script content
        console.log('\n2️⃣ Reading start-server.sh content...');
        const readScript = await flyService.exec(
            agentUrl,
            'cat /home/coder/start-server.sh',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log('Script content:');
        console.log('================================');
        console.log(readScript.stdout);
        console.log('================================');

        // 3. Check server.log
        console.log('\n3️⃣ Checking server.log...');
        const checkLog = await flyService.exec(
            agentUrl,
            'ls -lh /home/coder/project/server.log',
            '/home/coder/project',
            machineId,
            5000,
            true
        );
        console.log('Log file:', checkLog.stdout || 'NOT FOUND');

        // 4. Read server.log content
        console.log('\n4️⃣ Reading server.log content...');
        const readLog = await flyService.exec(
            agentUrl,
            'cat /home/coder/project/server.log 2>&1',
            '/home/coder/project',
            machineId,
            5000,
            true
        );
        console.log('Log content:');
        console.log('================================');
        console.log(readLog.stdout || '(empty)');
        console.log('================================');

        // 5. Check for running processes
        console.log('\n5️⃣ Checking for dev server processes...');
        const psCheck = await flyService.exec(
            agentUrl,
            'ps aux | grep -E "vite|node|npm" | grep -v grep',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log('Processes:');
        console.log(psCheck.stdout || 'No dev server running');

        // 6. Check port 3000
        console.log('\n6️⃣ Checking port 3000...');
        const portCheck = await flyService.exec(
            agentUrl,
            'ss -tln | grep :3000 || netstat -tln | grep :3000 || echo "NOT LISTENING"',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log('Port 3000:', portCheck.stdout);

        // 7. Try running the script manually
        console.log('\n7️⃣ Running start-server.sh manually (foreground, 5s timeout)...');
        const manualRun = await flyService.exec(
            agentUrl,
            'timeout 5s bash /home/coder/start-server.sh 2>&1 || true',
            '/home/coder',
            machineId,
            10000,
            true
        );
        console.log('Manual run output:');
        console.log('================================');
        console.log('STDOUT:', manualRun.stdout);
        console.log('STDERR:', manualRun.stderr);
        console.log('================================');

        // 8. Check package.json start command
        console.log('\n8️⃣ Checking package.json dev script...');
        const pkgJson = await flyService.exec(
            agentUrl,
            'cat /home/coder/project/package.json | jq -r ".scripts.dev"',
            '/home/coder/project',
            machineId,
            5000,
            true
        );
        console.log('Dev command:', pkgJson.stdout);

        // 9. Try running npm run dev directly
        console.log('\n9️⃣ Running npm run dev directly (5s timeout)...');
        const directRun = await flyService.exec(
            agentUrl,
            'cd /home/coder/project && timeout 5s npm run dev 2>&1 || true',
            '/home/coder/project',
            machineId,
            10000,
            true
        );
        console.log('Direct npm run dev:');
        console.log('================================');
        console.log(directRun.stdout);
        console.log('================================');

        // 10. Check if vite binary exists
        console.log('\n🔟 Checking vite binary...');
        const viteCheck = await flyService.exec(
            agentUrl,
            'which vite; ls -l /home/coder/project/node_modules/.bin/vite 2>&1',
            '/home/coder/project',
            machineId,
            5000,
            true
        );
        console.log('Vite binary:', viteCheck.stdout);

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

debugStartup().then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
}).catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
