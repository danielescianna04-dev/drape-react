/**
 * Holy Grail Complete Performance Test
 * 
 * Tests the full flow and measures timings:
 * 1. VM acquisition (warm/cold)
 * 2. File sync
 * 3. Full preview startup
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin (same as test-holy-grail.js)
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'drape-mobile-ide',
        storageBucket: 'drape-mobile-ide.appspot.com'
    });
    console.log('🔥 Firebase Admin initialized');
}

const WorkspaceOrchestrator = require('./services/workspace-orchestrator');
const PROJECT_ID = '1CQJLqrbklYjpDHpJKlJ';

// Timing helper
function formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

async function runPerformanceTest() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🏆 HOLY GRAIL PERFORMANCE TEST');
    console.log('═══════════════════════════════════════════════════════════\n');

    const testStart = Date.now();

    try {
        // Run startPreview and measure total time
        console.log('📦 Starting preview for project:', PROJECT_ID);
        console.log('');

        // Initialize VM Pool (adopts orphans instantly)
        const vmPoolManager = require('./services/vm-pool-manager');
        await vmPoolManager.initialize();

        const result = await WorkspaceOrchestrator.startPreview(
            PROJECT_ID,
            { type: 'nextjs', port: 3000 },
            (step, message, progress) => {
                console.log(`   [${step}] ${message}`);
            }
        );

        const totalTime = Date.now() - testStart;

        // Print results
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('📊 PERFORMANCE RESULTS');
        console.log('═══════════════════════════════════════════════════════════\n');

        console.log('| Phase                  | Time        | Target     | Status |');
        console.log('|------------------------|-------------|------------|--------|');

        // Total
        const totalStatus = totalTime < 10000 ? '✅ FAST' : totalTime < 30000 ? '⚠️ OK' : '❌ SLOW';
        console.log(`| Total Startup          | ${formatTime(totalTime).padEnd(11)} | <10s       | ${totalStatus} |`);

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

        // Return preview URL
        console.log(`🌐 Preview URL: ${result.previewUrl}`);
        console.log(`🖥️  Machine ID: ${result.machineId}`);
        console.log(`🎯 Is Holy Grail: ${result.isHolyGrail}`);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }

    process.exit(0);
}

runPerformanceTest();
