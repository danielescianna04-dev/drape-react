require('dotenv').config();
const flyService = require('./services/fly-service');

async function switchPreview() {
    const vmId = '784975ec43e718';
    console.log(`🏭 SWITCHING TO PREVIEW (BUILD) on VM ${vmId} ...`);
    const agentUrl = `https://${flyService.appName}.fly.dev`;

    // 1. Kill old dev server
    try {
        await flyService.exec(agentUrl, 'pkill -f vite', '/home/coder', vmId);
        await flyService.exec(agentUrl, 'pkill -f npm', '/home/coder', vmId);
    } catch (e) { }

    // 2. Build
    console.log('Building...');
    // This might take time.
    const build = await flyService.exec(agentUrl, 'npm run build', '/home/coder/project', vmId);
    console.log('Build Output:', build.stdout);

    // 3. Start Preview
    console.log('Starting Preview Server...');
    // Preview usually listens on 4173 by default, we force 3000
    // And ensure allowedHosts is set? Preview might not check allowedHosts securely?
    // Vite Preview docs say: "The preview command starts a minimal static web server."
    // It might be simpler.

    // Check if we need to adjust vite.config.ts for preview?
    // Usually it respects server config but let's try.

    // Note: npm run preview -> vite preview
    const cmd = 'nohup npm run preview -- --host 0.0.0.0 --port 3000 > /home/coder/preview.log 2>&1 &';
    await flyService.exec(agentUrl, cmd, '/home/coder/project', vmId);

    await new Promise(r => setTimeout(r, 2000));

    // 4. Check Log
    const log = await flyService.exec(agentUrl, 'tail -n 20 /home/coder/preview.log', '/home/coder', vmId);
    console.log('\n--- Preview Log ---');
    console.log(log.stdout);
}

switchPreview();
