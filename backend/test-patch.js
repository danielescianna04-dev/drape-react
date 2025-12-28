require('dotenv').config();
const flyService = require('./services/fly-service');
const { analyzeProjectWithAI } = require('./services/project-analyzer');

// Test the patching by simulating what happens when a Vite project is detected
async function testPatch() {
    console.log('🧪 TESTING VITE AUTO-PATCH FEATURE...\n');

    // 1. Simulate a package.json with React + Vite
    const mockPackageJson = JSON.stringify({
        dependencies: { react: "^18.0.0" },
        devDependencies: { vite: "^5.0.0" },
        scripts: { dev: "vite" }
    });

    // 2. Call the analyzer
    const result = await analyzeProjectWithAI(
        ['package.json', 'vite.config.ts', 'src/index.tsx'],
        { 'package.json': mockPackageJson }
    );

    console.log('📋 Analysis Result:');
    console.log(JSON.stringify(result, null, 2));

    // 3. Verify the startCommand contains the patch logic
    console.log('\n🔍 Checking startCommand...');
    if (result.startCommand.includes('allowedHosts')) {
        console.log('✅ startCommand includes allowedHosts patch!');
    } else {
        console.log('❌ startCommand does NOT include allowedHosts patch!');
    }

    if (result.startCommand.includes('drape-workspaces.fly.dev')) {
        console.log('✅ Patch uses correct host domain!');
    } else {
        console.log('❌ Patch does NOT use correct domain!');
    }

    console.log('\n📝 Full startCommand:');
    console.log(result.startCommand);
}

testPatch();
