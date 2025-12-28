require('dotenv').config();
const flyService = require('./services/fly-service');

async function getGitRemote() {
    const vmId = '784975ec43e718';
    console.log(`🕵️ GETTING GIT REMOTE on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    try {
        const config = await flyService.exec(agentUrl, 'cat .git/config', '/home/coder/project', vmId);
        console.log(config.stdout);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

getGitRemote();
