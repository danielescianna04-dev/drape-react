const { executeTool } = require('./routes/agent');
const flyService = require('./services/fly-service');
const { AI_KEYS } = require('./utils/constants');

// Mock flyService.exec to simulate a real VM response
const originalExec = flyService.exec;
flyService.exec = async (url, cmd, cwd, machineId, timeout) => {
    console.log(`🚀 [TEST] Executing: ${cmd}`);

    if (cmd.includes('ls -la')) {
        return {
            exitCode: 0,
            stdout: 'total 8\ndrwxr-xr-x 2 coder coder 4096 Jan 11 12:00 .\ndrwxr-xr-x 3 coder coder 4096 Jan 11 12:00 ..\n-rw-r--r-- 1 coder coder  100 Jan 11 12:00 package.json\n-rw-r--r-- 1 coder coder  500 Jan 11 12:00 App.jsx',
            stderr: ''
        };
    }

    if (cmd.includes('cat') && cmd.includes('package.json')) {
        return {
            exitCode: 0,
            stdout: '{\n  "name": "test-project",\n  "version": "1.0.0"\n}',
            stderr: ''
        };
    }

    return {
        exitCode: 0,
        stdout: 'Command executed successfully',
        stderr: ''
    };
};

async function testTools() {
    console.log('--- STARTING COMPREHENSIVE TOOL TEST ---');

    const mockInput = {
        path: '.',
        machineId: 'mock-machine',
        agentUrl: 'http://mock-agent'
    };

    // Test list_directory
    console.log('\n📁 Testing list_directory...');
    try {
        // We need to bypass some auth/session if we call the route directly,
        // but since we are in the same process we can just call the logic.
        // Actually, executeTool is defined inside a router.post, we might need to export it or test via agent-loop.

        // Since I can't easily call the route's inner function without refactoring,
        // I'll check how agent-loop uses it.
        const { AgentLoop } = require('./services/agent-loop');
        const agent = new AgentLoop('test-project', 'fast');
        agent.vmInfo = { agentUrl: 'http://mock-agent', machineId: 'mock-machine' };

        const lsResult = await agent._executeTool('list_directory', { path: '.' });
        console.log('LS Result:', lsResult.success ? '✅ SUCCESS' : '❌ FAILED');
        if (lsResult.success) console.log('Content preview:', lsResult.content.substring(0, 50) + '...');

        const readResult = await agent._executeTool('read_file', { path: 'package.json' });
        console.log('READ Result:', readResult.success ? '✅ SUCCESS' : '❌ FAILED');
        if (readResult.success) console.log('Content preview:', readResult.content.substring(0, 50) + '...');

    } catch (error) {
        console.error('ERROR during test:', error);
    }

    console.log('\n--- TEST COMPLETE ---');
    // Restore original
    flyService.exec = originalExec;
}

testTools();
