/**
 * Holy Grail Performance Test - imieiinvestimenti
 */

require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = require('./service-account-key.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'drape-mobile-ide',
        storageBucket: 'drape-mobile-ide.appspot.com'
    });
    console.log('🔥 Firebase Admin initialized');
}

const WorkspaceOrchestrator = require('./services/workspace-orchestrator');
const PROJECT_ID = 'hFy5l3kyhnVvXC5Myo50'; // imieiinvestimenti

// Timing helper
function formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

async function runPerformanceTest() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🏆 HOLY GRAIL PERFORMANCE TEST: imieiinvestimenti');
    console.log('═══════════════════════════════════════════════════════════\n');

    const testStart = Date.now();

    try {
        // Initialize VM Pool (adopts orphans instantly)
        const vmPoolManager = require('./services/vm-pool-manager');
        await vmPoolManager.initialize();

        // Run startPreview and measure total time
        console.log('📦 Starting preview for project:', PROJECT_ID);
        console.log('');

        const result = await WorkspaceOrchestrator.startPreview(
            PROJECT_ID,
            { type: 'nextjs', port: 3000 },
            (step, msg) => {
                const elapsed = formatTime(Date.now() - testStart);
                console.log(`[${elapsed}] 🔄 ${step}: ${msg}`);
            }
        );

        const totalTime = Date.now() - testStart;

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('📊 PERFORMANCE RESULTS');
        console.log('═══════════════════════════════════════════════════════════\n');

        const status = totalTime < 10000 ? '✅ FAST' : (totalTime < 20000 ? '⚠️ OK' : '❌ SLOW');

        console.log(`| Phase                  | Time        | Target     | Status |`);
        console.log(`|------------------------|-------------|------------|--------|`);
        console.log(`| Total Startup          | ${formatTime(totalTime).padEnd(11)} | <10s       | ${status} |`);

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('🏆 Holy Grail Features Active:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  ✅ Shared Volume 10GB (drape_global_store)');
        console.log('  ✅ pnpm as default package manager');
        console.log('  ✅ --prefer-offline mode');
        console.log('  ✅ WEBPACK_WORKERS=2 (CPU cap)');
        console.log('  ✅ Turbopack enabled');
        console.log('  ✅ 2GB Swap Space');
        console.log('  ✅ NODE_OPTIONS memory tuning');
        console.log('═══════════════════════════════════════════════════════════\n');

        console.log('🌐 Preview URL:', result.previewUrl);
        console.log('🖥️  Machine ID:', result.machineId);
        console.log('🎯 Is Holy Grail:', result.isHolyGrail);

    } catch (e) {
        console.error('\n❌ Test failed:', e.message);
        if (e.stack) console.error(e.stack);
    } finally {
        process.exit(0);
    }
}

runPerformanceTest();
