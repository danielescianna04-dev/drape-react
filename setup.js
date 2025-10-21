#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Drape development environment...');

// Check if .env already exists
if (fs.existsSync('.env')) {
  console.log('✅ .env already exists, skipping setup');
  process.exit(0);
}

// Copy .env.example to .env
if (fs.existsSync('.env.example')) {
  fs.copyFileSync('.env.example', '.env');
  console.log('✅ Created .env from template');
} else {
  console.log('❌ .env.example not found');
  process.exit(1);
}

// Install dependencies if needed
if (!fs.existsSync('node_modules')) {
  console.log('📦 Installing dependencies...');
  require('child_process').execSync('npm install', { stdio: 'inherit' });
}

console.log('✅ Setup complete! Run: npm start');
