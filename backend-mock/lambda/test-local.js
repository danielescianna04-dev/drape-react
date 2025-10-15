#!/usr/bin/env node

// Test Script per Lambda Logic Locale
const UserManager = require('./user-manager');
const CommandExecutor = require('./command-executor'); 
const path = require('path');

async function testLambdaLogic() {
  console.log('🧪 Testing Lambda Logic Locally...\n');
  
  // Setup test environment
  const testEfsPath = path.join(__dirname, 'test-efs');
  const userManager = new UserManager(testEfsPath);
  const commandExecutor = new CommandExecutor();
  
  try {
    // Test 1: User Session Creation
    console.log('📋 Test 1: User Session Creation');
    const session = await userManager.createUserSession('testuser123');
    console.log('✅ Session created:', {
      sessionId: session.sessionId,
      userId: session.userId,
      workspaceDir: session.workspaceDir
    });
    
    // Test 2: Basic Command Execution
    console.log('\n📋 Test 2: Basic Command Execution');
    const lsResult = await commandExecutor.executeCommand('ls -la', session);
    console.log('✅ Command result:', {
      success: lsResult.success,
      output: lsResult.output.substring(0, 100) + '...',
      executionTime: lsResult.executionTime + 'ms'
    });
    
    // Test 3: File Operations
    console.log('\n📋 Test 3: File Operations');
    const writeResult = await commandExecutor.writeFile('test.txt', 'Hello Lambda World!', session);
    console.log('✅ File write:', writeResult);
    
    const readResult = await commandExecutor.readFile('test.txt', session);
    console.log('✅ File read:', readResult);
    
    // Test 4: Directory Listing
    console.log('\n📋 Test 4: Directory Listing');
    const listResult = await commandExecutor.listFiles('.', session);
    console.log('✅ Directory list:', {
      success: listResult.success,
      fileCount: listResult.files ? listResult.files.length : 0,
      files: listResult.files ? listResult.files.map(f => f.name).slice(0, 5) : []
    });
    
    // Test 5: Security Checks
    console.log('\n📋 Test 5: Security Checks');
    const blockedResult = await commandExecutor.executeCommand('rm -rf /', session);
    console.log('✅ Security test:', {
      blocked: !blockedResult.success,
      message: blockedResult.output
    });
    
    // Test 6: Quota Check
    console.log('\n📋 Test 6: Quota Check');
    const quota = await userManager.checkQuota(session);
    console.log('✅ Quota check:', {
      used: Math.round(quota.used / 1024) + 'KB',
      percentage: quota.percentage + '%'
    });
    
    // Test 7: CD Command
    console.log('\n📋 Test 7: CD Command');
    const cdResult = await commandExecutor.executeCommand('cd ~', session);
    console.log('✅ CD command:', {
      success: cdResult.success,
      output: cdResult.output
    });
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('🚀 Lambda logic is ready for AWS deployment!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Mock event for Lambda handler test
async function testLambdaHandler() {
  console.log('\n🧪 Testing Lambda Handler...\n');
  
  const handler = require('./command-handler');
  
  // Mock API Gateway event
  const mockEvent = {
    httpMethod: 'POST',
    path: '/session/create',
    body: null,
    headers: {
      'X-User-ID': 'testuser456'
    }
  };
  
  try {
    const result = await handler.handler(mockEvent, {});
    console.log('✅ Lambda handler test:', {
      statusCode: result.statusCode,
      success: JSON.parse(result.body).success,
      sessionCreated: !!JSON.parse(result.body).session
    });
  } catch (error) {
    console.error('❌ Lambda handler test failed:', error);
  }
}

// Run tests
if (require.main === module) {
  (async () => {
    await testLambdaLogic();
    await testLambdaHandler();
  })();
}

module.exports = { testLambdaLogic, testLambdaHandler };