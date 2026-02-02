const os = require('os');
const fs = require('fs');
const path = require('path');

function getLocalIP() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prefer Wi-Fi or Ethernet interfaces
        if (name.toLowerCase().includes('wi-fi') ||
          name.toLowerCase().includes('wifi') ||
          name.toLowerCase().includes('ethernet') ||
          name.toLowerCase().includes('en0') ||
          name.toLowerCase().includes('eth0') ||
          name.startsWith('192.168') ||
          iface.address.startsWith('192.168')) {
          return iface.address;
        }
      }
    }
  }

  // Fallback: return any non-internal IPv4
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return '127.0.0.1';
}

function updateEnvFile(ip) {
  const envPath = path.join(__dirname, '..', '.env');
  const envExamplePath = path.join(__dirname, '..', '.env.example');

  let envContent = '';

  // Read existing .env or .env.example
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else if (fs.existsSync(envExamplePath)) {
    envContent = fs.readFileSync(envExamplePath, 'utf8');
  }

  // Update or add LOCAL_IP
  if (envContent.includes('LOCAL_IP=')) {
    envContent = envContent.replace(/LOCAL_IP=.*/g, `LOCAL_IP=${ip}`);
  } else {
    envContent += `\nLOCAL_IP=${ip}\n`;
  }

  // Only set API/WS URLs if they don't already exist in .env
  // (allows manual override for remote backends like Hetzner)
  const apiUrl = envContent.match(/EXPO_PUBLIC_API_URL=(.*)/)?.[1] || `http://${ip}:3000`;
  const wsUrl = envContent.match(/EXPO_PUBLIC_WS_URL=(.*)/)?.[1] || `ws://${ip}:3000`;

  if (!envContent.includes('EXPO_PUBLIC_API_URL=')) {
    envContent += `EXPO_PUBLIC_API_URL=${apiUrl}\n`;
  }

  if (!envContent.includes('EXPO_PUBLIC_WS_URL=')) {
    envContent += `EXPO_PUBLIC_WS_URL=${wsUrl}\n`;
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n');

  return { ip, apiUrl, wsUrl };
}

function updateBackendEnv(ip) {
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  const envExamplePath = path.join(__dirname, '..', 'backend', '.env.example');

  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else if (fs.existsSync(envExamplePath)) {
    envContent = fs.readFileSync(envExamplePath, 'utf8');
  }

  // Update or add HOST
  if (envContent.includes('HOST=')) {
    envContent = envContent.replace(/HOST=.*/g, `HOST=${ip}`);
  } else {
    envContent += `\nHOST=${ip}\n`;
  }

  if (envContent.trim()) {
    fs.writeFileSync(envPath, envContent.trim() + '\n');
  }
}

// Main execution
const ip = getLocalIP();
const config = updateEnvFile(ip);
updateBackendEnv(ip);

console.log('');
console.log('='.repeat(50));
console.log('  Network Configuration Updated');
console.log('='.repeat(50));
console.log(`  Local IP:    ${ip}`);
console.log(`  API URL:     ${config.apiUrl}`);
console.log(`  WebSocket:   ${config.wsUrl}`);
console.log('='.repeat(50));
console.log('');

// Export IP for use in npm scripts
process.stdout.write(ip);
