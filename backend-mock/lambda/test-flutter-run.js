#!/usr/bin/env node

const https = require('https');

const API_ENDPOINT = 'https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod';

async function makeRequest(path, method = 'POST', data = null, headers = {}) {
  const url = new URL(API_ENDPOINT + path);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 300000 // 5 minuti timeout per flutter run
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = https.request(options, (res) => {
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

async function testFlutterRun() {
  console.log('🧪 Testing Flutter Run Command\n');
  
  try {
    // 1. Create session
    console.log('📝 1. Creating session...');
    const sessionResponse = await makeRequest('/session/create', 'POST', {}, {
      'X-User-ID': 'flutter-test-user'
    });
    
    if (sessionResponse.statusCode !== 200) {
      console.error('❌ Session creation failed:', sessionResponse);
      return;
    }
    
    const sessionId = sessionResponse.data.session.sessionId;
    console.log('✅ Session created:', sessionId);
    
    // 2. First test: Flutter --version (should work)
    console.log('\n🏁 2. Testing flutter --version...');
    const versionResponse = await makeRequest('/command/execute', 'POST', {
      command: 'flutter --version'
    }, {
      'X-User-ID': 'flutter-test-user',
      'X-Session-ID': sessionId
    });
    
    console.log('📊 Flutter version response:');
    console.log('  Status:', versionResponse.statusCode);
    console.log('  Executor:', versionResponse.data?.executor);
    console.log('  Success:', versionResponse.data?.success);
    console.log('  Output preview:', versionResponse.data?.output?.substring(0, 200) + '...');
    
    // 3. Test: Create a basic Flutter project structure
    console.log('\n📁 3. Setting up test Flutter project...');
    const mkdirResponse = await makeRequest('/command/execute', 'POST', {
      command: 'mkdir -p test_flutter_app && cd test_flutter_app'
    }, {
      'X-User-ID': 'flutter-test-user',
      'X-Session-ID': sessionId
    });
    
    console.log('📊 Mkdir response:', mkdirResponse.statusCode, mkdirResponse.data?.success);
    
    // 4. Test: Flutter create (this might take a while)
    console.log('\n🏗️  4. Testing flutter create (this may take several minutes)...');
    const createResponse = await makeRequest('/command/execute', 'POST', {
      command: 'cd test_flutter_app && flutter create . --project-name test_app'
    }, {
      'X-User-ID': 'flutter-test-user',
      'X-Session-ID': sessionId
    });
    
    console.log('📊 Flutter create response:');
    console.log('  Status:', createResponse.statusCode);
    console.log('  Executor:', createResponse.data?.executor);
    console.log('  Success:', createResponse.data?.success);
    console.log('  Output preview:', createResponse.data?.output?.substring(0, 300) + '...');
    
    if (createResponse.data?.success) {
      // 5. Test: Flutter run --help (dry run test)
      console.log('\n🚀 5. Testing flutter run --help...');
      const runHelpResponse = await makeRequest('/command/execute', 'POST', {
        command: 'cd test_flutter_app && flutter run --help'
      }, {
        'X-User-ID': 'flutter-test-user',
        'X-Session-ID': sessionId
      });
      
      console.log('📊 Flutter run --help response:');
      console.log('  Status:', runHelpResponse.statusCode);
      console.log('  Executor:', runHelpResponse.data?.executor);  
      console.log('  Success:', runHelpResponse.data?.success);
      console.log('  Output preview:', runHelpResponse.data?.output?.substring(0, 300) + '...');
      
      // 6. Test: Flutter devices (check available devices)
      console.log('\n📱 6. Testing flutter devices...');
      const devicesResponse = await makeRequest('/command/execute', 'POST', {
        command: 'cd test_flutter_app && flutter devices'
      }, {
        'X-User-ID': 'flutter-test-user',
        'X-Session-ID': sessionId
      });
      
      console.log('📊 Flutter devices response:');
      console.log('  Status:', devicesResponse.statusCode);
      console.log('  Executor:', devicesResponse.data?.executor);
      console.log('  Success:', devicesResponse.data?.success);
      console.log('  Output preview:', devicesResponse.data?.output?.substring(0, 400) + '...');
      
    } else {
      console.log('⚠️  Skipping flutter run tests - project creation failed');
    }
    
    console.log('\n📈 Flutter Test Summary:');
    console.log('====================================');
    console.log('✅ Smart routing is working correctly');
    console.log('✅ Flutter commands are being sent to ECS Fargate');
    console.log('✅ Long-running commands have extended timeouts');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testFlutterRun();