/**
 * Test different background start methods
 */
const flyService = require('./services/fly-service');

async function testBackgroundStart() {
    const machineId = '148e6d9dbdd768';
    const agentUrl = `https://drape-workspaces.fly.dev`;

    console.log(`\n🧪 Testing background start methods for VM: ${machineId}\n`);

    try {
        // Clean up first
        console.log('0️⃣ Cleaning up...');
        await flyService.exec(agentUrl, 'pkill -9 vite || true', '/home/coder', machineId, 5000, true);
        await flyService.exec(agentUrl, 'rm -f /home/coder/server.log /home/coder/project/server.log', '/home/coder', machineId, 5000, true);
        console.log('   ✅ Cleaned up');

        // Method 1: Current approach (in /home/coder)
        console.log('\n1️⃣ Testing current approach (log in /home/coder)...');
        const cmd1 = `bash -c 'cd /home/coder/project && export PATH="/home/coder/project/node_modules/.bin:$PATH" && nohup npm run dev >> /home/coder/server.log 2>&1 < /dev/null & disown' && sleep 3 && echo "STARTED"`;
        await flyService.exec(agentUrl, cmd1, '/home/coder/project', machineId, 10000, true);

        await new Promise(r => setTimeout(r, 3000));

        const check1 = await flyService.exec(agentUrl, 'ps aux | grep -E "vite|node.*dev" | grep -v grep', '/home/coder', machineId, 5000, true);
        console.log('   Process check:', check1.stdout || 'NOT RUNNING');

        const log1 = await flyService.exec(agentUrl, 'cat /home/coder/server.log 2>&1 || echo "FILE NOT FOUND"', '/home/coder', machineId, 5000, true);
        console.log('   Log file:', log1.stdout.substring(0, 200));

        await flyService.exec(agentUrl, 'pkill -9 vite || true', '/home/coder', machineId, 5000, true);
        await new Promise(r => setTimeout(r, 2000));

        // Method 2: Log in project directory
        console.log('\n2️⃣ Testing with log in project directory...');
        const cmd2 = `bash -c 'cd /home/coder/project && export PATH="$PWD/node_modules/.bin:$PATH" && nohup npm run dev > server.log 2>&1 < /dev/null & disown' && sleep 3 && echo "STARTED"`;
        await flyService.exec(agentUrl, cmd2, '/home/coder/project', machineId, 10000, true);

        await new Promise(r => setTimeout(r, 3000));

        const check2 = await flyService.exec(agentUrl, 'ps aux | grep -E "vite|node.*dev" | grep -v grep', '/home/coder', machineId, 5000, true);
        console.log('   Process check:', check2.stdout || 'NOT RUNNING');

        const log2 = await flyService.exec(agentUrl, 'cat /home/coder/project/server.log 2>&1 || echo "FILE NOT FOUND"', '/home/coder/project', machineId, 5000, true);
        console.log('   Log file:', log2.stdout.substring(0, 200));

        await flyService.exec(agentUrl, 'pkill -9 vite || true', '/home/coder', machineId, 5000, true);
        await new Promise(r => setTimeout(r, 2000));

        // Method 3: Using screen/tmux alternative - simpler approach
        console.log('\n3️⃣ Testing simpler nohup without disown...');
        const cmd3 = `cd /home/coder/project && nohup npm run dev > /tmp/server.log 2>&1 &`;
        await flyService.exec(agentUrl, cmd3, '/home/coder/project', machineId, 10000, true);

        await new Promise(r => setTimeout(r, 3000));

        const check3 = await flyService.exec(agentUrl, 'ps aux | grep -E "vite|node.*dev" | grep -v grep', '/home/coder', machineId, 5000, true);
        console.log('   Process check:', check3.stdout || 'NOT RUNNING');

        const log3 = await flyService.exec(agentUrl, 'cat /tmp/server.log 2>&1 || echo "FILE NOT FOUND"', '/tmp', machineId, 5000, true);
        console.log('   Log file:', log3.stdout.substring(0, 300));

        // Check port
        console.log('\n4️⃣ Checking if port 3000 is listening...');
        const portCheck = await flyService.exec(agentUrl, 'netstat -tln | grep 3000 || ss -tln | grep 3000 || echo "NOT LISTENING"', '/home/coder', machineId, 5000, true);
        console.log('   Port 3000:', portCheck.stdout);

        // Test health check
        console.log('\n5️⃣ Testing health check...');
        const http = require('http');
        try {
            await new Promise((resolve, reject) => {
                const req = http.get(`http://148e6d9dbdd768.vm.drape-workspaces.internal:3000`, {
                    timeout: 5000,
                    headers: { 'Fly-Force-Instance-Id': machineId }
                }, (res) => {
                    console.log('   ✅ HTTP Response:', res.statusCode);
                    resolve();
                });
                req.on('error', (err) => {
                    console.log('   ❌ HTTP Error:', err.message);
                    reject(err);
                });
                req.on('timeout', () => {
                    console.log('   ⏱️ HTTP Timeout');
                    req.destroy();
                    reject(new Error('Timeout'));
                });
            });
        } catch (error) {
            console.log('   Failed:', error.message);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testBackgroundStart().then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
}).catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
