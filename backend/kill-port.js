require('dotenv').config();
const flyService = require('./services/fly-service');

async function killPort3000() {
    const vmId = '784975ec43e718';
    console.log(`💀 HUNTING ZOMBIE on Port 3000 (VM ${vmId}) ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Try fuser (most direct)
    try {
        console.log('Trying fuser...');
        const fuser = await flyService.exec(agentUrl, 'fuser -k 3000/tcp', '/home/coder', vmId);
        console.log('fuser result:', fuser.stdout);
    } catch (e) { console.log('fuser not found or failed'); }

    // 2. Try lsof (alternative)
    try {
        console.log('Trying lsof...');
        // -t: terse (PIDs only), -i: inet
        const lsof = await flyService.exec(agentUrl, 'lsof -t -i:3000', '/home/coder', vmId);
        const pids = lsof.stdout.trim().split('\n');
        if (pids.length > 0 && pids[0] !== '') {
            console.log('Found PIDs via lsof:', pids);
            for (const pid of pids) {
                await flyService.exec(agentUrl, `kill -9 ${pid}`, '/home/coder', vmId);
                console.log(`Killed ${pid}`);
            }
        }
    } catch (e) { console.log('lsof not found or failed'); }

    // 3. Fallback: Kill ALL 'vite' and 'npm' processes again, checking ps aux
    console.log('Checking ps aux...');
    const ps = await flyService.exec(agentUrl, 'ps aux', '/home/coder', vmId);
    console.log(ps.stdout);

    // Manual kill based on ps output logic would be hard to script robustly in one go without parsing.
    // But pkill -f should have worked unless the process name is weird.
    // Let's rely on the user to see the output if fuser/lsof fail.

    // 4. Start Server Again (aiming for 3000)
    console.log('Starting server (hoping for 3000)...');
    const cmd = 'nohup npm run dev -- --host 0.0.0.0 --port 3000 > /home/coder/server.log 2>&1 &';
    await flyService.exec(agentUrl, cmd, '/home/coder/project', vmId);

    await new Promise(r => setTimeout(r, 3000));
    const log = await flyService.exec(agentUrl, 'tail -n 20 /home/coder/server.log', '/home/coder', vmId);
    console.log('\n--- New Server Log ---');
    console.log(log.stdout);
}

killPort3000();
