#!/usr/bin/env node

const https = require('https');
const http = require('http');

const API_ENDPOINT = 'https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod';

async function makeRequest(path, method = 'POST', data = null, headers = {}) {
  const url = new URL(API_ENDPOINT + path);
  const client = url.protocol === 'https:' ? https : http;
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 120000 // 2 minuti timeout per comandi pesanti
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: result
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testSmartRouting() {
  console.log('🧪 Testing Smart Routing Logic\n');
  
  try {
    // 1. Create session
    console.log('📝 1. Creating session...');
    const sessionResponse = await makeRequest('/session/create', 'POST', {}, {
      'X-User-ID': 'test-smart-routing-user'
    });
    
    if (sessionResponse.statusCode !== 200) {
      console.error('❌ Session creation failed:', sessionResponse);
      return;
    }
    
    const sessionId = sessionResponse.data.session.sessionId;
    console.log('✅ Session created:', sessionId);
    
    // 2. Test lightweight command (should use Lambda)
    console.log('\n⚡ 2. Testing lightweight command (ls)...');
    const lightResponse = await makeRequest('/command/execute', 'POST', {
      command: 'ls -la'
    }, {
      'X-User-ID': 'test-smart-routing-user',
      'X-Session-ID': sessionId
    });
    
    console.log('📊 Light command response:', {
      statusCode: lightResponse.statusCode,
      executor: lightResponse.data?.executor,
      routing: lightResponse.data?.routing,
      success: lightResponse.data?.success
    });
    
    // 3. Test heavy command - Flutter (should use ECS)
    console.log('\n🚀 3. Testing heavy command (flutter --version)...');
    const heavyResponse = await makeRequest('/command/execute', 'POST', {
      command: 'flutter --version'
    }, {
      'X-User-ID': 'test-smart-routing-user',
      'X-Session-ID': sessionId
    });
    
    console.log('📊 Heavy command response:', {
      statusCode: heavyResponse.statusCode,
      executor: heavyResponse.data?.executor,
      routing: heavyResponse.data?.routing,
      success: heavyResponse.data?.success,
      output: heavyResponse.data?.output?.substring(0, 200) + '...'
    });
    
    // 4. Test another heavy command - Python (should use ECS)
    console.log('\n🐍 4. Testing Python command (python3 --version)...');
    const pythonResponse = await makeRequest('/command/execute', 'POST', {
      command: 'python3 --version'
    }, {
      'X-User-ID': 'test-smart-routing-user',
      'X-Session-ID': sessionId
    });
    
    console.log('📊 Python command response:', {
      statusCode: pythonResponse.statusCode,
      executor: pythonResponse.data?.executor,
      routing: pythonResponse.data?.routing,
      success: pythonResponse.data?.success,
      output: pythonResponse.data?.output
    });
    
    // 5. Summary
    console.log('\n📈 Smart Routing Test Summary:');
    console.log('====================================');
    
    const tests = [
      { name: 'Lightweight (ls)', response: lightResponse, expectedExecutor: 'lambda' },
      { name: 'Heavy (flutter)', response: heavyResponse, expectedExecutor: 'ecs-fargate' },
      { name: 'Heavy (python)', response: pythonResponse, expectedExecutor: 'ecs-fargate' }
    ];
    
    tests.forEach(test => {
      const actualExecutor = test.response.data?.executor;
      const isCorrect = actualExecutor === test.expectedExecutor || 
                       (test.expectedExecutor === 'ecs-fargate' && actualExecutor === 'lambda-fallback');
      
      console.log(`${isCorrect ? '✅' : '❌'} ${test.name}: Expected ${test.expectedExecutor}, got ${actualExecutor}`);
    });
    
    console.log('\n✅ Smart routing test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testSmartRouting();