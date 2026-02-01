const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const CACHE_MASTER = '3287d475f96d68';

async function exec(cmd, timeout = 30000) {
    const result = await axios.post(`${AGENT_URL}/exec`, {
        command: cmd,
        cwd: '/home/coder',
        timeout
    }, {
        headers: { 'Fly-Force-Instance-Id': CACHE_MASTER },
        timeout: timeout + 5000
    });
    return result.data;
}

async function getDownloadEndpoint() {
    // Get the full download endpoint implementation
    console.log('Getting full download endpoint code...');
    const result = await exec('sed -n "/app.get.*\\/download/,/^app\\./p" /drape-agent.js | head -100');
    console.log(result.stdout);
}

getDownloadEndpoint().catch(console.error);
