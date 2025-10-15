/**
 * Flutter Web Helper - Functions to help with Flutter web development
 */

const https = require('https');
const http = require('http');

/**
 * Execute Flutter web start on ECS
 * 
 * @param {Object} session - The user session object
 * @param {Object} options - Options for the request
 * @param {string} options.repository - Optional repository name/URL
 * @param {string} options.workingDir - Optional working directory
 * @param {string} ecsEndpoint - The ECS endpoint URL
 * @returns {Promise<Object>} - The response from the server
 */
async function executeFlutterWebStart(session, options = {}, ecsEndpoint) {
  console.log('🔍 DEBUG executeFlutterWebStart: Starting Flutter web app');
  console.log('🔍 DEBUG executeFlutterWebStart: ECS_ENDPOINT:', ecsEndpoint);
  console.log('🔍 DEBUG executeFlutterWebStart: Session:', JSON.stringify(session, null, 2));
  console.log('🔍 DEBUG executeFlutterWebStart: Options:', JSON.stringify(options, null, 2));
  
  if (!ecsEndpoint) {
    console.error('❌ DEBUG executeFlutterWebStart: ECS endpoint not configured');
    throw new Error('ECS endpoint not configured');
  }
  
  // Determine working directory
  let ecsWorkspaceDir = '/tmp/flutter_project';
  if (options.workingDir) {
    ecsWorkspaceDir = options.workingDir;
  } else if (options.repository) {
    // Create a repository-specific directory
    ecsWorkspaceDir = `/tmp/projects/${options.repository.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }
  console.log('🔍 DEBUG executeFlutterWebStart: Using ecsWorkspaceDir:', ecsWorkspaceDir);
  
  const payload = {
    workingDir: ecsWorkspaceDir,
    repository: options.repository || "flutter-app"
  };
  console.log('🔍 DEBUG executeFlutterWebStart: Request payload:', JSON.stringify(payload, null, 2));
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    console.log('🔍 DEBUG executeFlutterWebStart: PostData:', postData);
    
    const url = new URL(ecsEndpoint + '/flutter/web/start');
    console.log('🔍 DEBUG executeFlutterWebStart: Full URL:', url.toString());
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30 * 60 * 1000 // 30 minutes timeout
    };
    console.log('🔍 DEBUG executeFlutterWebStart: Request options:', JSON.stringify(requestOptions, null, 2));
    
    const client = url.protocol === 'https:' ? https : http;
    console.log('🔍 DEBUG executeFlutterWebStart: Using client:', url.protocol === 'https:' ? 'HTTPS' : 'HTTP');
    
    const req = client.request(requestOptions, (res) => {
      console.log('🔍 DEBUG executeFlutterWebStart: Response received');
      console.log('🔍 DEBUG executeFlutterWebStart: Response status:', res.statusCode);
      console.log('🔍 DEBUG executeFlutterWebStart: Response headers:', JSON.stringify(res.headers, null, 2));
      
      let data = '';
      
      res.on('data', (chunk) => {
        console.log('🔍 DEBUG executeFlutterWebStart: Received chunk length:', chunk.length);
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('🔍 DEBUG executeFlutterWebStart: Response complete');
        console.log('🔍 DEBUG executeFlutterWebStart: Raw response data:', data);
        
        try {
          const result = JSON.parse(data);
          console.log('🔍 DEBUG executeFlutterWebStart: Parsed result:', JSON.stringify(result, null, 2));
          resolve(result);
        } catch (parseError) {
          console.error('❌ DEBUG executeFlutterWebStart: Parse error:', parseError.message);
          console.error('❌ DEBUG executeFlutterWebStart: Raw data that failed to parse:', data);
          reject(new Error(`Failed to parse Flutter web start response: ${parseError.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ DEBUG executeFlutterWebStart: Request error:', error.message);
      reject(new Error(`Flutter web start request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      console.error('❌ DEBUG executeFlutterWebStart: Request timeout');
      req.destroy();
      reject(new Error('Flutter web start request timeout'));
    });
    
    req.write(postData);
    req.end();
    console.log('🔍 DEBUG executeFlutterWebStart: Request sent, waiting for response...');
  });
}

// Check if a command is a Flutter web command
function isFlutterWebCommand(command) {
  if (!command) return false;
  
  const cmdLower = command.toLowerCase().trim();
  
  // Match common Flutter web commands and variations
  return (
    // CRITICAL: Include basic flutter run command
    cmdLower === 'flutter run' ||
    
    // Exact matches for start web server commands
    cmdLower === 'flutter web dev' || 
    cmdLower === 'start flutter web' ||
    cmdLower === 'flutter start web' ||
    cmdLower === 'flutter web start' ||
    
    // Partial matches for run commands with web options
    cmdLower.includes('flutter run -d web') ||
    cmdLower.includes('flutter run --web') ||
    cmdLower.includes('flutter run --device=web') ||
    cmdLower.includes('flutter run -d chrome') ||
    cmdLower.includes('flutter run -d web-server') ||
    
    // Any Flutter command with web-port parameter
    (cmdLower.startsWith('flutter') && cmdLower.includes('--web-port'))
  );
}

module.exports = {
  executeFlutterWebStart,
  isFlutterWebCommand
};