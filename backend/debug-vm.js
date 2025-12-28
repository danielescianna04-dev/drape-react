require('dotenv').config();
const flyService = require('./services/fly-service');
const axios = require('axios');

async function debugVM() {
    const projectId = 'test-react-mjm1dodj';
    console.log(`🔍 Debugging VM for ${projectId}...`);

    try {
        const machines = await flyService.listMachines();
        // Match by part of name or env config
        const vm = machines.find(m => m.name.includes('ws-' + projectId));

        if (!vm) {
            console.error('❌ VM not found. Available machines:');
            machines.forEach(m => console.log(` - ${m.id} (${m.name}) ${m.state}`));
            return;
        }

        console.log(`   Found VM: ${vm.id} (${vm.name}) - ${vm.state}`);
        const agentUrl = `https://${flyService.appName}.fly.dev`;

        // Check 1: Processes (ps aux)
        console.log('\n1. Processes (ps aux):');
        const ps = await flyService.exec(agentUrl, 'ps aux', '/home/coder', vm.id);
        console.log(ps.stdout);

        // Check 2: Check port 3000 content
        console.log('\n2. Curl localhost:3000 (Head):');
        const curl = await flyService.exec(agentUrl, 'curl -v --max-time 2 localhost:3000', '/home/coder', vm.id);
        console.log(curl.stdout);
        console.log(curl.stderr);

        if (curl.stdout.includes('Connection refused') || curl.stderr.includes('Connection refused')) {
            console.log('\n⚠️ Server not running. Attempting Force Start...');

            // Read package.json to find script
            const pkgRaw = await flyService.exec(agentUrl, 'cat package.json', '/home/coder/project', vm.id);
            let startCmd = 'npm start';
            try {
                const pkg = JSON.parse(pkgRaw.stdout);
                if (pkg.scripts && pkg.scripts.dev) startCmd = 'npm run dev';
                console.log('   Found scripts:', Object.keys(pkg.scripts || {}));
            } catch (e) {
                console.log('   Could not parse package.json, defaulting to npm start');
            }

            console.log(`   Selected Command: ${startCmd}`);
            // Run detached
            const cmd = `nohup ${startCmd} -- --host 0.0.0.0 > /tmp/server.log 2>&1 &`;
            await flyService.exec(agentUrl, cmd, '/home/coder/project', vm.id);
            console.log('   🚀 Triggered force start.');
        }
        /*
        // Patch Agent (Skipped to avoid killing npm install)
        console.log('\n3. Patching Agent for Loading Screen...');
        const fs = require('fs');
        const path = require('path');
        const localPath = path.join(__dirname, 'fly-workspace', 'drape-agent.js');
        const content = fs.readFileSync(localPath, 'base64');

        const writeCmd = `node -e "require('fs').writeFileSync('/home/coder/drape-agent.js', Buffer.from('${content}', 'base64'))"`;
        await flyService.exec(agentUrl, writeCmd, '/home/coder', vm.id);
        console.log('   ✅ Agent file updated.');

        console.log('   🔄 Restarting agent process...');
        const pidCmd = "ps aux | grep 'node /home/coder/drape-agent.js' | grep -v grep | awk '{print $1}'";
        const pidRes = await flyService.exec(agentUrl, pidCmd, '/home/coder', vm.id);
        const pid = pidRes.stdout.trim().split('\n')[0];
        if (pid) {
           await flyService.exec(agentUrl, `kill ${pid}`, '/home/coder', vm.id);
           console.log(`   ✅ Killed PID ${pid}. System should respawn it.`);
        }
        */

    } catch (e) {
        console.error(e.message);
    }
}

debugVM();
