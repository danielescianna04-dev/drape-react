
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

// Initialize Firebase Admin BEFORE requiring services
if (admin.apps.length === 0) {
    const serviceAccount = require('./service-account-key.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase initialized');
}

const { AgentLoop } = require('./services/agent-loop');
const workspaceOrchestrator = require('./services/workspace-orchestrator');

async function testRealAgentRun() {
    const projectId = 'test-nextjs-002';
    console.log(`🚀 Starting real Agent test for project: ${projectId}`);

    try {
        const agent = new AgentLoop(projectId, 'fast', 'gemini-1.5-flash');

        console.log('⏳ Initializing agent...');
        await agent.initialize();
        console.log('✅ Agent initialized.');
        console.log(`📦 VM Info:`, agent.vmInfo);

        const prompt = "List files in the current directory.";
        console.log(`\n💬 Prompt: "${prompt}"`);

        for await (const event of agent.run(prompt)) {
            if (event.type === 'thinking') {
                process.stdout.write('🤔 ');
            } else if (event.type === 'tool_start') {
                console.log(`\n🛠️ Tool: ${event.tool}`);
            } else if (event.type === 'tool_result') {
                console.log(`✅ Result: ${JSON.stringify(event.result).substring(0, 100)}...`);
            } else if (event.type === 'complete') {
                console.log(`\n🏁 COMPLETE: ${event.summary}`);
                break;
            } else if (event.type === 'error') {
                console.error(`\n❌ Error:`, event.error);
            }
        }
    } catch (e) {
        console.error('\n❌ Test failed:', e);
    }
}

testRealAgentRun();
