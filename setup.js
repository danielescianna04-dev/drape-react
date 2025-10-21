#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');

console.log('🚀 Setting up Drape development environment...');

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

  // Install dependencies if needed
  if (!fs.existsSync('node_modules')) {
    console.log('📦 Installing dependencies...');
    require('child_process').execSync('npm install', { stdio: 'inherit' });
  }

  console.log('✅ Setup complete! Run: npm start');
}

setup();
