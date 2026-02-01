const axios = require('axios');
const fs = require('fs');

const WORKER_VM = '68301eec416238';
const AGENT_URL = 'https://drape-workspaces.fly.dev';
const AGENT_FILE = '/Users/getmad/Projects/drape-react/backend/fly-workspace/drape-agent.js';

async function exec(command) {
    const res = await axios.post(`${AGENT_URL}/exec`, {
        command,
        cwd: '/home/coder'
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM },
        timeout: 10000
    });
    return res.data;
}

async function uploadAgent() {
    console.log('📤 Uploading agent code...');
    const content = fs.readFileSync(AGENT_FILE, 'utf8');

    await axios.post(`${AGENT_URL}/file`, {
        path: '/home/coder/drape-agent.js',
        content,
        isBinary: false
    }, {
        headers: { 'Fly-Force-Instance-Id': WORKER_VM }
    });

    console.log('   ✅ Uploaded');
}

async function restartAgent() {
    console.log('🔄 Restarting agent...');

    // Find agent process
    const psResult = await exec('pgrep -f drape-agent.js');
    const pid = psResult.stdout.trim();

    if (pid) {
        console.log(`   Found PID: ${pid}`);
        // Kill and let systemd/supervisor restart it
        await exec(`kill ${pid}`);
        console.log('   ✅ Killed process (should auto-restart)');
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s for restart
    } else {
        console.log('   ⚠️ No running agent found, starting manually...');
        // Start agent in background
        exec('cd /home/coder && nohup node drape-agent.js > /dev/null 2>&1 &');
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function testUpload() {
    console.log('🧪 Testing upload endpoint...');

    try {
        const testData = Buffer.from('test content');
        const res = await axios.post(
            `${AGENT_URL}/upload?path=/home/coder/test-upload&extract=false`,
            testData,
            {
                headers: {
                    'Fly-Force-Instance-Id': WORKER_VM,
                    'Content-Type': 'application/gzip'
                },
                timeout: 10000
            }
        );

        console.log('   ✅ Upload test passed!');
        console.log('   Response:', res.data);
        return true;
    } catch (error) {
        console.log('   ❌ Upload test failed:', error.response?.data || error.message);

        // Check agent logs
        console.log('\n📋 Agent logs:');
        const logs = await exec('tail -30 /home/coder/drape-agent.log 2>/dev/null || echo "No log file"');
        console.log(logs.stdout);

        return false;
    }
}

async function main() {
    try {
        console.log('🚀 Deploying updated agent to', WORKER_VM);
        console.log('='.repeat(50));

        await uploadAgent();
        await restartAgent();
        await testUpload();

        console.log('\n✅ Deploy and test complete!');
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        process.exit(1);
    }
}

main();
