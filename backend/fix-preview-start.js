/**
 * Fix preview start by using a dedicated startup script
 */
const flyService = require('./services/fly-service');

async function fixPreviewStart() {
    const machineId = '148e6d9dbdd768';
    const agentUrl = `https://drape-workspaces.fly.dev`;

    console.log(`\n🔧 Fixing preview start for VM: ${machineId}\n`);

    try {
        // 1. Kill any existing dev server
        console.log('1️⃣ Killing any existing dev server...');
        await flyService.exec(agentUrl, 'pkill -9 vite || pkill -9 node || true', '/home/coder', machineId, 5000, true);
        await new Promise(r => setTimeout(r, 2000));

        // 2. Create startup script
        console.log('2️⃣ Creating startup script...');
        const startupScript = `#!/bin/bash
cd /home/coder/project || exit 1
export PATH="/home/coder/project/node_modules/.bin:$PATH"

# Kill any existing process on port 3000
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

# Start dev server (npm run dev)
npm run dev > /home/coder/project/server.log 2>&1 &

echo "Dev server started with PID $!"
`;

        const createScript = `cat > /home/coder/start-server.sh << 'EOFSCRIPT'
${startupScript}
EOFSCRIPT
chmod +x /home/coder/start-server.sh`;

        await flyService.exec(agentUrl, createScript, '/home/coder', machineId, 5000, true);
        console.log('   ✅ Startup script created');

        // 3. Run the startup script in background using nohup
        console.log('\n3️⃣ Starting dev server using script...');
        const startCmd = 'nohup /home/coder/start-server.sh > /tmp/startup.log 2>&1 &';
        await flyService.exec(agentUrl, startCmd, '/home/coder', machineId, 5000, true);

        console.log('   ⏳ Waiting 5 seconds for startup...');
        await new Promise(r => setTimeout(r, 5000));

        // 4. Check if process is running
        console.log('\n4️⃣ Checking if dev server is running...');
        const psCheck = await flyService.exec(agentUrl, 'ps aux | grep -E "vite|node.*dev" | grep -v grep', '/home/coder', machineId, 5000, true);
        console.log('   Processes:', psCheck.stdout || 'NOT RUNNING ❌');

        // 5. Check logs
        console.log('\n5️⃣ Checking server logs...');
        const logs = await flyService.exec(agentUrl, 'tail -20 /home/coder/project/server.log', '/home/coder/project', machineId, 5000, true);
        console.log('   Server logs:');
        console.log('   ================================');
        console.log(logs.stdout || '(empty)');
        console.log('   ================================');

        // 6. Check port
        console.log('\n6️⃣ Checking if port 3000 is listening...');
        const portCheck = await flyService.exec(agentUrl, 'ss -tln | grep 3000 || netstat -tln | grep 3000 || lsof -i:3000 || echo "NOT LISTENING"', '/home/coder', machineId, 5000, true);
        console.log('   Port 3000:', portCheck.stdout);

        // 7. Try HTTP request
        console.log('\n7️⃣ Testing HTTP connection...');
        const axios = require('axios');
        try {
            const response = await axios.get(agentUrl, {
                timeout: 5000,
                headers: { 'Fly-Force-Instance-Id': machineId },
                validateStatus: () => true
            });
            console.log('   ✅ HTTP Response:', response.status);
            if (response.status >= 200 && response.status < 400) {
                console.log('\n🎉 SUCCESS! Dev server is running and responding!');
            } else {
                console.log('\n⚠️ Server responded but with status:', response.status);
            }
        } catch (error) {
            console.log('   ❌ HTTP Error:', error.message);

            // Try internal URL
            console.log('\n   Trying internal URL...');
            try {
                const internalUrl = `http://148e6d9dbdd768.vm.drape-workspaces.internal:3000`;
                const curlCheck = await flyService.exec(agentUrl, `curl -v ${internalUrl} 2>&1 | head -20`, '/home/coder', machineId, 10000, true);
                console.log('   Curl output:', curlCheck.stdout);
            } catch (e) {
                console.log('   Curl failed:', e.message);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

fixPreviewStart().then(() => {
    console.log('\n✅ Fix complete');
    process.exit(0);
}).catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
