/**
 * Comprehensive React Preview Tester
 * Tests multiple React project configurations to verify preview works
 * 
 * Usage: node test-react-previews.js
 */

require('dotenv').config();
const flyService = require('./services/fly-service');
const { analyzeProjectWithAI } = require('./services/project-analyzer');

// Test repos covering different React configurations
// Using verified repos with package.json in root
const TEST_REPOS = [
    {
        name: 'React + Vite + TailwindCSS',
        url: 'https://github.com/joaopaulomoraes/reactjs-vite-tailwindcss-boilerplate.git',
        expectedType: 'react-vite'
    },
    {
        name: 'React + Vite (simple)',
        url: 'https://github.com/vitejs/vite-plugin-react-swc.git',
        expectedType: 'react-vite'
    }
];

const PREVIEW_URL = 'https://drape-workspaces.fly.dev';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHealthy(url, vmId, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html',
                    'Fly-Force-Instance-Id': vmId  // Route to specific VM
                }
            });

            if (response.status >= 200 && response.status < 400) {
                return { success: true, status: response.status, attempts: i + 1 };
            }
            console.log(`   Attempt ${i + 1}: Status ${response.status}, retrying...`);
        } catch (e) {
            console.log(`   Attempt ${i + 1}: ${e.message}, retrying...`);
        }
        await sleep(2000);
    }
    return { success: false, status: 0, attempts: maxAttempts };
}

async function stopAllVMs() {
    console.log('\n🛑 Stopping all VMs...');
    const machines = await flyService.listMachines();
    for (const machine of machines) {
        if (machine.state === 'started') {
            try {
                await flyService.stopMachine(machine.id);
                console.log(`   ✅ Stopped: ${machine.name}`);
            } catch (e) {
                console.log(`   ⚠️ Failed to stop ${machine.name}: ${e.message}`);
            }
        }
    }
}

async function testRepo(repo) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Testing: ${repo.name}`);
    console.log(`   URL: ${repo.url}`);
    console.log('='.repeat(60));

    const testId = `test-${Date.now().toString(36)}`;
    let vmId = null;

    try {
        // 1. Create fresh VM
        console.log('\n1️⃣ Creating VM...');
        const vm = await flyService.createMachine(testId);  // Pass string, not object
        vmId = vm.id;
        console.log(`   ✅ VM created: ${vmId}`);

        // 2. Wait for VM to be ready
        console.log('\n2️⃣ Waiting for VM to be ready...');
        await sleep(5000);

        // 3. Clone and setup
        console.log('\n3️⃣ Cloning repository...');
        const agentUrl = PREVIEW_URL;

        await flyService.exec(agentUrl, `rm -rf /home/coder/project && git clone ${repo.url} /home/coder/project`, '/home/coder', vmId);
        console.log('   ✅ Cloned');

        // 4. Read package.json to detect type
        console.log('\n4️⃣ Detecting project type...');
        const pkgResult = await flyService.exec(agentUrl, 'cat package.json', '/home/coder/project', vmId);
        const pkg = JSON.parse(pkgResult.stdout);

        const files = ['package.json', 'vite.config.ts', 'vite.config.js', 'next.config.js'];
        const configFiles = { 'package.json': pkgResult.stdout };

        const analysis = await analyzeProjectWithAI(files, configFiles);
        console.log(`   Type: ${analysis?.type || 'unknown'}`);
        console.log(`   Start: ${analysis?.startCommand || 'unknown'}`);

        // 5. Install dependencies
        console.log('\n5️⃣ Installing dependencies...');
        const installCmd = analysis?.installCommand || 'npm install';
        await flyService.exec(agentUrl, installCmd, '/home/coder/project', vmId);
        console.log('   ✅ Dependencies installed');

        // 6. Start server
        console.log('\n6️⃣ Starting dev server...');
        const startCmd = analysis?.startCommand || 'npm run dev -- --host 0.0.0.0 --port 3000';
        await flyService.exec(agentUrl, `nohup ${startCmd} > /home/coder/server.log 2>&1 &`, '/home/coder/project', vmId);
        console.log('   ✅ Server starting...');

        // 7. Health check
        console.log('\n7️⃣ Waiting for server to be healthy...');
        const health = await waitForHealthy(PREVIEW_URL, vmId);

        if (health.success) {
            console.log(`   ✅ HEALTHY in ${health.attempts} attempts (Status: ${health.status})`);

            // 8. Verify content
            console.log('\n8️⃣ Verifying content...');
            const contentResp = await fetch(PREVIEW_URL, {
                headers: { 'Fly-Force-Instance-Id': vmId }
            });
            const html = await contentResp.text();
            const hasRoot = html.includes('id="root"') || html.includes('id="__next"') || html.includes('id="app"');
            const hasTitle = html.includes('<title>');

            console.log(`   Has root element: ${hasRoot ? '✅' : '❌'}`);
            console.log(`   Has title: ${hasTitle ? '✅' : '❌'}`);

            return {
                success: true,
                type: analysis?.type,
                healthAttempts: health.attempts,
                hasRoot,
                hasTitle
            };
        } else {
            console.log(`   ❌ FAILED - Server not healthy after ${health.attempts} attempts`);

            // Get error log
            const logResult = await flyService.exec(agentUrl, 'tail -50 /home/coder/server.log', '/home/coder', vmId);
            console.log('\n   📜 Server log:');
            console.log(logResult.stdout.split('\n').slice(-10).join('\n'));

            return { success: false, type: analysis?.type, error: 'Health check failed' };
        }

    } catch (error) {
        console.error(`\n❌ ERROR: ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        // Always stop VM
        if (vmId) {
            console.log('\n🛑 Stopping VM...');
            try {
                await flyService.stopMachine(vmId);
                console.log('   ✅ VM stopped');
            } catch (e) {
                console.log(`   ⚠️ Failed to stop: ${e.message}`);
            }
        }
    }
}

async function runAllTests() {
    console.log('🧪 COMPREHENSIVE REACT PREVIEW TESTER');
    console.log('=====================================\n');

    // First, stop any existing VMs
    await stopAllVMs();

    const results = [];

    for (const repo of TEST_REPOS) {
        const result = await testRepo(repo);
        results.push({ name: repo.name, ...result });

        // Wait between tests
        await sleep(3000);
    }

    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    for (const result of results) {
        const status = result.success ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} | ${result.name} (${result.type || 'unknown'})`);
        if (result.error) {
            console.log(`         Error: ${result.error}`);
        }
    }

    const passed = results.filter(r => r.success).length;
    console.log(`\n📈 ${passed}/${results.length} tests passed`);

    // Final cleanup
    await stopAllVMs();
}

// Run
runAllTests().catch(console.error);
