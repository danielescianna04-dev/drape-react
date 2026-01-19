/**
 * Check VM filesystem structure
 */
const flyService = require('./services/fly-service');

async function checkFilesystem() {
    const machineId = 'e7846ed2fde468';
    const agentUrl = `https://drape-workspaces.fly.dev`;

    console.log(`\n🗂️  Checking filesystem for VM: ${machineId}\n`);

    try {
        // 1. List /home/coder
        console.log('1️⃣ Files in /home/coder:');
        const homeList = await flyService.exec(
            agentUrl,
            'ls -lha /home/coder/',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log(homeList.stdout);

        // 2. List /home/coder/project
        console.log('\n2️⃣ Files in /home/coder/project:');
        const projectList = await flyService.exec(
            agentUrl,
            'ls -lha /home/coder/project/',
            '/home/coder/project',
            machineId,
            5000,
            true
        );
        console.log(projectList.stdout);

        // 3. Find all package.json files
        console.log('\n3️⃣ Finding all package.json files:');
        const findPkg = await flyService.exec(
            agentUrl,
            'find /home/coder -name "package.json" 2>/dev/null',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log(findPkg.stdout || 'None found');

        // 4. Check current vite process working directory
        console.log('\n4️⃣ Vite process details:');
        const viteProc = await flyService.exec(
            agentUrl,
            'ps aux | grep vite | grep -v grep; pwdx $(pgrep -f vite | head -1) 2>&1',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log(viteProc.stdout);

        // 5. Check what's listening on ports
        console.log('\n5️⃣ Listening ports:');
        const ports = await flyService.exec(
            agentUrl,
            'ss -tlnp 2>&1 | grep LISTEN || netstat -tlnp 2>&1 | grep LISTEN',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log(ports.stdout);

        // 6. Read vite output from all possible locations
        console.log('\n6️⃣ Checking all log locations:');
        const logLocations = [
            '/home/coder/server.log',
            '/home/coder/project/server.log',
            '/tmp/server.log',
            '/tmp/startup.log'
        ];

        for (const logPath of logLocations) {
            const log = await flyService.exec(
                agentUrl,
                `if [ -f ${logPath} ]; then echo "=== ${logPath} ==="; cat ${logPath}; else echo "${logPath}: NOT FOUND"; fi`,
                '/home/coder',
                machineId,
                5000,
                true
            );
            console.log(log.stdout);
        }

        // 7. Check vite stderr/stdout from process
        console.log('\n7️⃣ Checking recent system logs for vite:');
        const viteLogs = await flyService.exec(
            agentUrl,
            'dmesg 2>&1 | tail -20 || journalctl -n 20 2>&1 || echo "No system logs available"',
            '/home/coder',
            machineId,
            5000,
            true
        );
        console.log(viteLogs.stdout);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkFilesystem().then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
}).catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
