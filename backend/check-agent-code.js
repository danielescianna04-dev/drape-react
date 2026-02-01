const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const VM_ID = '68395d3cd59598';

async function main() {
    console.log('🔍 Checking agent code on VM...\n');

    // Check if drape-agent.js exists and has /upload endpoint
    const checks = [
        ['Agent file exists', 'ls -lh /home/coder/drape-agent.js'],
        ['Agent version', 'grep "Drape Agent" /home/coder/drape-agent.js | head -1'],
        ['Has /upload endpoint', 'grep -n "pathname === \'/upload\'" /home/coder/drape-agent.js'],
        ['Agent process', 'ps aux | grep drape-agent | grep -v grep']
    ];

    for (const [label, command] of checks) {
        console.log(`${label}:`);
        try {
            const res = await axios.post(`${AGENT_URL}/exec`, {
                command,
                cwd: '/home/coder'
            }, {
                headers: { 'Fly-Force-Instance-Id': VM_ID },
                timeout: 5000
            });

            console.log(`  ${res.data.stdout.trim() || res.data.stderr.trim() || '(no output)'}`);
        } catch (e) {
            console.log(`  ❌ Error: ${e.message}`);
        }
        console.log('');
    }
}

main().catch(console.error);
