#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');
const os = require('os');

console.log('🚀 Setting up Drape development environment...\n');

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase());
    });
  });
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function setup() {
  // Check if .env already exists
  if (fs.existsSync('.env')) {
    console.log('⚠️  .env already exists');
    const answer = await askQuestion('Overwrite with template? (y/n): ');
    
    if (answer === 'y' || answer === 'yes') {
      fs.copyFileSync('.env.example', '.env');
      console.log('✅ Overwritten .env with template');
    } else {
      console.log('✅ Keeping existing .env');
    }
  } else {
    // Copy .env.example to .env
    if (fs.existsSync('.env.example')) {
      fs.copyFileSync('.env.example', '.env');
      console.log('✅ Created .env from template');
    } else {
      console.log('❌ .env.example not found');
      process.exit(1);
    }
  }

  // Get local IP for mobile development
  const localIP = getLocalIP();
  console.log(`\n📱 Your local IP: ${localIP}`);
  console.log(`   Update EXPO_PUBLIC_API_URL in .env to: http://${localIP}:3000\n`);

  // Install dependencies if needed
  if (!fs.existsSync('node_modules')) {
    console.log('📦 Installing frontend dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  }

  // Install backend dependencies
  if (!fs.existsSync('backend/node_modules')) {
    console.log('📦 Installing backend dependencies...');
    execSync('cd backend && npm install', { stdio: 'inherit', shell: true });
  }

  console.log('\n✅ Setup complete!\n');
  console.log('📋 Next steps:');
  console.log('   1. Update .env with your Firebase credentials');
  console.log('   2. Create service account: npm run setup:backend');
  console.log('   3. Start backend: cd backend && node server.js');
  console.log('   4. Start app: npm start\n');
}

setup();
