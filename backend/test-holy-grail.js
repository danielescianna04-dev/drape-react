require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'drape-mobile-ide',
        storageBucket: 'drape-mobile-ide.appspot.com'
    });
    console.log('🔥 Firebase Admin initialized');
}

const WorkspaceOrchestrator = require('./services/workspace-orchestrator');
const projectId = '1CQJLqrbklYjpDHpJKlJ';

async function test() {
    console.log('🚀 Starting Holy Grail test for:', projectId);
    try {
        const res = await WorkspaceOrchestrator.startPreview(projectId, { type: 'nextjs', port: 3000 }, (step, msg) => {
            console.log(`   [${step}] ${msg}`);
        });
        console.log('✅ Preview started successfully!');
        console.log('   Preview URL:', res.previewUrl);
        console.log('   Machine ID:', res.machineId);
        console.log('   Is Holy Grail:', res.isHolyGrail);

        process.exit(0);
    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exit(1);
    }
}

test();
